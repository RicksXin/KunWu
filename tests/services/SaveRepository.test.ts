import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    SaveRepository,
    PRIMARY_PROFILE_KEY,
    MAX_BACKUPS,
} from 'db://assets/scripts/services/SaveRepository';
import { MemorySaveBackend } from 'db://assets/scripts/services/MemorySaveBackend';
import { CURRENT_SCHEMA_VERSION } from 'db://assets/scripts/services/SaveService';
import { computeChecksum } from 'db://assets/scripts/services/SaveChecksum';

function makeRepo(backend: MemorySaveBackend, now = 1_000) {
    let clock = now;
    return {
        repo: new SaveRepository(backend, {
            gameVersion: '0.1.0',
            nowUtcSeconds: () => clock,
        }),
        advance: (seconds: number) => {
            clock += seconds;
        },
    };
}

describe('SaveRepository.save', () => {
    test('写入的 envelope 含版本、时间与校验值', async () => {
        const backend = new MemorySaveBackend();
        const { repo } = makeRepo(backend, 5_000);
        const envelope = await repo.save({ grain: 100 });

        assert.equal(envelope.schema_version, CURRENT_SCHEMA_VERSION);
        assert.equal(envelope.game_version, '0.1.0');
        assert.equal(envelope.saved_at_utc, 5_000);
        assert.equal(envelope.checksum, computeChecksum({ grain: 100 }));
    });

    test('首次保存不产生备份', async () => {
        const backend = new MemorySaveBackend();
        const { repo } = makeRepo(backend);
        await repo.save({ grain: 1 });
        assert.deepEqual(backend.rawKeys('backups'), []);
    });

    test('二次保存把旧主档移入备份', async () => {
        const backend = new MemorySaveBackend();
        const { repo, advance } = makeRepo(backend);
        await repo.save({ grain: 1 });
        advance(60);
        await repo.save({ grain: 2 });

        assert.equal(backend.rawKeys('backups').length, 1);
        const loaded = await repo.load();
        assert.deepEqual(loaded.envelope?.payload, { grain: 2 });
    });

    test('备份数量超过上限时淘汰最旧的', async () => {
        const backend = new MemorySaveBackend();
        const { repo, advance } = makeRepo(backend);
        for (let i = 0; i <= MAX_BACKUPS + 2; i += 1) {
            await repo.save({ step: i });
            advance(60);
        }
        assert.equal(backend.rawKeys('backups').length, MAX_BACKUPS);
    });

    test('提交失败时旧主档完整保留', async () => {
        const backend = new MemorySaveBackend();
        const { repo, advance } = makeRepo(backend);
        await repo.save({ grain: 1 });
        advance(60);

        backend.failNextCommit = true;
        await assert.rejects(() => repo.save({ grain: 999 }), /模拟提交失败/);

        // PRD-10 §4：失败保留旧档
        const loaded = await repo.load();
        assert.equal(loaded.status, 'ok');
        assert.deepEqual(loaded.envelope?.payload, { grain: 1 });
    });
});

describe('SaveRepository.load', () => {
    test('空库返回 empty 而非抛错', async () => {
        const backend = new MemorySaveBackend();
        const { repo } = makeRepo(backend);
        const result = await repo.load();
        assert.equal(result.status, 'empty');
        assert.equal(result.envelope, null);
    });

    test('往返读写保持 payload 相等', async () => {
        const backend = new MemorySaveBackend();
        const { repo } = makeRepo(backend);
        const payload = { grain: 42, heroes: ['a', 'b'], flags: { intro: true } };
        await repo.save(payload);
        const result = await repo.load();
        assert.equal(result.status, 'ok');
        assert.deepEqual(result.envelope?.payload, payload);
    });

    test('主档校验值不匹配时回退到备份', async () => {
        const backend = new MemorySaveBackend();
        const { repo, advance } = makeRepo(backend);
        await repo.save({ grain: 1 });
        advance(60);
        await repo.save({ grain: 2 });

        // 篡改主档 payload 但不更新 checksum，模拟坏档或手改档
        const tampered = {
            schema_version: CURRENT_SCHEMA_VERSION,
            game_version: '0.1.0',
            saved_at_utc: 2_000,
            checksum: 'deadbeef',
            payload: { grain: 99999 },
        };
        backend.seedRaw('profiles', PRIMARY_PROFILE_KEY, JSON.stringify(tampered));

        const result = await repo.load();
        assert.equal(result.status, 'recovered_from_backup');
        assert.deepEqual(result.envelope?.payload, { grain: 1 });
        assert.ok(result.diagnostics.some((line) => line.includes('校验值不匹配')));
    });

    test('主档结构非法时回退备份', async () => {
        const backend = new MemorySaveBackend();
        const { repo, advance } = makeRepo(backend);
        await repo.save({ grain: 7 });
        advance(60);
        await repo.save({ grain: 8 });

        backend.seedRaw('profiles', PRIMARY_PROFILE_KEY, JSON.stringify({ garbage: true }));
        const result = await repo.load();
        assert.equal(result.status, 'recovered_from_backup');
        assert.ok(result.diagnostics.some((line) => line.includes('结构非法')));
    });

    test('主档与备份都损坏时返回 empty 并带诊断', async () => {
        const backend = new MemorySaveBackend();
        const { repo } = makeRepo(backend);
        backend.seedRaw('profiles', PRIMARY_PROFILE_KEY, JSON.stringify({ bad: 1 }));
        backend.seedRaw('backups', 'backup_000000001000_0', JSON.stringify({ bad: 2 }));

        const result = await repo.load();
        assert.equal(result.status, 'empty');
        assert.equal(result.envelope, null);
        assert.ok(result.diagnostics.length >= 2);
    });

    test('拒绝加载高于本体版本的存档', async () => {
        const backend = new MemorySaveBackend();
        const { repo } = makeRepo(backend);
        const payload = { grain: 1 };
        backend.seedRaw(
            'profiles',
            PRIMARY_PROFILE_KEY,
            JSON.stringify({
                schema_version: CURRENT_SCHEMA_VERSION + 5,
                game_version: '9.9.9',
                saved_at_utc: 1_000,
                checksum: computeChecksum(payload),
                payload,
            }),
        );

        const result = await repo.load();
        // PRD-10 §5：不兼容的新版本拒绝导入并显示原因
        assert.equal(result.status, 'empty');
        assert.ok(result.diagnostics.some((line) => line.includes('高于本体')));
    });

    test('连续 20 次保存后主档仍可加载', async () => {
        const backend = new MemorySaveBackend();
        const { repo, advance } = makeRepo(backend);
        for (let i = 0; i < 20; i += 1) {
            await repo.save({ step: i });
            advance(30);
        }
        // PRD-10 §11：连续刷新 20 次不坏档
        const result = await repo.load();
        assert.equal(result.status, 'ok');
        assert.deepEqual(result.envelope?.payload, { step: 19 });
    });
});
