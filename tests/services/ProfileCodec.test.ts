import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    createDefaultProfile,
    deserializeProfile,
    migrateProfileV1ToV2,
    migrateProfileV2ToV3,
    migrateProfileV3ToV4,
    migrateProfileV4ToV5,
    serializeProfile,
} from 'db://assets/scripts/services/ProfileCodec';
import { instantiateHero } from 'db://assets/scripts/domain/HeroFactory';
import { parseBalanceTables } from 'db://assets/scripts/domain/BalanceTables';
import { GridCoord } from 'db://assets/scripts/domain/GridCoord';
import { maxHp } from 'db://assets/scripts/domain/CombatFormulas';
import { scaleBaseBySpiritualRoot } from 'db://assets/scripts/domain/HeroGrowth';
import type {
    RealmId,
    SpiritualRootId,
} from 'db://assets/scripts/domain/HeroGrowth';
import { createAttributes } from 'db://assets/scripts/domain/Attributes';

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
        assert.equal(profile.camp.workerCount, 6);
        assert.equal(profile.camp.resourceStorageLevels.spiritGrain, 1);
        assert.equal(profile.roster.length, 4);
        assert.equal(new Set(profile.roster.map((hero) => hero.instanceId)).size, 4);
        assert.ok(profile.roster.every((hero) => hero.skillIds.length === 3));
        assert.ok(profile.roster.every((hero) => hero.stamina === 100));
        assert.equal(profile.expeditionPreparation.partyPresets.length, 1);
        assert.deepEqual(
            profile.expeditionPreparation.partyPresets[0]?.slots,
            profile.roster.map((hero) => hero.instanceId),
        );
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

    test('初始修士与职业、修士主数据一致', () => {
        const profile = createDefaultProfile(loadSeed(), 1_000);
        const starting = JSON.parse(
            readFileSync(path.join(REPO_ROOT, 'assets/data/heroes/starting.json'), 'utf8'),
        ) as {
            instanceId: string;
            nameKey: string;
            careerId: string;
            spiritualRootId: SpiritualRootId;
            realmId: RealmId;
            level: number;
        }[];

        for (const definition of starting) {
            const hero = profile.roster.find(
                (candidate) => candidate.instanceId === definition.instanceId,
            );
            assert.ok(hero, `新档缺少 ${definition.instanceId}`);
            assert.equal(hero.nameKey, definition.nameKey);
            assert.equal(hero.careerId, definition.careerId);
            assert.equal(hero.spiritualRootId, definition.spiritualRootId);
            assert.equal(hero.realmId, definition.realmId);
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

            // 种子里的属性按灵根缩放；全部是 1 级角色，故成长为 0。
            const scaled = scaleBaseBySpiritualRoot(
                createAttributes(career.baseAttributes),
                definition.spiritualRootId,
            );
            assert.deepEqual(hero.attributes, scaled);
            assert.deepEqual(hero.skillIds, career.skillIds);
            assert.equal(hero.maxHp, maxHp(career.baseHp, scaled.constitution));
        }
    });

    test('伪灵根种子属性高于职业裸值，杂灵根等于裸值', () => {
        const profile = createDefaultProfile(loadSeed(), 1);
        for (const hero of profile.roster) {
            const career = JSON.parse(
                readFileSync(
                    path.join(REPO_ROOT, 'assets/data/careers', `${hero.careerId}.json`),
                    'utf8',
                ),
            ) as { baseAttributes: Record<string, number>; primaryAttribute: string };
            const raw = career.baseAttributes[career.primaryAttribute]!;
            const actual = hero.attributes[career.primaryAttribute as 'strength'];
            if (hero.spiritualRootId === 'mixed_root') {
                assert.equal(actual, raw, `${hero.instanceId} 杂灵根应等于裸值`);
            } else {
                assert.ok(
                    actual > raw,
                    `${hero.instanceId}（${hero.spiritualRootId}）主属性 ${actual} 未高于裸值 ${raw}`,
                );
            }
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
        assert.equal(restored.camp.workerCount, 6);
        assert.deepEqual(
            restored.camp.resourceStorageLevels,
            profile.camp.resourceStorageLevels,
        );
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

describe('Profile v1 → v2', () => {
    test('补齐杂役总数和三种资源存储等级', () => {
        const old = loadSeed() as Record<string, unknown>;
        const camp = old.camp as Record<string, unknown>;
        delete camp.workerCount;
        delete camp.resourceStorageLevels;

        const migrated = migrateProfileV1ToV2(old);
        const profile = deserializeProfile(migrated);
        assert.equal(profile.camp.workerCount, 6);
        assert.deepEqual(profile.camp.resourceStorageLevels, {
            spiritGrain: 1,
            spiritWood: 1,
            darkIron: 1,
        });
    });

    test('旧档分配超过 6 人时不制造非法总人数', () => {
        const old = loadSeed() as Record<string, unknown>;
        const camp = old.camp as Record<string, unknown>;
        delete camp.workerCount;
        delete camp.resourceStorageLevels;
        camp.workerAssignments = {
            spiritGrain: 5,
            spiritWood: 4,
            darkIron: 0,
            spiritStone: 0,
            gengJing: 0,
        };

        const profile = deserializeProfile(migrateProfileV1ToV2(old));
        assert.equal(profile.camp.workerCount, 9);
    });
});

describe('Profile v2 → v3（成长曲线变更）', () => {
    /** 构造一个带旧曲线面板的 v2 存档：七维只长主副维，maxHp 按旧值。 */
    function v2Save(overrides: Record<string, unknown> = {}): Record<string, unknown> {
        const seed = loadSeed() as Record<string, unknown>;
        delete seed.expeditionPreparation;
        return {
            ...seed,
            roster: [
                {
                    instanceId: 'hero_fa_xiu_01',
                    definitionId: 'hero_fa_xiu_01',
                    nameKey: 'hero.lu_qing',
                    careerId: 'fa_xiu',
                    grade: 'C',
                    level: 40,
                    // 旧曲线：法修只长 magic 与 technique，其余五维恒为初始值
                    attributes: {
                        strength: 4,
                        magic: 143,
                        technique: 95,
                        speed: 8,
                        constitution: 7,
                        armor: 4,
                        resistance: 11,
                    },
                    maxHp: 140,
                    currentHp: 140,
                    skillIds: ['ling_huo_dan', 'ning_shuang_hu', 'ling_neng_zhen_dang'],
                    isDead: false,
                    ...overrides,
                },
            ],
        };
    }

    test('重算后七维不再冻结，生命上限随等级提升', () => {
        const migrated = migrateProfileV2ToV3(v2Save());
        const hero = deserializeProfile(
            migrateProfileV4ToV5(migrateProfileV3ToV4(migrated)),
        ).roster[0]!;
        // 旧档 40 级法修的 constitution 恒为 7，maxHp 恒为 140
        assert.ok(hero.attributes.constitution > 7, '肉身仍是初始值，迁移未生效');
        assert.ok(hero.attributes.armor > 4, '护体仍是初始值，迁移未生效');
        assert.ok(hero.maxHp > 140, `生命上限 ${hero.maxHp} 未提升`);
    });

    test('maxHp 变大时 currentHp 不被拉高，保持原值', () => {
        const migrated = migrateProfileV2ToV3(v2Save({ currentHp: 50 }));
        const hero = deserializeProfile(
            migrateProfileV4ToV5(migrateProfileV3ToV4(migrated)),
        ).roster[0]!;
        assert.equal(hero.currentHp, 50);
    });

    test('maxHp 变小时 currentHp 被钳到新上限，读档不被拒绝', () => {
        // 若不钳制，heroOf 的 currentHp > maxHp 校验会抛错拒绝读档
        const migrated = migrateProfileV2ToV3(
            v2Save({ level: 1, currentHp: 9999, maxHp: 9999 }),
        );
        const v4 = migrateProfileV3ToV4(migrated);
        const v5 = migrateProfileV4ToV5(v4);
        const hero = deserializeProfile(v5).roster[0]!;
        assert.equal(hero.currentHp, hero.maxHp);
        assert.doesNotThrow(() => deserializeProfile(v5));
    });

    test('迁移结果与 instantiateHero 用当前表算出的面板一致', () => {
        // 迁移里的快照常量与 balance 表在 v3 时刻必须相同，
        // 否则旧档迁出来的角色与同等级新角色数值不一样
        const migrated = migrateProfileV2ToV3(v2Save());
        const hero = deserializeProfile(
            migrateProfileV4ToV5(migrateProfileV3ToV4(migrated)),
        ).roster[0]!;

        const careers = new Map(
            ['fa_xiu'].map((id) => [
                id,
                JSON.parse(
                    readFileSync(
                        path.join(REPO_ROOT, 'assets/data/careers', `${id}.json`),
                        'utf8',
                    ),
                ),
            ]),
        );
        const read = (name: string) =>
            JSON.parse(
                readFileSync(
                    path.join(REPO_ROOT, 'assets/data/balance', `${name}.json`),
                    'utf8',
                ),
            );
        const tables = parseBalanceTables({
            growth_rates: read('growth_rates'),
            spiritual_root_multipliers: read('spiritual_root_multipliers'),
            combat_constants: read('combat_constants'),
            production_rates: read('production_rates'),
            realm_ranges: read('realm_ranges'),
        });
        const fresh = instantiateHero(
            {
                instanceId: 'x',
                nameKey: 'x',
                careerId: 'fa_xiu',
                spiritualRootId: 'pseudo_root',
                realmId: 'yuan_ying',
                level: 40,
            },
            careers,
            {
                growthRates: tables.growthRates,
                spiritualRootMultipliers: tables.spiritualRootMultipliers,
                constitutionHpFactor: tables.combat.constitutionHpFactor,
            },
        );

        assert.deepEqual(
            hero.attributes,
            fresh.attributes.final,
            '迁移快照与当前 balance 表已漂移：改表时忘了同步 ProfileCodec 的 V3_* 常量',
        );
        assert.equal(hero.maxHp, fresh.maxHp);
    });

    test('未知职业保留原面板，不抹成 0', () => {
        const migrated = migrateProfileV2ToV3(v2Save({ careerId: 'ghost_xiu' }));
        const hero = (migrated.roster as Record<string, unknown>[])[0]!;
        assert.equal((hero.attributes as Record<string, number>).magic, 143);
        assert.equal(hero.maxHp, 140);
    });

    test('roster 为空时不报错', () => {
        const seed = loadSeed() as Record<string, unknown>;
        assert.doesNotThrow(() => migrateProfileV2ToV3({ ...seed, roster: [] }));
    });
});

describe('Profile v3 → v4（入山整备）', () => {
    test('补齐满灵息、初始 1 队与默认携带物', () => {
        const v3 = loadSeed() as Record<string, unknown>;
        delete v3.expeditionPreparation;
        const roster = v3.roster as Record<string, unknown>[];
        roster.forEach((hero) => delete hero.stamina);

        const profile = deserializeProfile(migrateProfileV3ToV4(v3));
        assert.ok(profile.roster.every((hero) => hero.stamina === 100));
        assert.equal(profile.expeditionPreparation.partyPresets.length, 1);
        assert.equal(profile.expeditionPreparation.activePresetId, 'party_01');
        assert.equal(profile.expeditionPreparation.loadout.spiritGrain, 60);
    });

    test('已有 v4 字段不被重复迁移覆盖', () => {
        const current = loadSeed() as Record<string, unknown>;
        const before = structuredClone(current.expeditionPreparation);
        const migrated = migrateProfileV3ToV4(current);
        assert.deepEqual(migrated.expeditionPreparation, before);
    });
});

describe('Profile v4 → v5（灵根与境界）', () => {
    test('旧品级映射为六档灵根并移除 grade', () => {
        const v4 = loadSeed() as Record<string, unknown>;
        const roster = v4.roster as Record<string, unknown>[];
        const legacyGrades = ['D', 'C', 'B', 'A'] as const;
        roster.forEach((hero, index) => {
            delete hero.spiritualRootId;
            delete hero.realmId;
            hero.grade = legacyGrades[index];
        });

        const migrated = migrateProfileV4ToV5(v4);
        const migratedRoster = migrated.roster as Record<string, unknown>[];
        assert.deepEqual(
            migratedRoster.map((hero) => hero.spiritualRootId),
            ['mixed_root', 'pseudo_root', 'triple_root', 'dual_root'],
        );
        assert.ok(migratedRoster.every((hero) => !('grade' in hero)));
        assert.ok(migratedRoster.every((hero) => hero.realmId === 'lian_qi'));
        assert.doesNotThrow(() => deserializeProfile(migrated));
    });

    test('旧 SS 与 SSS 都映射为异灵根，境界由等级冻结', () => {
        const v4 = loadSeed() as Record<string, unknown>;
        const roster = v4.roster as Record<string, unknown>[];
        roster.splice(2);
        for (const [index, grade] of ['SS', 'SSS'].entries()) {
            const hero = roster[index]!;
            delete hero.spiritualRootId;
            delete hero.realmId;
            hero.grade = grade;
            hero.level = index === 0 ? 12 : 51;
        }

        const migrated = migrateProfileV4ToV5(v4);
        const migratedRoster = migrated.roster as Record<string, unknown>[];
        assert.deepEqual(
            migratedRoster.map((hero) => hero.spiritualRootId),
            ['variant_root', 'variant_root'],
        );
        assert.deepEqual(
            migratedRoster.map((hero) => hero.realmId),
            ['zhu_ji', 'lian_xu'],
        );
    });
});
