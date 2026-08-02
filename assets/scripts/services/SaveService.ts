/**
 * 存档原子写入、备份与版本迁移（技术方案 §4.1、§13）。
 *
 * 职责边界：只负责持久化，不做业务计算。
 * 具体 IndexedDB 实现见任务 P0-TECH-002。
 */

export const SAVE_DB_NAME = 'kunwu_game';
export const SAVE_STORES = ['profiles', 'backups', 'settings', 'telemetry_local'] as const;
export type SaveStore = (typeof SAVE_STORES)[number];

/**
 * 当前存档结构版本。每次改变 Schema 递增，并新增迁移函数。
 *
 * v3：roster 的 attributes 与 maxHp 按 Docs/13 §3 的新成长曲线重算
 *     （七维全维成长、旧品级同时影响初始值）。见 migrateProfileV2ToV3。
 * v4：增加修士灵息、队伍预设、入山携带物与自然恢复结算锚点。
 * v5：旧七档品级迁移为六档 spiritualRootId，并为修士保存稳定 realmId。
 * v6：增加永久地图对象完成状态，防止事件和宝箱重复触发、重复领奖。
 */
export const CURRENT_SCHEMA_VERSION = 6;

export interface SaveEnvelope {
    readonly schema_version: number;
    readonly game_version: string;
    readonly saved_at_utc: number;
    readonly checksum: string;
    readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * 迁移函数签名。
 * 新增迁移时追加，不修改历史迁移——历史迁移一旦改动，
 * 已按旧逻辑升级过的存档将无法复现升级路径。
 */
export type SaveMigration = (payload: Record<string, unknown>) => Record<string, unknown>;

export interface SaveServiceApi {
    /**
     * 写入流程（技术方案 §13）：
     * 序列化 → 计算校验 → 旧主档写入备份 → 同一 transaction 写新主档
     */
    save(payload: Record<string, unknown>): Promise<void>;

    /** 加载失败时自动尝试备份并记录错误。 */
    load(): Promise<SaveEnvelope | null>;

    /** 导出为带版本与校验的 .kwsave 文件（PRD-10 P2-TECH-004）。 */
    exportToFile(): Promise<Blob>;

    /** 导入前校验并预览档案时间，确认后才覆盖。 */
    importFromFile(file: File): Promise<SaveEnvelope>;
}
