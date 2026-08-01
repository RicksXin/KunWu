import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { step, runToCompletion, DEFAULT_MAX_TICKS } from 'db://assets/scripts/domain/CombatResolver';
import type { ResolverConfig } from 'db://assets/scripts/domain/CombatResolver';
import { evaluateOutcome, aliveUnitsOf } from 'db://assets/scripts/domain/CombatState';
import type {
    CombatSnapshot,
    CombatUnit,
    SkillRuntime,
    CombatEventPayload,
} from 'db://assets/scripts/domain/CombatState';
import { createAttributes } from 'db://assets/scripts/domain/Attributes';

function unit(overrides: Partial<CombatUnit> & { unitId: number; side: 'ally' | 'enemy' }): CombatUnit {
    return {
        nameKey: `unit.${overrides.unitId}`,
        attributes: createAttributes({ strength: 50, speed: 0, armor: 0, resistance: 0 }),
        currentHp: 100,
        maxHp: 100,
        skillIds: ['strike'],
        actionTimer: 1,
        cooldowns: {},
        statuses: [],
        isDead: false,
        tauntStrength: 0,
        ...overrides,
    };
}

const STRIKE: SkillRuntime = {
    skillId: 'strike',
    damageKind: 'physical',
    targetType: 'ENEMY_SINGLE',
    ignoreTaunt: false,
    baseIntervalTicks: 20,
    cooldownTicks: 0,
    primaryAttribute: 'strength',
    primaryPercent: 100,
};

function makeConfig(
    skills: readonly SkillRuntime[] = [STRIKE],
    random: () => number = () => 0,
): ResolverConfig {
    return {
        skills: new Map(skills.map((s) => [s.skillId, s])),
        random,
    };
}

function snapshotOf(units: readonly CombatUnit[]): CombatSnapshot {
    return { tick: 0, units, outcome: null };
}

describe('tick 推进（PRD-04 §3）', () => {
    test('每次 step 推进一个 tick', () => {
        const s = snapshotOf([unit({ unitId: 1, side: 'ally', actionTimer: 5 })]);
        assert.equal(step(s, makeConfig()).snapshot.tick, 1);
    });

    test('行动计时器递减', () => {
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', actionTimer: 5 }),
            unit({ unitId: 2, side: 'enemy', actionTimer: 5 }),
        ]);
        const next = step(s, makeConfig()).snapshot;
        assert.equal(next.units[0]!.actionTimer, 4);
    });

    test('计时器归零时行动并广播事件', () => {
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', actionTimer: 1 }),
            unit({ unitId: 2, side: 'enemy' }),
        ]);
        const { events } = step(s, makeConfig());
        assert.ok(events.some((e) => e.type === 'unit.acted'));
    });

    test('已结束的战斗不再推进', () => {
        const s: CombatSnapshot = { tick: 5, units: [], outcome: 'ally_win' };
        const result = step(s, makeConfig());
        assert.equal(result.snapshot.tick, 5);
        assert.deepEqual([...result.events], []);
    });

    test('行动后按遁速重置计时器', () => {
        const fast = unit({
            unitId: 1,
            side: 'ally',
            actionTimer: 1,
            attributes: createAttributes({ strength: 50, speed: 100 }),
        });
        const s = snapshotOf([fast, unit({ unitId: 2, side: 'enemy' })]);
        const next = step(s, makeConfig()).snapshot;
        // 20 × 100/(100+100) = 10
        assert.equal(next.units[0]!.actionTimer, 10);
    });
});

