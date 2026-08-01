import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SaveRepository, PRIMARY_PROFILE_KEY } from 'db://assets/scripts/services/SaveRepository';
import { MemorySaveBackend } from 'db://assets/scripts/services/MemorySaveBackend';
import type { SaveMigration } from 'db://assets/scripts/services/SaveService';
import { CURRENT_SCHEMA_VERSION } from 'db://assets/scripts/services/SaveService';
import { computeChecksum } from 'db://assets/scripts/services/SaveChecksum';

/**
 * 迁移测试不依赖 CURRENT_SCHEMA_VERSION 的具体值：
 * 该常量会随版本递增，写死会让测试在下次升版时失效。
 * 这里构造一个从 v1 起的迁移链，只断言链路行为。
 */
function seedOldSave(
    backend: MemorySaveBackend,
    schemaVersion: number,
    payload: Record<string, unknown>,
): void {
    backend.seedRaw(
        'profiles',
        PRIMARY_PROFILE_KEY,
        JSON.stringify({
            schema_version: schemaVersion,
            game_version: '0.0.1',
            saved_at_utc: 1_000,
            checksum: computeChecksum(payload),
            payload,
        }),
    );
}

function completeMigrationChain(first: SaveMigration): Map<number, SaveMigration> {
    const migrations = new Map<number, SaveMigration>();
    for (let version = 0; version < CURRENT_SCHEMA_VERSION; version += 1) {
        migrations.set(version, version === 0 ? first : (payload) => payload);
    }
    return migrations;
}

describe('存档迁移', () => {
    test('缺少中间迁移函数时拒绝加载并说明原因', async () => {
        const backend = new MemorySaveBackend();
        // 构造一个必然低于当前版本的存档：版本 0
        seedOldSave(backend, 0, { grain: 1 });

        const repo = new SaveRepository(backend, {
            gameVersion: '0.1.0',
            nowUtcSeconds: () => 2_000,
            migrations: new Map(),
        });

        const result = await repo.load();
        assert.equal(result.status, 'empty');
        assert.ok(result.diagnostics.some((line) => line.includes('缺少 v0')));
    });

    test('存在迁移函数时逐版本升级并重算校验值', async () => {
        const backend = new MemorySaveBackend();
        seedOldSave(backend, 0, { grain: 10 });

        const addField: SaveMigration = (payload) => ({ ...payload, migrated: true });
        const repo = new SaveRepository(backend, {
            gameVersion: '0.1.0',
            nowUtcSeconds: () => 2_000,
            migrations: completeMigrationChain(addField),
        });

        const result = await repo.load();
        assert.equal(result.status, 'ok');
        assert.equal((result.envelope?.payload as Record<string, unknown>).migrated, true);
        // 迁移后校验值必须与新 payload 一致，否则下次加载会误判损坏
        assert.equal(
            result.envelope?.checksum,
            computeChecksum(result.envelope?.payload as Record<string, unknown>),
        );
    });

    test('迁移后的存档再次保存与加载保持一致', async () => {
        const backend = new MemorySaveBackend();
        seedOldSave(backend, 0, { grain: 10 });

        const repo = new SaveRepository(backend, {
            gameVersion: '0.1.0',
            nowUtcSeconds: () => 2_000,
            migrations: completeMigrationChain((payload) => ({
                ...payload,
                migrated: true,
            })),
        });

        const migrated = await repo.load();
        await repo.save(migrated.envelope!.payload as Record<string, unknown>);

        const reloaded = await repo.load();
        assert.equal(reloaded.status, 'ok');
        assert.deepEqual(reloaded.envelope?.payload, migrated.envelope?.payload);
    });

    test('迁移函数抛错时回退备份而非崩溃', async () => {
        const backend = new MemorySaveBackend();
        seedOldSave(backend, 0, { grain: 10 });

        const repo = new SaveRepository(backend, {
            gameVersion: '0.1.0',
            nowUtcSeconds: () => 2_000,
            migrations: completeMigrationChain(() => {
                throw new Error('字段解析失败');
            }),
        });

        const result = await repo.load();
        assert.equal(result.status, 'empty');
        assert.ok(result.diagnostics.some((line) => line.includes('迁移失败')));
    });

    test('20 份历史存档全部可迁移（PRD-10 §11）', async () => {
        const migrations = completeMigrationChain((payload) => ({
            ...payload,
            upgraded: true,
        }));

        for (let i = 0; i < 20; i += 1) {
            const backend = new MemorySaveBackend();
            seedOldSave(backend, 0, { grain: i, heroes: [`hero_${i}`] });
            const repo = new SaveRepository(backend, {
                gameVersion: '0.1.0',
                nowUtcSeconds: () => 2_000 + i,
                migrations,
            });

            const result = await repo.load();
            assert.equal(result.status, 'ok', `第 ${i} 份存档迁移失败`);
            const payload = result.envelope?.payload as Record<string, unknown>;
            assert.equal(payload.grain, i);
            assert.equal(payload.upgraded, true);
        }
    });
});
