import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
    assertGrowthRatesCoverCareers,
    assertPrimaryAttributeMatchesGrowth,
    defenseLevelConstantAt,
    parseBalanceTables,
    parseCombatConstants,
    parseGradeMultipliers,
    parseGrowthRates,
    parseProductionRates,
    parseRealmRanges,
    stripCommentKeys,
    GROWTH_RATE_SCALE,
} from 'db://assets/scripts/domain/BalanceTables';
import { ATTRIBUTE_KEYS } from 'db://assets/scripts/domain/Attributes';
import type { AttributeKey } from 'db://assets/scripts/domain/Attributes';
import { HERO_GRADES } from 'db://assets/scripts/domain/HeroGrowth';
import { PRODUCTION_JOBS } from 'db://assets/scripts/domain/Production';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const BALANCE_DIR = path.join(REPO_ROOT, 'assets/data/balance');

function readTable(name: string): unknown {
    return JSON.parse(readFileSync(path.join(BALANCE_DIR, `${name}.json`), 'utf8'));
}

function loadTables() {
    return parseBalanceTables({
        growth_rates: readTable('growth_rates'),
        grade_multipliers: readTable('grade_multipliers'),
        combat_constants: readTable('combat_constants'),
        production_rates: readTable('production_rates'),
        realm_ranges: readTable('realm_ranges'),
    });
}

function careerFilesFromDisk(): { id: string; primaryAttribute: AttributeKey }[] {
    const dir = path.join(REPO_ROOT, 'assets/data/careers');
    return readdirSync(dir)
        .filter((name) => name.endsWith('.json'))
        .map((name) => JSON.parse(readFileSync(path.join(dir, name), 'utf8')));
}

function careerIdsFromDisk(): string[] {
    return careerFilesFromDisk().map((career) => career.id);
}

describe('平衡表解析', () => {
    test('仓库内的五张表全部解析通过', () => {
        const tables = loadTables();
        assert.ok(Object.keys(tables.growthRates).length > 0);
        assert.ok(tables.combat.constitutionHpFactor > 0);
        assert.ok(tables.production.cycleSeconds > 0);
        assert.ok(tables.realms.realms.length > 0);
    });

    test('成长率表的职业集合与 careers 表完全一致', () => {
        const tables = loadTables();
        assert.doesNotThrow(() =>
            assertGrowthRatesCoverCareers(tables.growthRates, careerIdsFromDisk()),
        );
    });

    test('剥掉 // 注释键后只剩数据', () => {
        const stripped = stripCommentKeys({ '//why': '说明', a: 1 });
        assert.deepEqual(stripped, { a: 1 });
    });
});

describe('成长率表', () => {
    test('七维必须全部提供', () => {
        const partial: Record<string, number> = {};
        for (const key of ATTRIBUTE_KEYS) {
            partial[key] = 1000;
        }
        delete partial.armor;
        assert.throws(() => parseGrowthRates({ wu_xiu: partial }), /armor/);
    });

    test('拒绝未知属性键，避免拼错字段静默变成零成长', () => {
        const rates: Record<string, number> = {};
        for (const key of ATTRIBUTE_KEYS) {
            rates[key] = 1000;
        }
        rates.strenght = 3000;
        assert.throws(() => parseGrowthRates({ wu_xiu: rates }), /未知属性键/);
    });

    test('成长率为 0 被拒绝：该维会终身冻结', () => {
        const rates: Record<string, number> = {};
        for (const key of ATTRIBUTE_KEYS) {
            rates[key] = 1000;
        }
        rates.armor = 0;
        assert.throws(() => parseGrowthRates({ ti_xiu: rates }), /armor 不得为 0.*终身冻结/s);
    });

    test('仓库内的表七维成长率全为正', () => {
        const tables = loadTables();
        for (const [careerId, rates] of Object.entries(tables.growthRates)) {
            for (const key of ATTRIBUTE_KEYS) {
                assert.ok(rates[key] > 0, `${careerId}.${key} 成长率非正`);
            }
        }
    });

    test('每个职业至少有一个主维达到千分位满值 3.0', () => {
        const tables = loadTables();
        for (const [careerId, rates] of Object.entries(tables.growthRates)) {
            const primaries = ATTRIBUTE_KEYS.filter(
                (key) => rates[key] >= 3 * GROWTH_RATE_SCALE,
            );
            assert.ok(
                primaries.length >= 1,
                `${careerId} 没有任何维度达到主维档位，职业缺少身份维度`,
            );
        }
    });

    test('careers 声明的主属性与成长率最高维一致', () => {
        const tables = loadTables();
        const careers = careerFilesFromDisk();
        assert.doesNotThrow(() =>
            assertPrimaryAttributeMatchesGrowth(tables.growthRates, careers),
        );
    });

    test('主属性与成长最高维不符时报错', () => {
        const rates: Record<string, number> = {};
        for (const key of ATTRIBUTE_KEYS) {
            rates[key] = 200;
        }
        rates.magic = 3000;
        const parsed = parseGrowthRates({ wu_xiu: rates });
        assert.throws(
            () =>
                assertPrimaryAttributeMatchesGrowth(parsed, [
                    { id: 'wu_xiu', primaryAttribute: 'strength' },
                ]),
            /声明主属性为 strength.*成长最高的是 magic/s,
        );
    });

    test('负成长率被拒绝', () => {
        const rates: Record<string, number> = {};
        for (const key of ATTRIBUTE_KEYS) {
            rates[key] = 1000;
        }
        rates.speed = -100;
        assert.throws(() => parseGrowthRates({ wu_xiu: rates }), /非负安全整数/);
    });
});