describe('单向数据流（技术方案 §10）', () => {
    test('step 不修改传入的 snapshot', () => {
        const original = unit({ unitId: 1, side: 'ally', actionTimer: 1 });
        const s = snapshotOf([original, unit({ unitId: 2, side: 'enemy' })]);
        const hpBefore = s.units[1]!.currentHp;

        step(s, makeConfig());

        // 表现层可能持有旧快照，被就地修改会导致回放错乱
        assert.equal(s.tick, 0);
        assert.equal(s.units[1]!.currentHp, hpBefore);
    });

    test('相同输入产出相同事件序列（可复现）', () => {
        const build = () =>
            snapshotOf([
                unit({ unitId: 1, side: 'ally', actionTimer: 1 }),
                unit({ unitId: 2, side: 'enemy', actionTimer: 3 }),
            ]);
        const a = runToCompletion(build(), makeConfig());
        const b = runToCompletion(build(), makeConfig());
        // 战斗回放的前提
        assert.deepEqual(a.events, b.events);
        assert.equal(a.snapshot.outcome, b.snapshot.outcome);
    });

    test('同 tick 多单位按 unitId 升序行动', () => {
        const s = snapshotOf([
            unit({ unitId: 3, side: 'ally', actionTimer: 1 }),
            unit({ unitId: 1, side: 'ally', actionTimer: 1 }),
            unit({ unitId: 9, side: 'enemy', actionTimer: 1, currentHp: 9999, maxHp: 9999 }),
        ]);
        const { events } = step(s, makeConfig());
        const actors = events
            .filter((e): e is Extract<CombatEventPayload, { type: 'unit.acted' }> => e.type === 'unit.acted')
            .map((e) => e.actorId);
        // 三者同 tick 行动，顺序必须按 unitId 升序而非数组顺序（3, 1, 9）
        assert.deepEqual(actors, [1, 3, 9]);
    });
});

describe('伤害结算（PRD-04 §5）', () => {
    test('物理伤害按力道计算并扣血', () => {
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', actionTimer: 1 }),
            unit({ unitId: 2, side: 'enemy' }),
        ]);
        const { snapshot, events } = step(s, makeConfig());
        const dmg = events.find((e) => e.type === 'damage.dealt');
        assert.ok(dmg);
        // 力道 50 × 100%，护体 0 → 50
        assert.equal(snapshot.units[1]!.currentHp, 50);
    });

    test('护体减伤生效', () => {
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', actionTimer: 1 }),
            unit({
                unitId: 2,
                side: 'enemy',
                attributes: createAttributes({ armor: 100 }),
            }),
        ]);
        const { snapshot } = step(s, makeConfig());
        // 护体 100 = 50% 减伤 → 25 伤害
        assert.equal(snapshot.units[1]!.currentHp, 75);
    });

    test('法术无视护体，只看定力', () => {
        const bolt: SkillRuntime = {
            ...STRIKE,
            skillId: 'bolt',
            damageKind: 'magical',
            primaryAttribute: 'magic',
        };
        const s = snapshotOf([
            unit({
                unitId: 1,
                side: 'ally',
                actionTimer: 1,
                skillIds: ['bolt'],
                attributes: createAttributes({ magic: 60 }),
            }),
            unit({
                unitId: 2,
                side: 'enemy',
                attributes: createAttributes({ armor: 9999, resistance: 0 }),
            }),
        ]);
        const { snapshot } = step(s, makeConfig([bolt]));
        // 高护体不该挡法术
        assert.equal(snapshot.units[1]!.currentHp, 40);
    });

    test('破甲削减防御后再算减伤', () => {
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', actionTimer: 1 }),
            unit({
                unitId: 2,
                side: 'enemy',
                attributes: createAttributes({ armor: 100 }),
                statuses: [
                    { kind: 'armor_break', remainingTicks: 10, magnitude: 100, sourceId: 1 },
                ],
            }),
        ]);
        const { snapshot } = step(s, makeConfig());
        // 护体 100 - 破甲 100 = 0 → 满额 50 伤害
        assert.equal(snapshot.units[1]!.currentHp, 50);
    });

    test('至少造成 1 点伤害', () => {
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', actionTimer: 1 }),
            unit({
                unitId: 2,
                side: 'enemy',
                attributes: createAttributes({ armor: 1_000_000 }),
            }),
        ]);
        const { snapshot } = step(s, makeConfig());
        // 否则高防单位完全无敌，战斗推不动
        assert.ok(snapshot.units[1]!.currentHp < 100);
    });
});

