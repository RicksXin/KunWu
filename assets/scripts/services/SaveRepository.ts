/**
 * 存档读写与备份轮转（技术方案 §13、PRD-10 §4、任务 P0-TECH-002）。
 *
 * 职责边界：只负责持久化与迁移，不做业务计算。
 * 依赖 SaveBackend 接口而非 IndexedDB，故可在 Node 下单测。
 */

import type { SaveBackend, SaveTransaction } from './SaveBackend';
import type { SaveEnvelope, SaveMigration } from './SaveService';
import { CURRENT_SCHEMA_VERSION } from './SaveService';
import { computeChecksum } from './SaveChecksum';

/** 主档在 profiles store 中的固定键。MVP 只有单档。 */
export const PRIMARY_PROFILE_KEY = 'primary';

/** 备份保留数量。超出后淘汰最旧的一份。 */
export const MAX_BACKUPS = 3;

export type SaveLoadStatus =
    /** 主档正常。 */
    | 'ok'
    /** 主档损坏或缺失，已回退到备份。 */
    | 'recovered_from_backup'
    /** 主档与备份都不可用，属于新游戏或彻底坏档。 */
    | 'empty';

export interface SaveLoadResult {
    readonly status: SaveLoadStatus;
    readonly envelope: SaveEnvelope | null;
    /** 回退或失败的原因，用于错误页展示（PRD-10 §8）。 */
    readonly diagnostics: readonly string[];
}

export interface SaveRepositoryOptions {
    readonly gameVersion: string;
    /** 注入以便测试固定时间；默认取本地 UTC 秒。 */
    readonly nowUtcSeconds?: () => number;
    /** schema 版本 → 升级到下一版本的迁移函数。 */
    readonly migrations?: ReadonlyMap<number, SaveMigration>;
}

export class SaveRepository {
    private readonly backend: SaveBackend;
    private readonly gameVersion: string;
    private readonly now: () => number;
    private readonly migrations: ReadonlyMap<number, SaveMigration>;

    constructor(backend: SaveBackend, options: SaveRepositoryOptions) {
        this.backend = backend;
        this.gameVersion = options.gameVersion;
        this.now = options.nowUtcSeconds ?? (() => Math.floor(Date.now() / 1000));
        this.migrations = options.migrations ?? new Map();
    }

    /**
     * 写入流程（PRD-10 §4）：
     *   1. 序列化并计算校验
     *   2. 旧主档进入 backups
     *   3. 同一 transaction 写入新主档
     *   4. 失败保留旧档（由 backend 的事务回滚保证）
     */
    async save(payload: Readonly<Record<string, unknown>>): Promise<SaveEnvelope> {
        const envelope: SaveEnvelope = {
            schema_version: CURRENT_SCHEMA_VERSION,
            game_version: this.gameVersion,
            saved_at_utc: this.now(),
            checksum: computeChecksum(payload),
            payload,
        };

        await this.backend.transact(['profiles', 'backups'], async (tx) => {
            const previous = await tx.get<SaveEnvelope>('profiles', PRIMARY_PROFILE_KEY);
            if (previous) {
                await this.pushBackup(tx, previous);
            }
            await tx.put('profiles', PRIMARY_PROFILE_KEY, envelope);
        });

        return envelope;
    }

    /**
     * 加载主档。主档损坏时自动尝试最新备份（PRD-10 §4）。
     * 不静默失败——回退原因通过 diagnostics 返回，供错误提示使用。
     */
    async load(): Promise<SaveLoadResult> {
        const diagnostics: string[] = [];

        return this.backend.transact(['profiles', 'backups'], async (tx) => {
            const primary = await tx.get<unknown>('profiles', PRIMARY_PROFILE_KEY);
            const primaryResult = this.tryAccept(primary, '主档', diagnostics);
            if (primaryResult) {
                return { status: 'ok' as const, envelope: primaryResult, diagnostics };
            }

            // 备份键按时间戳升序，从最新一份开始回退
            const backupKeys = (await tx.keys('backups')).slice().sort();
            for (const key of backupKeys.reverse()) {
                const candidate = await tx.get<unknown>('backups', key);
                const accepted = this.tryAccept(candidate, `备份 ${key}`, diagnostics);
                if (accepted) {
                    return {
                        status: 'recovered_from_backup' as const,
                        envelope: accepted,
                        diagnostics,
                    };
                }
            }

            return { status: 'empty' as const, envelope: null, diagnostics };
        });
    }

    /**
     * 校验并迁移一份候选存档。
     * 任何一步失败都记录原因并返回 null，让调用方继续尝试下一个来源。
     */
    private tryAccept(
        candidate: unknown,
        label: string,
        diagnostics: string[],
    ): SaveEnvelope | null {
        if (candidate === undefined || candidate === null) {
            diagnostics.push(`${label}不存在`);
            return null;
        }

        const envelope = candidate as Partial<SaveEnvelope>;
        if (typeof envelope.schema_version !== 'number' || typeof envelope.payload !== 'object') {
            diagnostics.push(`${label}结构非法`);
            return null;
        }

        const actual = computeChecksum(envelope.payload as Record<string, unknown>);
        if (envelope.checksum !== actual) {
            diagnostics.push(`${label}校验值不匹配（期望 ${envelope.checksum}，实际 ${actual}）`);
            return null;
        }

        // 比当前版本更新的存档不能降级读取：未知字段的语义无从推断
        if (envelope.schema_version > CURRENT_SCHEMA_VERSION) {
            diagnostics.push(
                `${label}版本 ${envelope.schema_version} 高于本体 ${CURRENT_SCHEMA_VERSION}，拒绝加载`,
            );
            return null;
        }

        try {
            return this.migrate(envelope as SaveEnvelope, diagnostics);
        } catch (error) {
            diagnostics.push(`${label}迁移失败：${(error as Error).message}`);
            return null;
        }
    }

    /** 逐版本迁移到当前版本。缺少中间迁移即抛错，不跳版。 */
    private migrate(envelope: SaveEnvelope, diagnostics: string[]): SaveEnvelope {
        let version = envelope.schema_version;
        let payload = envelope.payload as Record<string, unknown>;

        while (version < CURRENT_SCHEMA_VERSION) {
            const migration = this.migrations.get(version);
            if (!migration) {
                throw new Error(`缺少 v${version} → v${version + 1} 的迁移函数`);
            }
            payload = migration(payload);
            version += 1;
            diagnostics.push(`已迁移至 v${version}`);
        }

        if (version === envelope.schema_version) {
            return envelope;
        }

        // 迁移后 payload 变了，校验值必须重算，否则下次加载会误判损坏
        return {
            ...envelope,
            schema_version: version,
            checksum: computeChecksum(payload),
            payload,
        };
    }

    /** 追加备份并淘汰最旧的，保持数量不超过 MAX_BACKUPS。 */
    private async pushBackup(tx: SaveTransaction, envelope: SaveEnvelope): Promise<void> {
        // 键含时间戳以便排序；同秒内多次保存用已有键数量补足唯一性
        const existing = await tx.keys('backups');
        const key = `backup_${String(envelope.saved_at_utc).padStart(12, '0')}_${existing.length}`;
        await tx.put('backups', key, envelope);

        const all = [...existing, key].sort();
        for (const stale of all.slice(0, Math.max(0, all.length - MAX_BACKUPS))) {
            await tx.delete('backups', stale);
        }
    }
}