describe('品级倍率表', () => {
    test('缺任一品级即失败', () => {
        const partial: Record<string, unknown> = {};
        for (const grade of HERO_GRADES) {
            partial[grade] = { basePercent: 100, growthPercent: 100 };
        }
        delete partial.SSS;
        assert.throws(() => parseGradeMultipliers(partial), /SSS/);
    });

    test('倍率必须随品级严格递增', () => {
        const table: Record<string, unknown> = {};
        HERO_GRADES.forEach((grade, index) => {
            table[grade] = { basePercent: 100 + index, growthPercent: 100 };
        });
        assert.throws(() => parseGradeMultipliers(table), /growthPercent 必须随品级严格递增/);
    });

    test('仓库表的 D 品为 100 基准，且 SSS 与 D 的成长倍率比不超过 2.0', () => {
        const tables = loadTables();
        assert.equal(tables.gradeMultipliers.D.basePercent, 100);
        assert.equal(tables.gradeMultipliers.D.growthPercent, 100);
        // PRD-03 §3：D 级角色必须能通过合理培养完成主线
        const ratio =
            tables.gradeMultipliers.SSS.growthPercent / tables.gradeMultipliers.D.growthPercent;
        assert.ok(ratio <= 2, `SSS 与 D 的成长倍率比 ${ratio} 超过 2.0`);
    });
});

describe('战斗常数表', () => {
    test('减伤等级常数按 10 级为步长线性放大', () => {
        const curve = { base: 100, perTenLevels: 24 };
        assert.equal(defenseLevelConstantAt(curve, 1), 100);
        assert.equal(defenseLevelConstantAt(curve, 11), 124);
        assert.equal(defenseLevelConstantAt(curve, 60), 241);
    });

    test('perTenLevels 为 0 时 K 恒定，回到旧行为', () => {
        const curve = { base: 100, perTenLevels: 0 };
        assert.equal(defenseLevelConstantAt(curve, 1), 100);
        assert.equal(defenseLevelConstantAt(curve, 60), 100);
    });

    test('base 为 0 被拒绝：K=0 时满防御等于免伤 100%', () => {
        assert.throws(
            () =>
                parseCombatConstants({
                    constitutionHpFactor: 8,
                    minActionIntervalTicks: 4,
                    maxActionIntervalTicks: 200,
                    minDamage: 1,
                    defenseLevelConstant: { base: 0, perTenLevels: 24 },
                }),
            /base 应为正安全整数/,
        );
    });

    test('行动间隔下限高于上限时失败', () => {
        assert.throws(
            () =>
                parseCombatConstants({
                    constitutionHpFactor: 8,
                    minActionIntervalTicks: 300,
                    maxActionIntervalTicks: 200,
                    minDamage: 1,
                    defenseLevelConstant: { base: 100, perTenLevels: 24 },
                }),
            /下限 300 不得高于上限 200/,
        );
    });

    test('等级非正整数时 K 计算抛错', () => {
        assert.throws(() => defenseLevelConstantAt({ base: 100, perTenLevels: 24 }, 0), /正整数/);
    });
});