describe('护盾（PRD-04 §8）', () => {
    test('护盾优先吸收伤害', () => {
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', actionTimer: 1 }),
            unit({
                unitId: 2,
                side: 'enemy',
                statuses: [{ kind: 'shield', remainingTicks: 10, magnitude: 30, sourceId: 2 }],
            }),
        ]);
        const { snapshot, events } = step(s, makeConfig());
        const dmg = events.find(
            (e): e is Extract<CombatEventPayload, { type: 'damage.dealt' }> =>
                e.type === 'damage.dealt',
        );
        assert.equal(dmg?.absorbedByShield, 30);
        // 50 伤害 - 30 护盾 = 20 进血量
        assert.equal(snapshot.units[1]!.currentHp, 80);
    });

    test('护盾足够时血量不掉', () => {
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', actionTimer: 1 }),
            unit({
                unitId: 2,
                side: 'enemy',
                statuses: [{ kind: 'shield', remainingTicks: 10, magnitude: 999, sourceId: 2 }],
            }),
        ]);
        const { snapshot } = step(s, makeConfig());
        assert.equal(snapshot.units[1]!.currentHp, 100);
    });

    test('护盾耗尽后被移除', () => {
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', actionTimer: 1 }),
            unit({
                unitId: 2,
                side: 'enemy',
                statuses: [{ kind: 'shield', remainingTicks: 10, magnitude: 10, sourceId: 2 }],
            }),
        ]);
        const { snapshot } = step(s, makeConfig());
        const shields = snapshot.units[1]!.statuses.filter((st) => st.kind === 'shield');
        assert.equal(shields.length, 0);
    });
});

describe('嘲讽（PRD-04 §6）', () => {
    test('嘲讽者吸引敌方单体技能', () => {
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', actionTimer: 1 }),
            unit({ unitId: 2, side: 'enemy' }),
            unit({ unitId: 3, side: 'enemy', tauntStrength: 100 }),
        ]);
        const { events } = step(s, makeConfig());
        const dmg = events.find(
            (e): e is Extract<CombatEventPayload, { type: 'damage.dealt' }> =>
                e.type === 'damage.dealt',
        );
        // 默认打 unitId 2，嘲讽应改指向 3
        assert.equal(dmg?.targetId, 3);
    });

    test('群体技能不受嘲讽影响', () => {
        const sweep: SkillRuntime = {
            ...STRIKE,
            skillId: 'sweep',
            targetType: 'ENEMY_ALL',
        };
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', actionTimer: 1, skillIds: ['sweep'] }),
            unit({ unitId: 2, side: 'enemy' }),
            unit({ unitId: 3, side: 'enemy', tauntStrength: 100 }),
        ]);
        const { events } = step(s, makeConfig([sweep]));
        const targets = events
            .filter((e): e is Extract<CombatEventPayload, { type: 'damage.dealt' }> => e.type === 'damage.dealt')
            .map((e) => e.targetId);
        // 两个都该被打到
        assert.deepEqual(targets.sort(), [2, 3]);
    });

    test('ignoreTaunt 技能无视嘲讽', () => {
        const pierce: SkillRuntime = { ...STRIKE, skillId: 'pierce', ignoreTaunt: true };
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', actionTimer: 1, skillIds: ['pierce'] }),
            unit({ unitId: 2, side: 'enemy' }),
            unit({ unitId: 3, side: 'enemy', tauntStrength: 100 }),
        ]);
        const { events } = step(s, makeConfig([pierce]));
        const dmg = events.find(
            (e): e is Extract<CombatEventPayload, { type: 'damage.dealt' }> =>
                e.type === 'damage.dealt',
        );
        assert.equal(dmg?.targetId, 2);
    });
});

describe('控制效果（PRD-04 §8）', () => {
    test('眩晕时计时器不走，无法行动', () => {
        const s = snapshotOf([
            unit({
                unitId: 1,
                side: 'ally',
                actionTimer: 1,
                statuses: [{ kind: 'stun', remainingTicks: 5, magnitude: 0, sourceId: 2 }],
            }),
            unit({ unitId: 2, side: 'enemy' }),
        ]);
        const { snapshot, events } = step(s, makeConfig());
        const actedByOne = events.some(
            (e) => e.type === 'unit.acted' && e.actorId === 1,
        );
        assert.equal(actedByOne, false);
        // 计时器保持不变，等于延迟行动而非跳过
        assert.equal(snapshot.units[0]!.actionTimer, 1);
    });

    test('缠绕同样阻止行动', () => {
        const s = snapshotOf([
            unit({
                unitId: 1,
                side: 'ally',
                actionTimer: 1,
                statuses: [{ kind: 'entangle', remainingTicks: 3, magnitude: 0, sourceId: 2 }],
            }),
            unit({ unitId: 2, side: 'enemy' }),
        ]);
        const { events } = step(s, makeConfig());
        const actedByOne = events.some(
            (e) => e.type === 'unit.acted' && e.actorId === 1,
        );
        assert.equal(actedByOne, false);
    });
});

