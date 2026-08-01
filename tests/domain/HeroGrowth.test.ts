import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    HERO_GRADES,
    GRADE_GROWTH_PERCENT,
    GRADE_BASE_PERCENT,
    REALMS,
    REALM_LEVEL_RANGES,
    MAX_LEVEL,
    TIER_1_LEVEL,
    realmOf,
    canPromoteToTier1,
    computeGrowth,
    scaleBaseByGrade,
    summarize,
    requiresDismissConfirm,
    isDismissLocked,
    DISMISS_REFUND_PERCENT,
} from 'db://assets/scripts/domain/HeroGrowth';
import { createAttributes, ATTRIBUTE_KEYS } from 'db://assets/scripts/domain/Attributes';

describe('品级（PRD-03 §3）', () => {
    test('七个品级 D→SSS', () => {
        assert.deepEqual([...HERO_GRADES], ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS']);
    });

    test('成长倍率随品级递增', () => {
        for (let i = 1; i < HERO_GRADES.length; i += 1) {
            const prev = GRADE_GROWTH_PERCENT[HERO_GRADES[i - 1]!];
            const curr = GRADE_GROWTH_PERCENT[HERO_GRADES[i]!];
            assert.ok(curr > prev, `${HERO_GRADES[i]} 应强于 ${HERO_GRADES[i - 1]}`);
        }
    });

    test('D 级为基准 100', () => {
        assert.equal(GRADE_GROWTH_PERCENT.D, 100);
    });

    test('SSS 不超过 D 的两倍', () => {
        // PRD-03 §3：D 级必须能通过合理培养完成主线，
        // 差距过大会让低品级角色在数值上被彻底淘汰
        assert.ok(
            GRADE_GROWTH_PERCENT.SSS <= GRADE_GROWTH_PERCENT.D * 2,
            `SSS/${GRADE_GROWTH_PERCENT.SSS} 相对 D 差距过大`,
        );
    });
});

describe('境界（PRD-03 §9）', () => {
    test('当前等级上限覆盖六个境界', () => {
        assert.deepEqual(
            [...REALMS],
            ['lian_qi', 'zhu_ji', 'jie_dan', 'yuan_ying', 'hua_shen', 'lian_xu'],
        );
    });

    test('炼气至炼虚每境界十级', () => {
        assert.deepEqual(REALM_LEVEL_RANGES.lian_qi, { min: 1, max: 10 });
        assert.deepEqual(REALM_LEVEL_RANGES.zhu_ji, { min: 11, max: 20 });
        assert.deepEqual(REALM_LEVEL_RANGES.jie_dan, { min: 21, max: 30 });
        assert.deepEqual(REALM_LEVEL_RANGES.yuan_ying, { min: 31, max: 40 });
        assert.deepEqual(REALM_LEVEL_RANGES.hua_shen, { min: 41, max: 50 });
        assert.deepEqual(REALM_LEVEL_RANGES.lian_xu, { min: 51, max: 60 });
    });

    test('区间连续无空隙', () => {
        for (let i = 1; i < REALMS.length; i += 1) {
            const prev = REALM_LEVEL_RANGES[REALMS[i - 1]!];
            const curr = REALM_LEVEL_RANGES[REALMS[i]!];
            assert.equal(curr.min, prev.max + 1, `${REALMS[i]} 与前一境界不连续`);
        }
    });

    test('边界等级归属正确', () => {
        assert.equal(realmOf(1), 'lian_qi');
        assert.equal(realmOf(10), 'lian_qi');
        assert.equal(realmOf(11), 'zhu_ji');
        assert.equal(realmOf(20), 'zhu_ji');
        assert.equal(realmOf(21), 'jie_dan');
        assert.equal(realmOf(30), 'jie_dan');
        assert.equal(realmOf(31), 'yuan_ying');
        assert.equal(realmOf(40), 'yuan_ying');
        assert.equal(realmOf(41), 'hua_shen');
        assert.equal(realmOf(50), 'hua_shen');
        assert.equal(realmOf(51), 'lian_xu');
        assert.equal(realmOf(60), 'lian_xu');
    });

    test('1–60 全部有归属', () => {
        for (let level = 1; level <= MAX_LEVEL; level += 1) {
            assert.ok(realmOf(level), `等级 ${level} 无境界`);
        }
    });

    test('越界抛错而非钳制', () => {
        // 静默钳制会让 bug 表现为"卡在 60 级"，难以定位
        assert.throws(() => realmOf(0), /1–60/);
        assert.throws(() => realmOf(61), /1–60/);
        assert.throws(() => realmOf(1.5), /整数/);
    });
});

describe('一转开放（PRD-03 §6）', () => {
    test('10 级开放', () => {
        assert.equal(TIER_1_LEVEL, 10);
        assert.equal(canPromoteToTier1(10), true);
    });

    test('9 级不可转', () => {
        assert.equal(canPromoteToTier1(9), false);
    });

    test('超过 10 级仍可转', () => {
        assert.equal(canPromoteToTier1(35), true);
    });
});

describe('等级成长（PRD-03 §3）', () => {
    /** 千分位：主维 3.0/级，肉身 1.0/级，其余 0.2/级。 */
    const rates = {
        strength: 3000,
        magic: 200,
        technique: 200,
        speed: 200,
        constitution: 1000,
        armor: 200,
        resistance: 200,
    };

    test('1 级时成长为 0', () => {
        // 初始值全部来自 base，便于策划核对数据表
        const growth = computeGrowth(1, 'D', rates);
        for (const key of ATTRIBUTE_KEYS) {
            assert.equal(growth[key], 0, `${key} 在 1 级应为 0`);
        }
    });

    test('D 级 11 级：主属性 10 级 × 3.0 = 30', () => {
        const growth = computeGrowth(11, 'D', rates);
        assert.equal(growth.strength, 30);
        assert.equal(growth.constitution, 10);
    });

    test('七维全部成长，无一冻结', () => {
        // 旧结构只长主维与副维，其余五维终身不变；这是 Docs/13 §1.2 问题 1
        const growth = computeGrowth(60, 'D', rates);
        for (const key of ATTRIBUTE_KEYS) {
            assert.ok(growth[key] > 0, `${key} 在 60 级仍为 0，该维被冻结`);
        }
    });

    test('品级越高成长越多', () => {
        const low = computeGrowth(21, 'D', rates).strength;
        const high = computeGrowth(21, 'SSS', rates).strength;
        assert.ok(high > low);
    });

    test('SSS 级按 190% 计算', () => {
        // 20 级 × 3.0 × 190% = 114
        assert.equal(computeGrowth(21, 'SSS', rates).strength, 114);
    });

    test('显式传入品级倍率时覆盖内置常数', () => {
        // 20 级 × 3.0 × 200% = 120，与 GRADE_GROWTH_PERCENT.SSS 的 190% 不同
        assert.equal(computeGrowth(21, 'SSS', rates, 200).strength, 120);
    });

    test('结果向下取整', () => {
        // 10 级 × 0.2 × 110% = 2.2 → 2
        const growth = computeGrowth(11, 'C', rates);
        assert.equal(growth.armor, 2);
        for (const key of ATTRIBUTE_KEYS) {
            assert.ok(Number.isInteger(growth[key]), `${key} 不是整数`);
        }
    });

    test('成长率为 0 的维度不成长', () => {
        const growth = computeGrowth(11, 'D', { ...rates, armor: 0 });
        assert.equal(growth.armor, 0);
        assert.equal(growth.strength, 30);
    });

    test('负成长率抛错', () => {
        assert.throws(() => computeGrowth(11, 'D', { ...rates, speed: -100 }), /不能为负/);
    });

    test('非法等级抛错', () => {
        assert.throws(() => computeGrowth(0, 'D', rates), /正整数/);
    });
});

describe('品级缩放初始七维（PRD-03 §3）', () => {
    const base = createAttributes({ strength: 14, constitution: 13, armor: 11 });

    test('D 品为基准，初始值不变', () => {
        const scaled = scaleBaseByGrade(base, 'D');
        assert.equal(scaled.strength, 14);
        assert.equal(scaled.constitution, 13);
    });

    test('品级越高初始值越高', () => {
        const d = scaleBaseByGrade(base, 'D').strength;
        const sss = scaleBaseByGrade(base, 'SSS').strength;
        assert.ok(sss > d, `SSS ${sss} 应高于 D ${d}`);
    });

    test('相邻品级在 floor 后仍有差异——否则招募界面看不出区别', () => {
        // 这是 GRADE_BASE_PERCENT 步长取约 8 个百分点的原因：
        // 初始七维是个位数量级，105% 作用在 14 上 floor 后仍是 14
        let previous = -1;
        for (const grade of HERO_GRADES) {
            const value = scaleBaseByGrade(base, grade).strength;
            assert.ok(
                value > previous,
                `${grade} 品的 strength ${value} 未超过上一品级 ${previous}`,
            );
            previous = value;
        }
    });

    test('显式传入倍率时覆盖内置常数', () => {
        assert.equal(scaleBaseByGrade(base, 'D', 200).strength, 28);
    });

    test('倍率非正时抛错', () => {
        assert.throws(() => scaleBaseByGrade(base, 'D', 0), /必须为正/);
    });

    test('初始倍率曲线比成长倍率平缓', () => {
        // 初始值只需让玩家看出差别，不该在 1 级就制造代差
        const baseRatio = GRADE_BASE_PERCENT.SSS / GRADE_BASE_PERCENT.D;
        const growthRatio = GRADE_GROWTH_PERCENT.SSS / GRADE_GROWTH_PERCENT.D;
        assert.ok(
            baseRatio < growthRatio,
            `初始倍率跨度 ${baseRatio} 不应达到成长倍率跨度 ${growthRatio}`,
        );
    });
});

describe('属性汇总（PRD-03 §8）', () => {
    test('五个来源都保留，可单独展示', () => {
        const breakdown = summarize({
            base: createAttributes({ strength: 10 }),
            growth: createAttributes({ strength: 30 }),
            equipment: createAttributes({ strength: 5 }),
            state: createAttributes({ strength: 2 }),
        });

        // PRD-03 §8 要求区分基础、成长、装备、状态和最终值
        assert.equal(breakdown.base.strength, 10);
        assert.equal(breakdown.growth.strength, 30);
        assert.equal(breakdown.equipment.strength, 5);
        assert.equal(breakdown.state.strength, 2);
        assert.equal(breakdown.final.strength, 47);
    });

    test('装备与状态可省略', () => {
        const breakdown = summarize({
            base: createAttributes({ magic: 20 }),
            growth: createAttributes({ magic: 10 }),
        });
        assert.equal(breakdown.final.magic, 30);
        assert.equal(breakdown.equipment.magic, 0);
    });

    test('负状态（破甲）不让最终值为负', () => {
        const breakdown = summarize({
            base: createAttributes({ armor: 10 }),
            growth: createAttributes(),
            state: createAttributes({ armor: -50 }),
        });
        // 面板显示负数会让玩家困惑
        assert.equal(breakdown.final.armor, 0);
    });

    test('负状态仍在 state 中保留原值', () => {
        const breakdown = summarize({
            base: createAttributes({ armor: 10 }),
            growth: createAttributes(),
            state: createAttributes({ armor: -50 }),
        });
        // clamp 只作用于 final，来源要如实反映
        assert.equal(breakdown.state.armor, -50);
    });

    test('七维全部参与汇总', () => {
        const all = createAttributes(
            Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, 5])) as never,
        );
        const breakdown = summarize({ base: all, growth: all });
        for (const key of ATTRIBUTE_KEYS) {
            assert.equal(breakdown.final[key], 10, `${key} 汇总错误`);
        }
    });
});

describe('解雇规则（PRD-03 §10）', () => {
    test('A 级及以上需二次确认', () => {
        assert.equal(requiresDismissConfirm('B'), false);
        assert.equal(requiresDismissConfirm('A'), true);
        assert.equal(requiresDismissConfirm('SSS'), true);
    });

    test('S 级及以上默认锁定', () => {
        assert.equal(isDismissLocked('A'), false);
        assert.equal(isDismissLocked('S'), true);
        assert.equal(isDismissLocked('SS'), true);
    });

    test('锁定的品级必然也需确认', () => {
        // 否则会出现"锁定但不提示"的矛盾状态
        for (const grade of HERO_GRADES) {
            if (isDismissLocked(grade)) {
                assert.ok(requiresDismissConfirm(grade), `${grade} 锁定却不需确认`);
            }
        }
    });

    test('返还比例为正且不超过 100%', () => {
        assert.ok(DISMISS_REFUND_PERCENT > 0 && DISMISS_REFUND_PERCENT <= 100);
    });
});
