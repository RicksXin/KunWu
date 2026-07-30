import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    createDefaultProfile,
    deserializeProfile,
    serializeProfile,
} from 'db://assets/scripts/services/ProfileCodec';
import { GridCoord } from 'db://assets/scripts/domain/GridCoord';
import { maxHp } from 'db://assets/scripts/domain/CombatFormulas';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

function loadSeed(): unknown {
    return JSON.parse(
        readFileSync(
            path.join(REPO_ROOT, 'assets/bundles/shared/default_profile.json'),
            'utf8',
        ),
    );
}

describe('新档 Profile', () => {
    test('包含初始资源、营地和四名修士', () => {
        const profile = createDefaultProfile(loadSeed(), 1_000);

        assert.equal(profile.wallet.spiritGrain, 120);
        assert.equal(profile.camp.buildingLevels.ling_pu, 1);
        assert.equal(profile.roster.length, 4);
        assert.equal(new Set(profile.roster.map((hero) => hero.instanceId)).size, 4);
        assert.ok(profile.roster.every((hero) => hero.skillIds.length === 3));
    });

    test('产出结算时间使用创建时间，不信任数据种子的 0', () => {
        const profile = createDefaultProfile(loadSeed(), 12_345);
        assert.equal(profile.camp.lastSettledAtUtc, 12_345);
    });

    test('新档必须恰好有四名修士', () => {
        const seed = loadSeed() as { roster: unknown[] };
        seed.roster.pop();
        assert.throws(() => createDefaultProfile(seed, 1_000), /恰好包含 4 名/);
    });

    test('非安全整数资源被拒绝', () => {
        const seed = loadSeed() as { wallet: { spiritGrain: number } };
        seed.wallet.spiritGrain = 1.5;
        assert.throws(() => createDefaultProfile(seed, 1_000), /spiritGrain/);
    });

    test('修士 ID 重复被拒绝', () => {
        const seed = loadSeed() as { roster: { instanceId: string }[] };
        seed.roster[1]!.instanceId = seed.roster[0]!.instanceId;
        assert.throws(() => createDefaultProfile(seed, 1_000), /重复修士/);
    });

    test('初始修士与职业、英雄主数据一致', () => {
        const profile = createDefaultProfile(loadSeed(), 1_000);
        const starting = JSON.parse(
            readFileSync(path.join(REPO_ROOT, 'assets/data/heroes/starting.json'), 'utf8'),
        ) as {
            instanceId: string;
            nameKey: string;
            careerId: string;
            grade: string;
            level: number;
        }[];

        for (const definition of starting) {
            const hero = profile.roster.find(
                (candidate) => candidate.instanceId === definition.instanceId,
            );
            assert.ok(hero, `新档缺少 ${definition.instanceId}`);
            assert.equal(hero.nameKey, definition.nameKey);
            assert.equal(hero.careerId, definition.careerId);
            assert.equal(hero.grade, definition.grade);
            assert.equal(hero.level, definition.level);

            const career = JSON.parse(
                readFileSync(
                    path.join(
                        REPO_ROOT,
                        'assets/data/careers',
                        `${definition.careerId}.json`,
                    ),
                    'utf8',
                ),
            ) as {
                baseAttributes: typeof hero.attributes;
                baseHp: number;
                skillIds: string[];
            };
            assert.deepEqual(hero.attributes, career.baseAttributes);
            assert.deepEqual(hero.skillIds, career.skillIds);
            assert.equal(
                hero.maxHp,
                maxHp(career.baseHp, career.baseAttributes.constitution),
            );
        }
    });
});

describe('Profile 存档往返', () => {
    test('普通新档往返不丢数据', () => {
        const profile = createDefaultProfile(loadSeed(), 1_000);
        const restored = deserializeProfile(serializeProfile(profile));

        assert.deepEqual(restored.wallet, profile.wallet);
        assert.deepEqual(restored.roster, profile.roster);
        assert.equal(restored.camp.lastSettledAtUtc, 1_000);
    });

    test('Expedition 的 GridCoord 与 Set 能往返', () => {
        const profile = createDefaultProfile(loadSeed(), 1_000);
        profile.expedition = {
            mapId: 'map_01',
            position: new GridCoord(2, 3),
            remainingGrain: 88,
            revealedTiles: new Set(['1,1', '2,3']),
            temporaryLoot: { herb: 2 },
        };

        const restored = deserializeProfile(serializeProfile(profile));
        assert.ok(restored.expedition?.position instanceof GridCoord);
        assert.equal(restored.expedition?.position.toKey(), '2,3');
        assert.deepEqual(
            Array.from(restored.expedition?.revealedTiles ?? []).sort(),
            ['1,1', '2,3'],
        );
    });
});