describe('持续伤害（PRD-04 §8）', () => {
    test('中毒每 tick 扣血', () => {
        const s = snapshotOf([
            unit({
                unitId: 1,
                side: 'ally',
                actionTimer: 99,
                statuses: [{ kind: 'poison', remainingTicks: 5, magnitude: 7, sourceId: 2 }],
            }),
            unit({ unitId: 2, side: 'enemy', actionTimer: 99 }),
        ]);
        const { snapshot, events } = step(s, makeConfig());
        assert.equal(snapshot.units[0]!.currentHp, 93);
        assert.ok(events.some((e) => e.type === 'status.ticked'));
    });

    test('状态到期后移除并广播', () => {
        const s = snapshotOf([
            unit({
                unitId: 1,
                side: 'ally',
                actionTimer: 99,
                statuses: [{ kind: 'burn', remainingTicks: 1, magnitude: 5, sourceId: 2 }],
            }),
            unit({ unitId: 2, side: 'enemy', actionTimer: 99 }),
        ]);
        const { snapshot, events } = step(s, makeConfig());
        assert.equal(snapshot.units[0]!.statuses.length, 0);
        assert.ok(events.some((e) => e.type === 'status.expired'));
    });

    test('持续伤害可致死', () => {
        const s = snapshotOf([
            unit({
                unitId: 1,
                side: 'ally',
                actionTimer: 99,
                currentHp: 3,
                statuses: [{ kind: 'poison', remainingTicks: 5, magnitude: 10, sourceId: 2 }],
            }),
            unit({ unitId: 2, side: 'enemy', actionTimer: 99 }),
        ]);
        const { snapshot, events } = step(s, makeConfig());
        assert.equal(snapshot.units[0]!.isDead, true);
        assert.ok(events.some((e) => e.type === 'unit.died'));
        assert.equal(snapshot.outcome, 'enemy_win');
    });
});

describe('胜负判定（PRD-04 §5）', () => {
    test('敌方全灭为我方胜', () => {
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally' }),
            unit({ unitId: 2, side: 'enemy', isDead: true }),
        ]);
        assert.equal(evaluateOutcome(s), 'ally_win');
    });

    test('我方全灭为敌方胜', () => {
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', isDead: true }),
            unit({ unitId: 2, side: 'enemy' }),
        ]);
        assert.equal(evaluateOutcome(s), 'enemy_win');
    });

    test('双方全灭为平局', () => {
        // 避免"最后一击互换"时结果依赖判定顺序
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', isDead: true }),
            unit({ unitId: 2, side: 'enemy', isDead: true }),
        ]);
        assert.equal(evaluateOutcome(s), 'draw');
    });

    test('双方存活时未结束', () => {
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally' }),
            unit({ unitId: 2, side: 'enemy' }),
        ]);
        assert.equal(evaluateOutcome(s), null);
    });

    test('战斗结束广播 combat.ended', () => {
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', actionTimer: 1 }),
            unit({ unitId: 2, side: 'enemy', currentHp: 1 }),
        ]);
        const { events } = step(s, makeConfig());
        const ended = events.find(
            (e): e is Extract<CombatEventPayload, { type: 'combat.ended' }> =>
                e.type === 'combat.ended',
        );
        assert.equal(ended?.outcome, 'ally_win');
    });
});

describe('完整战斗', () => {
    test('4v2 能正常打完', () => {
        const units = [
            ...[1, 2, 3, 4].map((id) => unit({ unitId: id, side: 'ally', actionTimer: id })),
            ...[5, 6].map((id) => unit({ unitId: id, side: 'enemy', actionTimer: id })),
        ];
        const { snapshot } = runToCompletion(snapshotOf(units), makeConfig());
        assert.equal(snapshot.outcome, 'ally_win');
        assert.equal(aliveUnitsOf(snapshot, 'enemy').length, 0);
    });

    test('双方都无输出时超时判平局', () => {
        // 技能表为空 → 无人能行动
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', skillIds: [] }),
            unit({ unitId: 2, side: 'enemy', skillIds: [] }),
        ]);
        const { snapshot } = runToCompletion(s, { skills: new Map(), random: () => 0, maxTicks: 50 });
        assert.equal(snapshot.outcome, 'draw');
    });

    test('默认 tick 上限为 3600（180 秒）', () => {
        assert.equal(DEFAULT_MAX_TICKS, 3600);
    });

    test('战斗不会无限循环', () => {
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', currentHp: 99999, maxHp: 99999 }),
            unit({ unitId: 2, side: 'enemy', currentHp: 99999, maxHp: 99999 }),
        ]);
        const { snapshot } = runToCompletion(s, makeConfig());
        assert.ok(snapshot.outcome !== null, '战斗未终止');
        assert.ok(snapshot.tick <= DEFAULT_MAX_TICKS);
    });
});