describe('生产速率表', () => {
    function validRates() {
        const jobs: Record<string, unknown> = {};
        for (const job of PRODUCTION_JOBS) {
            jobs[job] = {
                outputPerWorker: 1,
                grainUpkeepPerWorker: job === 'spiritGrain' ? 0 : 2,
            };
        }
        return {
            cycleSeconds: 30,
            jobs,
            shutdownOrder: ['gengJing', 'spiritStone', 'darkIron', 'spiritWood'],
        };
    }

    test('灵粮岗带维护成本时失败', () => {
        const rates = validRates();
        (rates.jobs as Record<string, Record<string, number>>).spiritGrain!.grainUpkeepPerWorker = 1;
        assert.throws(() => parseProductionRates(rates), /灵粮岗不消耗灵粮/);
    });

    test('停工顺序含灵粮岗时失败', () => {
        const rates = validRates();
        rates.shutdownOrder = ['spiritGrain', 'gengJing', 'spiritStone', 'darkIron', 'spiritWood'];
        assert.throws(() => parseProductionRates(rates), /不得为 spiritGrain/);
    });

    test('停工顺序漏掉有维护成本的岗位时失败', () => {
        const rates = validRates();
        rates.shutdownOrder = ['gengJing', 'spiritStone'];
        assert.throws(() => parseProductionRates(rates), /未覆盖有维护成本的岗位/);
    });

    test('停工顺序重复岗位时失败', () => {
        const rates = validRates();
        rates.shutdownOrder = ['gengJing', 'gengJing', 'spiritStone', 'darkIron', 'spiritWood'];
        assert.throws(() => parseProductionRates(rates), /重复出现岗位/);
    });

    test('仓库表的停工顺序按维护成本从高到低', () => {
        const tables = loadTables();
        const order = tables.production.shutdownOrder;
        for (let i = 1; i < order.length; i += 1) {
            const prev = tables.production.jobs[order[i - 1]!].grainUpkeepPerWorker;
            const curr = tables.production.jobs[order[i]!].grainUpkeepPerWorker;
            assert.ok(
                prev >= curr,
                `停工顺序应按维护成本递减：${order[i - 1]}(${prev}) 后接 ${order[i]}(${curr})`,
            );
        }
    });

    test('仓库表下初始杂役数能开出多个副岗配置', () => {
        const tables = loadTables();
        const { jobs } = tables.production;
        const workerCount = 6;
        let viable = 0;
        for (let grain = 0; grain <= workerCount; grain += 1) {
            for (let wood = 0; wood <= workerCount - grain; wood += 1) {
                const iron = workerCount - grain - wood;
                if (wood === 0 && iron === 0) {
                    continue;
                }
                const net =
                    grain * jobs.spiritGrain.outputPerWorker -
                    wood * jobs.spiritWood.grainUpkeepPerWorker -
                    iron * jobs.darkIron.grainUpkeepPerWorker;
                if (net >= 0) {
                    viable += 1;
                }
            }
        }
        // Docs/13 §4.2：少于 5 个说明前期没有岗位决策，最优解必然是无脑堆灵粮岗
        assert.ok(viable >= 5, `初始 6 名杂役仅有 ${viable} 个可持续副岗配置，前期无决策空间`);
    });
});

describe('境界区间表', () => {
    test('区间不连续时失败', () => {
        assert.throws(
            () =>
                parseRealmRanges({
                    maxLevel: 60,
                    tier1UnlockLevel: 10,
                    realms: [
                        { id: 'zhu_ji', min: 1, max: 20 },
                        { id: 'jie_dan', min: 22, max: 40 },
                        { id: 'yuan_ying', min: 41, max: 60 },
                    ],
                }),
            /区间不连续/,
        );
    });

    test('未覆盖到 maxLevel 时失败', () => {
        assert.throws(
            () =>
                parseRealmRanges({
                    maxLevel: 60,
                    tier1UnlockLevel: 10,
                    realms: [{ id: 'zhu_ji', min: 1, max: 20 }],
                }),
            /未覆盖到 maxLevel/,
        );
    });

    test('不从 1 级开始时失败', () => {
        assert.throws(
            () =>
                parseRealmRanges({
                    maxLevel: 60,
                    tier1UnlockLevel: 10,
                    realms: [{ id: 'zhu_ji', min: 2, max: 60 }],
                }),
            /必须从 1 级开始/,
        );
    });

    test('一转等级超过 maxLevel 时失败', () => {
        assert.throws(
            () =>
                parseRealmRanges({
                    maxLevel: 60,
                    tier1UnlockLevel: 61,
                    realms: [{ id: 'zhu_ji', min: 1, max: 60 }],
                }),
            /超过 maxLevel/,
        );
    });

    test('仓库表覆盖 1 到 60 且与 PRD-03 §9 的三境界一致', () => {
        const tables = loadTables();
        assert.equal(tables.realms.maxLevel, 60);
        assert.equal(tables.realms.tier1UnlockLevel, 10);
        assert.deepEqual(
            tables.realms.realms.map((realm) => realm.id),
            ['zhu_ji', 'jie_dan', 'yuan_ying'],
        );
    });
});

describe('跨表一致性', () => {
    test('成长率缺职业时报告缺失', () => {
        assert.throws(
            () => assertGrowthRatesCoverCareers({}, ['wu_xiu']),
            /缺少职业 wu_xiu/,
        );
    });

    test('成长率多出未知职业时报告多余', () => {
        const rates: Record<string, number> = {};
        for (const key of ATTRIBUTE_KEYS) {
            rates[key] = 1000;
        }
        const parsed = parseGrowthRates({ wu_xiu: rates, ghost_xiu: rates });
        assert.throws(
            () => assertGrowthRatesCoverCareers(parsed, ['wu_xiu']),
            /多出未知职业 ghost_xiu/,
        );
    });
});
