import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    HERO_GRADES,
    GRADE_GROWTH_PERCENT,
    REALMS,
    REALM_LEVEL_RANGES,
    MAX_LEVEL,
    TIER_1_LEVEL,
    realmOf,
    canPromoteToTier1,
    computeGrowth,
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
    test('三个境界', () => {
        assert.deepEqual([...REALMS], ['zhu_ji', 'jie_dan', 'yuan_ying']);
    });

    test('区间为 1-20 / 21-40 / 41-60', () => {
        assert.deepEqual(REALM_LEVEL_RANGES.zhu_ji, { min: 1, max: 20 });
        assert.deepEqual(REALM_LEVEL_RANGES.jie_dan, { min: 21, max: 40 });
        assert.deepEqual(REALM_LEVEL_RANGES.yuan_ying, { min: 41, max: 60 });
    });

    test('区间连续无空隙', () => {
        for (let i = 1; i < REALMS.length; i += 1) {
            const prev = REALM_LEVEL_RANGES[REALMS[i - 1]!];
            const curr = REALM_LEVEL_RANGES[REALMS[i]!];
            assert.equal(curr.min, prev.max + 1, `${REALMS[i]} 与前一境界不连续`);
        }
    });

    test('边界等级归属正确', () => {
        assert.equal(realmOf(1), 'zhu_ji');
        assert.equal(realmOf(20), 'zhu_ji');
        assert.equal(realmOf(21), 'jie_dan');
        assert.equal(realmOf(40), 'jie_dan');
        assert.equal(realmOf(41), 'yuan_ying');
        assert.equal(realmOf(60), 'yuan_ying');
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
    const profile = {
        primaryPerLevel: 3,
        secondaryPerLevel: 1,
        primaryAttribute: 'strength' as const,
        secondaryAttribute: 'constitution' as const,
    };

    test('1 级时成长为 0', () => {
        // 初始值全部来自 base，便于策划核对数据表
        const growth = computeGrowth(1, 'D', profile);
        for (const key of ATTRIBUTE_KEYS) {
            assert.equal(growth[key], 0, `${key} 在 1 级应为 0`);
        }
    });

    test('D 级 11 级：主属性 10 级 × 3 = 30', () => {
        const growth = computeGrowth(11, 'D', profile);
        assert.equal(growth.strength, 30);
        assert.equal(growth.constitution, 10);
    });

    test('品级越高成长越多', () => {
        const low = computeGrowth(21, 'D', profile).strength;
        const high = computeGrowth(21, 'SSS', profile).strength;
        assert.ok(high > low);
    });

    test('SSS 级按 190% 计算', () => {
        // 20 级 × 3 × 190% = 114
        assert.equal(computeGrowth(21, 'SSS', profile).strength, 114);
    });

    test('结果向下取整', () => {
        // 10 × 1 × 110% = 11；用 secondary 验证小数被截断
        const growth = computeGrowth(11, 'C', profile);
        assert.ok(Number.isInteger(growth.constitution));
    });

    test('未声明副属性时只长主属性', () => {
        const growth = computeGrowth(11, 'D', {
            primaryPerLevel: 3,
            secondaryPerLevel: 1,
            primaryAttribute: 'magic',
        });
        assert.equal(growth.magic, 30);
        assert.equal(growth.constitution, 0);
    });

    test('主副属性相同时累加而非覆盖', () => {
        const growth = computeGrowth(11, 'D', {
            primaryPerLevel: 3,
            secondaryPerLevel: 2,
            primaryAttribute: 'strength',
            secondaryAttribute: 'strength',
        });
        // 30 + 20 = 50，不能是 20 把 30 覆盖掉
        assert.equal(growth.strength, 50);
    });

    test('非法等级抛错', () => {
        assert.throws(() => computeGrowth(0, 'D', profile), /正整数/);
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
