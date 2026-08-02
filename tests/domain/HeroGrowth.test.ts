import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    SPIRITUAL_ROOT_IDS,
    SPIRITUAL_ROOT_GROWTH_PERCENT,
    SPIRITUAL_ROOT_BASE_PERCENT,
    REALM_IDS,
    REALM_LEVEL_RANGES,
    MAX_LEVEL,
    TIER_1_LEVEL,
    realmIdOf,
    canPromoteToTier1,
    computeGrowth,
    scaleBaseBySpiritualRoot,
    summarize,
    requiresDismissConfirm,
    isDismissLocked,
    DISMISS_REFUND_PERCENT,
} from 'db://assets/scripts/domain/HeroGrowth';
import { createAttributes, ATTRIBUTE_KEYS } from 'db://assets/scripts/domain/Attributes';

describe('灵根资质（PRD-03 §3）', () => {
    test('只允许六档稳定灵根', () => {
        assert.deepEqual([...SPIRITUAL_ROOT_IDS], [
            'mixed_root', 'pseudo_root', 'triple_root',
            'dual_root', 'heavenly_root', 'variant_root',
        ]);
    });

    test('成长倍率随灵根递增', () => {
        for (let i = 1; i < SPIRITUAL_ROOT_IDS.length; i += 1) {
            const prev = SPIRITUAL_ROOT_GROWTH_PERCENT[SPIRITUAL_ROOT_IDS[i - 1]!];
            const curr = SPIRITUAL_ROOT_GROWTH_PERCENT[SPIRITUAL_ROOT_IDS[i]!];
            assert.ok(curr > prev);
        }
    });

    test('杂灵根为基准 100', () => {
        assert.equal(SPIRITUAL_ROOT_GROWTH_PERCENT.mixed_root, 100);
    });

    test('异灵根不超过杂灵根的两倍', () => {
        assert.ok(
            SPIRITUAL_ROOT_GROWTH_PERCENT.variant_root
                <= SPIRITUAL_ROOT_GROWTH_PERCENT.mixed_root * 2,
        );
    });
});

