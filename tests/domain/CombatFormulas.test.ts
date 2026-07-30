import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    actionIntervalTicks,
    ticksToSeconds,
    maxHp,
    skillBaseDamage,
    damageReduction,
    finalDamage,
    defenseAttributeFor,
    MIN_ACTION_INTERVAL_TICKS,
    MAX_ACTION_INTERVAL_TICKS,
    CONSTITUTION_HP_FACTOR,
    DEFENSE_LEVEL_CONSTANT_BASE,
} from 'db://assets/scripts/domain/CombatFormulas';
import { createAttributes } from 'db://assets/scripts/domain/Attributes';
import { SIMULATION_TICK_HZ } from 'db://assets/scripts/domain/CombatTypes';

describe('行动间隔（PRD-04 §3）', () => {
    test('遁速为 0 时等于基础间隔', () => {
        assert.equal(actionIntervalTicks(40, 0), 40);
    });

    test('遁速 100 时间隔减半', () => {
        // 40 × 100 / (100 + 100) = 20
        assert.equal(actionIntervalTicks(40, 100), 20);
    });

    test('遁速 50 时按公式取整', () => {
        // 40 × 100 / 150 = 26.67 → 26
        assert.equal(actionIntervalTicks(40, 50), 26);
    });

    test('结果向下取整，不保留小数', () => {
        // tick 是离散的；浮点在不同平台的舍入可能让结算顺序不一致
        for (const speed of [7, 13, 29, 61]) {
            assert.ok(Number.isInteger(actionIntervalTicks(40, speed)));
        }
    });

    test('极高遁速被下限截断', () => {
        assert.equal(actionIntervalTicks(40, 99999), MIN_ACTION_INTERVAL_TICKS);
    });

    test('极长基础间隔被上限截断', () => {
        assert.equal(actionIntervalTicks(9999, 0), MAX_ACTION_INTERVAL_TICKS);
    });

    test('遁速越高间隔单调不增', () => {
        let previous = actionIntervalTicks(60, 0);
        for (let speed = 1; speed <= 200; speed += 1) {
            const current = actionIntervalTicks(60, speed);
            assert.ok(current <= previous, `遁速 ${speed} 时间隔反而变长`);
            previous = current;
        }
    });

    test('非正整数基础间隔抛错', () => {
        assert.throws(() => actionIntervalTicks(0, 0), /正整数/);
        assert.throws(() => actionIntervalTicks(1.5, 0), /正整数/);
    });

    test('负遁速抛错', () => {
        assert.throws(() => actionIntervalTicks(40, -1), /不能为负/);
    });
});

describe('tick 与秒', () => {
    test('按模拟频率换算', () => {
        assert.equal(ticksToSeconds(SIMULATION_TICK_HZ), 1);
    });

    test('20 tick 为 1 秒（20Hz）', () => {
        assert.equal(ticksToSeconds(20), 1);
    });
});

describe('生命上限（PRD-04 §5）', () => {
    test('基础生命 + 肉身 × 系数 + 装备生命', () => {
        // 100 + 10 × 8 + 50 = 230
        assert.equal(maxHp(100, 10, 50), 230);
    });

    test('无装备时省略该项', () => {
        assert.equal(maxHp(100, 10), 100 + 10 * CONSTITUTION_HP_FACTOR);
    });

    test('肉身为 0 时只有基础与装备', () => {
        assert.equal(maxHp(100, 0, 20), 120);
    });

    test('结果至少为 1', () => {
        // 0 会让单位入场瞬间即算死亡
        assert.equal(maxHp(0, 0, 0), 1);
    });

    test('可覆盖生命系数（数据表驱动）', () => {
        assert.equal(maxHp(100, 10, 0, 12), 220);
    });
});