describe('冷却（PRD-04 §4）', () => {
    test('冷却中的技能不被选中', () => {
        const s = snapshotOf([
            unit({
                unitId: 1,
                side: 'ally',
                actionTimer: 1,
                cooldowns: { strike: 10 },
            }),
            unit({ unitId: 2, side: 'enemy' }),
        ]);
        const { events } = step(s, makeConfig());
        // 只断言该单位未行动——对手仍会正常行动
        const actedByOne = events.some(
            (e) => e.type === 'unit.acted' && e.actorId === 1,
        );
        assert.equal(actedByOne, false);
    });

    test('使用后进入冷却', () => {
        const heavy: SkillRuntime = { ...STRIKE, skillId: 'heavy', cooldownTicks: 40 };
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', actionTimer: 1, skillIds: ['heavy'] }),
            unit({ unitId: 2, side: 'enemy', currentHp: 9999, maxHp: 9999 }),
        ]);
        const { snapshot } = step(s, makeConfig([heavy]));
        assert.equal(snapshot.units[0]!.cooldowns.heavy, 40);
    });

    test('冷却逐 tick 递减', () => {
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', actionTimer: 99, cooldowns: { strike: 3 } }),
            unit({ unitId: 2, side: 'enemy', actionTimer: 99 }),
        ]);
        const { snapshot } = step(s, makeConfig());
        assert.equal(snapshot.units[0]!.cooldowns.strike, 2);
    });
});

describe('减伤等级常数注入（Docs/13 §3.2）', () => {
    /** 护体 100 的守方，攻方裸伤 50。K=100 时减伤 50%，K=241 时减伤约 29%。 */
    function armoredPair() {
        return snapshotOf([
            unit({ unitId: 1, side: 'ally', actionTimer: 1 }),
            unit({
                unitId: 2,
                side: 'enemy',
                actionTimer: 99,
                attributes: createAttributes({ armor: 100 }),
                currentHp: 500,
                maxHp: 500,
            }),
        ]);
    }

    function damageDealt(config: ResolverConfig): number {
        const { snapshot } = step(armoredPair(), config);
        return 500 - snapshot.units[1]!.currentHp;
    }

    test('省略 defenseLevelConstant 时行为与引入该参数前一致', () => {
        // 裸伤 50，护体 100，K=100 → 减伤 50% → 25
        assert.equal(damageDealt(makeConfig()), 25);
    });

    test('K 增大时减伤降低，伤害提高', () => {
        const withHigherK = damageDealt({ ...makeConfig(), defenseLevelConstant: 241 });
        // 50 × (1 - 100/341) = 35.3 → floor 35
        assert.equal(withHigherK, 35);
        assert.ok(withHigherK > damageDealt(makeConfig()));
    });

    test('K 极大时减伤趋近 0，防御几乎无效', () => {
        // 减伤 100/1000100 ≈ 0.01%，floor(50 × 0.9999) = 49；
        // 取不到 50 是 finalDamage 的向下取整所致，不是减伤没生效
        assert.equal(damageDealt({ ...makeConfig(), defenseLevelConstant: 1_000_000 }), 49);
    });

    test('破甲与注入的 K 共同作用', () => {
        const s = snapshotOf([
            unit({ unitId: 1, side: 'ally', actionTimer: 1 }),
            unit({
                unitId: 2,
                side: 'enemy',
                actionTimer: 99,
                attributes: createAttributes({ armor: 100 }),
                currentHp: 500,
                maxHp: 500,
                statuses: [
                    { kind: 'armor_break', remainingTicks: 10, magnitude: 60, sourceId: 1 },
                ],
            }),
        ]);
        // 护体 100 - 破甲 60 = 40，K=241 → 减伤 40/281 = 14.2% → 50 × 0.858 = 42
        const { snapshot } = step(s, { ...makeConfig(), defenseLevelConstant: 241 });
        assert.equal(500 - snapshot.units[1]!.currentHp, 42);
    });
});