describe('境界（PRD-03 §9）', () => {
    test('Schema 冻结炼气至大乘八个境界', () => {
        assert.deepEqual(
            [...REALM_IDS],
            [
                'lian_qi', 'zhu_ji', 'jie_dan', 'yuan_ying',
                'hua_shen', 'lian_xu', 'he_ti', 'da_cheng',
            ],
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
        for (let i = 1; i < REALM_IDS.length; i += 1) {
            const prev = REALM_LEVEL_RANGES[REALM_IDS[i - 1]!];
            const curr = REALM_LEVEL_RANGES[REALM_IDS[i]!];
            assert.equal(curr.min, prev.max + 1, `${REALM_IDS[i]} 与前一境界不连续`);
        }
    });

    test('边界等级归属正确', () => {
        assert.equal(realmIdOf(1), 'lian_qi');
        assert.equal(realmIdOf(10), 'lian_qi');
        assert.equal(realmIdOf(11), 'zhu_ji');
        assert.equal(realmIdOf(60), 'lian_xu');
        assert.equal(realmIdOf(61), 'he_ti');
        assert.equal(realmIdOf(71), 'da_cheng');
        assert.equal(realmIdOf(80), 'da_cheng');
    });

    test('1–60 全部有归属', () => {
        for (let level = 1; level <= MAX_LEVEL; level += 1) {
            assert.ok(realmIdOf(level), `等级 ${level} 无境界`);
        }
    });

    test('越界抛错而非钳制', () => {
        // 静默钳制会让 bug 表现为"卡在 60 级"，难以定位
        assert.throws(() => realmIdOf(0), /1–80/);
        assert.throws(() => realmIdOf(81), /1–80/);
        assert.throws(() => realmIdOf(1.5), /整数/);
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
        const growth = computeGrowth(1, 'mixed_root', rates);
        for (const key of ATTRIBUTE_KEYS) {
            assert.equal(growth[key], 0, `${key} 在 1 级应为 0`);
        }
    });

    test('杂灵根 11 级：主属性 10 级 × 3.0 = 30', () => {
        const growth = computeGrowth(11, 'mixed_root', rates);
        assert.equal(growth.strength, 30);
        assert.equal(growth.constitution, 10);
    });

    test('七维全部成长，无一冻结', () => {
        // 旧结构只长主维与副维，其余五维终身不变；这是 Docs/13 §1.2 问题 1
        const growth = computeGrowth(60, 'mixed_root', rates);
        for (const key of ATTRIBUTE_KEYS) {
            assert.ok(growth[key] > 0, `${key} 在 60 级仍为 0，该维被冻结`);
        }
    });

    test('灵根越高成长越多', () => {
        const low = computeGrowth(21, 'mixed_root', rates).strength;
        const high = computeGrowth(21, 'variant_root', rates).strength;
        assert.ok(high > low);
    });

    test('异灵根按 190% 计算', () => {
        // 20 级 × 3.0 × 190% = 114
        assert.equal(computeGrowth(21, 'variant_root', rates).strength, 114);
    });

    test('显式传入灵根倍率时覆盖内置常数', () => {
        assert.equal(computeGrowth(21, 'variant_root', rates, 200).strength, 120);
    });

    test('结果向下取整', () => {
        // 10 级 × 0.2 × 110% = 2.2 → 2
        const growth = computeGrowth(11, 'pseudo_root', rates);
        assert.equal(growth.armor, 2);
        for (const key of ATTRIBUTE_KEYS) {
            assert.ok(Number.isInteger(growth[key]), `${key} 不是整数`);
        }
    });

    test('成长率为 0 的维度不成长', () => {
        const growth = computeGrowth(11, 'mixed_root', { ...rates, armor: 0 });
        assert.equal(growth.armor, 0);
        assert.equal(growth.strength, 30);
    });

    test('负成长率抛错', () => {
        assert.throws(() => computeGrowth(11, 'mixed_root', { ...rates, speed: -100 }), /不能为负/);
    });

    test('非法等级抛错', () => {
        assert.throws(() => computeGrowth(0, 'mixed_root', rates), /正整数/);
    });
});

describe('灵根缩放初始七维（PRD-03 §3）', () => {
    const base = createAttributes({ strength: 14, constitution: 13, armor: 11 });

    test('杂灵根为基准，初始值不变', () => {
        const scaled = scaleBaseBySpiritualRoot(base, 'mixed_root');
        assert.equal(scaled.strength, 14);
        assert.equal(scaled.constitution, 13);
    });

    test('灵根越高初始值越高', () => {
        const low = scaleBaseBySpiritualRoot(base, 'mixed_root').strength;
        const high = scaleBaseBySpiritualRoot(base, 'variant_root').strength;
        assert.ok(high > low);
    });

    test('相邻灵根在 floor 后仍有差异——否则招募界面看不出区别', () => {
        // 初始七维是个位数量级，105% 作用在 14 上 floor 后仍是 14
        let previous = -1;
        for (const rootId of SPIRITUAL_ROOT_IDS) {
            const value = scaleBaseBySpiritualRoot(base, rootId).strength;
            assert.ok(
                value > previous,
                `${rootId} 的 strength ${value} 未超过上一档 ${previous}`,
            );
            previous = value;
        }
    });

    test('显式传入倍率时覆盖内置常数', () => {
        assert.equal(scaleBaseBySpiritualRoot(base, 'mixed_root', 200).strength, 28);
    });

    test('倍率非正时抛错', () => {
        assert.throws(() => scaleBaseBySpiritualRoot(base, 'mixed_root', 0), /必须为正/);
    });

    test('初始倍率曲线比成长倍率平缓', () => {
        // 初始值只需让玩家看出差别，不该在 1 级就制造代差
        const baseRatio = SPIRITUAL_ROOT_BASE_PERCENT.variant_root
            / SPIRITUAL_ROOT_BASE_PERCENT.mixed_root;
        const growthRatio = SPIRITUAL_ROOT_GROWTH_PERCENT.variant_root
            / SPIRITUAL_ROOT_GROWTH_PERCENT.mixed_root;
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
    test('双灵根及以上需二次确认', () => {
        assert.equal(requiresDismissConfirm('triple_root'), false);
        assert.equal(requiresDismissConfirm('dual_root'), true);
        assert.equal(requiresDismissConfirm('variant_root'), true);
    });

    test('天灵根和异灵根默认锁定', () => {
        assert.equal(isDismissLocked('dual_root'), false);
        assert.equal(isDismissLocked('heavenly_root'), true);
        assert.equal(isDismissLocked('variant_root'), true);
    });

    test('锁定的灵根必然也需确认', () => {
        // 否则会出现"锁定但不提示"的矛盾状态
        for (const rootId of SPIRITUAL_ROOT_IDS) {
            if (isDismissLocked(rootId)) {
                assert.ok(requiresDismissConfirm(rootId), `${rootId} 锁定却不需确认`);
            }
        }
    });

    test('返还比例为正且不超过 100%', () => {
        assert.ok(DISMISS_REFUND_PERCENT > 0 && DISMISS_REFUND_PERCENT <= 100);
    });
});