describe('技能基础伤害（PRD-04 §5）', () => {
    const attributes = createAttributes({
        strength: 50,
        magic: 40,
        technique: 30,
    });

    test('物理技能按力道计算', () => {
        // 50 × 120% = 60
        const damage = skillBaseDamage(attributes, {
            primaryAttribute: 'strength',
            primaryPercent: 120,
        });
        assert.equal(damage, 60);
    });

    test('法术技能按法力计算', () => {
        // 40 × 150% = 60
        const damage = skillBaseDamage(attributes, {
            primaryAttribute: 'magic',
            primaryPercent: 150,
        });
        assert.equal(damage, 60);
    });

    test('副属性（神识）叠加', () => {
        // 50 × 100% + 30 × 50% = 50 + 15 = 65
        const damage = skillBaseDamage(attributes, {
            primaryAttribute: 'strength',
            primaryPercent: 100,
            secondaryAttribute: 'technique',
            secondaryPercent: 50,
        });
        assert.equal(damage, 65);
    });

    test('未声明副倍率时按 0 处理', () => {
        const damage = skillBaseDamage(attributes, {
            primaryAttribute: 'strength',
            primaryPercent: 100,
            secondaryAttribute: 'technique',
        });
        assert.equal(damage, 50);
    });

    test('倍率 0 得 0 伤害', () => {
        const damage = skillBaseDamage(attributes, {
            primaryAttribute: 'strength',
            primaryPercent: 0,
        });
        assert.equal(damage, 0);
    });

    test('结果为整数', () => {
        // 50 × 33% = 16.5 → 16
        const damage = skillBaseDamage(attributes, {
            primaryAttribute: 'strength',
            primaryPercent: 33,
        });
        assert.equal(damage, 16);
    });

    test('负倍率抛错', () => {
        assert.throws(
            () => skillBaseDamage(attributes, { primaryAttribute: 'strength', primaryPercent: -1 }),
            /不能为负/,
        );
    });

    test('负副倍率抛错', () => {
        assert.throws(
            () =>
                skillBaseDamage(attributes, {
                    primaryAttribute: 'strength',
                    primaryPercent: 100,
                    secondaryAttribute: 'technique',
                    secondaryPercent: -5,
                }),
            /不能为负/,
        );
    });
});

describe('减伤率（PRD-04 §5）', () => {
    test('防御为 0 时无减伤', () => {
        assert.equal(damageReduction(0), 0);
    });

    test('防御等于等级常数时减伤 50%', () => {
        assert.equal(damageReduction(DEFENSE_LEVEL_CONSTANT_BASE), 0.5);
    });

    test('减伤率永不到达 1', () => {
        // 公式天然收敛，高防单位不会完全免伤
        assert.ok(damageReduction(1_000_000) < 1);
    });

    test('负防御按 0 处理，不变成增伤', () => {
        // 破甲可能把护体压到负数
        assert.equal(damageReduction(-50), 0);
    });

    test('防御越高减伤单调不减', () => {
        let previous = damageReduction(0);
        for (let defense = 1; defense <= 500; defense += 1) {
            const current = damageReduction(defense);
            assert.ok(current >= previous);
            previous = current;
        }
    });

    test('等级常数越大同防御减伤越少', () => {
        assert.ok(damageReduction(100, 200) < damageReduction(100, 100));
    });

    test('非正等级常数抛错', () => {
        assert.throws(() => damageReduction(100, 0), /必须为正/);
    });
});

describe('最终伤害', () => {
    test('按减伤率折算', () => {
        assert.equal(finalDamage(100, 0.5), 50);
    });

    test('无减伤时等于基础伤害', () => {
        assert.equal(finalDamage(100, 0), 100);
    });

    test('至少造成 1 点伤害', () => {
        // 0 伤害会让高防单位完全无敌，战斗无法推进
        assert.equal(finalDamage(1, 0.99), 1);
        assert.equal(finalDamage(0, 0), 1);
    });

    test('结果向下取整', () => {
        // 100 × (1 - 0.333) = 66.7 → 66
        assert.equal(finalDamage(100, 0.333), 66);
    });

    test('减伤率超出区间抛错', () => {
        assert.throws(() => finalDamage(100, 1), /\[0, 1\)/);
        assert.throws(() => finalDamage(100, -0.1), /\[0, 1\)/);
    });
});

describe('防御属性选择（技术方案 §10.1）', () => {
    test('物理走护体', () => {
        assert.equal(defenseAttributeFor('physical'), 'armor');
    });

    test('法术走定力', () => {
        assert.equal(defenseAttributeFor('magical'), 'resistance');
    });
});

describe('完整结算链', () => {
    test('物理技能打有护体的目标', () => {
        const attacker = createAttributes({ strength: 100, technique: 40 });
        const defender = createAttributes({ armor: 100 });

        const base = skillBaseDamage(attacker, {
            primaryAttribute: 'strength',
            primaryPercent: 100,
            secondaryAttribute: 'technique',
            secondaryPercent: 50,
        });
        // 100 + 20 = 120
        assert.equal(base, 120);

        const reduction = damageReduction(defender[defenseAttributeFor('physical')]);
        assert.equal(reduction, 0.5);

        assert.equal(finalDamage(base, reduction), 60);
    });

    test('法术技能不受护体影响，只看定力', () => {
        const attacker = createAttributes({ magic: 100 });
        // 高护体但无定力，法术应打满
        const defender = createAttributes({ armor: 9999, resistance: 0 });

        const base = skillBaseDamage(attacker, {
            primaryAttribute: 'magic',
            primaryPercent: 100,
        });
        const reduction = damageReduction(defender[defenseAttributeFor('magical')]);
        assert.equal(reduction, 0);
        assert.equal(finalDamage(base, reduction), 100);
    });
});
