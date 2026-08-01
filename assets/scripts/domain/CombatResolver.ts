/**
 * 战斗结算器（PRD-04 §3、§5、§6、技术方案 §10、任务 P1-COMBAT-001）。
 *
 * 纯函数、无引擎依赖、不含随机源——随机数由调用方注入，
 * 因此同一初始状态加同一随机序列必然产出同一事件序列。
 * 这是战斗回放与自动化测试的前提（技术方案 §10）。
 *
 * **单向数据流**：step() 接收状态，返回新状态 + 事件列表。
 * 表现层只读事件，不参与任何判定。
 *
 * 关键设计：以 tick 为单位推进，不用真实时间。
 * 加速播放只是让表现层快进事件，结算顺序完全不变（PRD-04 §3）。
 */

import { actionIntervalTicks, skillBaseDamage, damageReduction, finalDamage, defenseAttributeFor } from './CombatFormulas';
import { resolveTauntedTarget, isEnemyTarget } from './SkillTargeting';
import {
    aliveUnitsOf,
    shieldAmountOf,
    hasStatus,
    isIncapacitated,
    evaluateOutcome,
} from './CombatState';
import type {
    CombatSnapshot,
    CombatUnit,
    CombatEventPayload,
    SkillRuntime,
    StatusEffect,
    CombatSide,
} from './CombatState';

/** 随机源。注入以保证可复现（技术方案 §10）。 */
export type RandomSource = () => number;

export interface StepResult {
    readonly snapshot: CombatSnapshot;
    readonly events: readonly CombatEventPayload[];
}

export interface ResolverConfig {
    readonly skills: ReadonlyMap<string, SkillRuntime>;
    readonly random: RandomSource;
    /** 防止无限战斗的 tick 上限。到达即判平局。 */
    readonly maxTicks?: number;
    /**
     * 减伤等级常数（PRD-04 §5 的「等级常数」），由 balance 表按遭遇等级算出。
     *
     * 省略时退回 DEFENSE_LEVEL_CONSTANT_BASE，与本参数引入前的行为一致——
     * 既有测试与尚未接入数据表的调用方不必同步改动。
     * 之所以取单个数而非等级：一场战斗内敌我可能不同级，
     * 若各按自身等级取 K，同一次攻击的减伤会依赖攻方等级，
     * 那意味着「打等级低的敌人反而更难破防」，反直觉且难以向玩家解释。
     * 故整场战斗用同一个 K，由遭遇配置决定。
     */
    readonly defenseLevelConstant?: number;
}

/** 默认上限：20Hz × 180 秒 = 3600 tick。 */
export const DEFAULT_MAX_TICKS = 3600;

/**
 * 推进一个 tick。
 *
 * 顺序固定（决定了结算可复现）：
 *   1. 状态效果跳伤/回复与到期移除
 *   2. 冷却与行动计时器递减
 *   3. 计时器归零的单位按 unitId 升序行动
 *   4. 判定胜负
 */
export function step(snapshot: CombatSnapshot, config: ResolverConfig): StepResult {
    if (snapshot.outcome !== null) {
        return { snapshot, events: [] };
    }

    const events: CombatEventPayload[] = [];
    let units = snapshot.units;

    // ── 1. 状态效果
    const afterStatus = tickStatuses(units, events);
    units = afterStatus;

    // ── 2. 冷却与计时器递减
    units = units.map((unit) => {
        if (unit.isDead) {
            return unit;
        }
        const cooldowns: Record<string, number> = {};
        for (const [skillId, remaining] of Object.entries(unit.cooldowns)) {
            if (remaining > 1) {
                cooldowns[skillId] = remaining - 1;
            }
            // 减到 0 的直接不写入，避免 map 无限增长
        }
        // 被控制时计时器不走，等于延迟行动（PRD-04 §3）
        const timer = isIncapacitated(unit)
            ? unit.actionTimer
            : Math.max(0, unit.actionTimer - 1);
        return { ...unit, cooldowns, actionTimer: timer };
    });

    // ── 3. 行动。按 unitId 升序，保证同 tick 多单位的顺序确定
    const actors = units
        .filter((unit) => !unit.isDead && unit.actionTimer === 0 && !isIncapacitated(unit))
        .map((unit) => unit.unitId)
        .sort((a, b) => a - b);

    for (const actorId of actors) {
        const current = units.find((unit) => unit.unitId === actorId);
        // 可能已被本 tick 内的前一个行动击杀
        if (!current || current.isDead) {
            continue;
        }
        units = performAction(units, actorId, config, events);
    }

    // ── 4. 胜负
    const tick = snapshot.tick + 1;
    const nextSnapshot: CombatSnapshot = { tick, units, outcome: null };
    let outcome = evaluateOutcome(nextSnapshot);

    const maxTicks = config.maxTicks ?? DEFAULT_MAX_TICKS;
    if (outcome === null && tick >= maxTicks) {
        // 超时判平局：避免双方都无输出时永久卡住
        outcome = 'draw';
    }

    if (outcome !== null) {
        events.push({ type: 'combat.ended', outcome, tick });
    }

    return { snapshot: { tick, units, outcome }, events };
}

/** 状态效果跳伤、回复与到期。 */
function tickStatuses(
    units: readonly CombatUnit[],
    events: CombatEventPayload[],
): readonly CombatUnit[] {
    return units.map((unit) => {
        if (unit.isDead || unit.statuses.length === 0) {
            return unit;
        }

        let hp = unit.currentHp;
        const kept: StatusEffect[] = [];

        for (const status of unit.statuses) {
            // 持续伤害类每 tick 生效
            if (status.kind === 'poison' || status.kind === 'burn') {
                const amount = Math.max(1, status.magnitude);
                hp -= amount;
                events.push({
                    type: 'status.ticked',
                    targetId: unit.unitId,
                    kind: status.kind,
                    amount,
                });
            }

            if (status.remainingTicks <= 1) {
                events.push({
                    type: 'status.expired',
                    targetId: unit.unitId,
                    kind: status.kind,
                });
                continue;
            }
            kept.push({ ...status, remainingTicks: status.remainingTicks - 1 });
        }

        const isDead = hp <= 0;
        if (isDead && !unit.isDead) {
            events.push({ type: 'unit.died', unitId: unit.unitId });
        }

        return {
            ...unit,
            currentHp: Math.max(0, hp),
            statuses: kept,
            isDead,
        };
    });
}

/** 执行一次行动：选技能 → 选目标 → 结算 → 重置计时器。 */
function performAction(
    units: readonly CombatUnit[],
    actorId: number,
    config: ResolverConfig,
    events: CombatEventPayload[],
): readonly CombatUnit[] {
    const actor = units.find((unit) => unit.unitId === actorId)!;

    const choice = chooseSkill(units, actor, config);
    if (!choice) {
        // 无可用技能：重置计时器避免死循环，不产生行动事件
        return units.map((unit) =>
            unit.unitId === actorId ? { ...unit, actionTimer: 20 } : unit,
        );
    }

    const { skill, targetIds } = choice;
    events.push({
        type: 'unit.acted',
        actorId,
        skillId: skill.skillId,
        targetIds,
    });

    let next = units;
    for (const targetId of targetIds) {
        next = applySkillTo(next, actor, skill, targetId, config, events);
    }

    // 重置行动计时器与冷却
    return next.map((unit) => {
        if (unit.unitId !== actorId) {
            return unit;
        }
        const interval = actionIntervalTicks(
            skill.baseIntervalTicks,
            unit.attributes.speed,
        );
        const cooldowns = { ...unit.cooldowns };
        if (skill.cooldownTicks > 0) {
            cooldowns[skill.skillId] = skill.cooldownTicks;
        }
        return { ...unit, actionTimer: interval, cooldowns };
    });
}

interface SkillChoice {
    readonly skill: SkillRuntime;
    readonly targetIds: readonly number[];
}

/**
 * 选技能与目标。
 *
 * 按 skillIds 顺序取第一个可用的——PRD-04 §7 的自动策略规则
 * （阈值判断）属于 P2，此处先用固定顺序，行为可预测便于测试。
 */
function chooseSkill(
    units: readonly CombatUnit[],
    actor: CombatUnit,
    config: ResolverConfig,
): SkillChoice | null {
    const snapshot: CombatSnapshot = { tick: 0, units, outcome: null };

    for (const skillId of actor.skillIds) {
        const skill = config.skills.get(skillId);
        if (!skill) {
            continue;
        }
        if ((actor.cooldowns[skillId] ?? 0) > 0) {
            continue;
        }
        // 沉默禁止施法，但不影响普通攻击类（无状态效果的技能）
        if (hasStatus(actor, 'silence') && skill.appliesStatus) {
            continue;
        }

        const targetIds = selectTargets(snapshot, actor, skill, config);
        if (targetIds.length === 0) {
            continue;
        }
        return { skill, targetIds };
    }
    return null;
}

/** 按目标类型选目标（PRD-04 §4），并应用嘲讽（PRD-04 §6）。 */
function selectTargets(
    snapshot: CombatSnapshot,
    actor: CombatUnit,
    skill: SkillRuntime,
    config: ResolverConfig,
): readonly number[] {
    const opposing: CombatSide = actor.side === 'ally' ? 'enemy' : 'ally';
    const enemies = aliveUnitsOf(snapshot, opposing);
    const allies = aliveUnitsOf(snapshot, actor.side);

    switch (skill.targetType) {
        case 'SELF':
            return [actor.unitId];
        case 'ALLY_ALL':
            return allies.map((unit) => unit.unitId);
        case 'ENEMY_ALL':
            return enemies.map((unit) => unit.unitId);
        case 'ALLY_SINGLE':
            return allies.length > 0 ? [allies[0]!.unitId] : [];
        case 'ALLY_LOWEST_HP': {
            const lowest = lowestHp(allies);
            return lowest ? [lowest.unitId] : [];
        }
        case 'ENEMY_LOWEST_HP': {
            const lowest = lowestHp(enemies);
            return lowest ? [applyTaunt(skill, lowest.unitId, enemies)] : [];
        }
        case 'ENEMY_HIGHEST_STAT': {
            const highest = enemies.reduce<CombatUnit | null>(
                (best, unit) =>
                    !best || unit.attributes.strength > best.attributes.strength ? unit : best,
                null,
            );
            return highest
                ? [applyTaunt(skill, highest.unitId, enemies)]
                : [];
        }
        case 'ENEMY_RANDOM_MULTI': {
            if (enemies.length === 0) {
                return [];
            }
            // 随机两段，允许重复命中同一目标
            const count = Math.min(2, enemies.length);
            const picked: number[] = [];
            for (let i = 0; i < count; i += 1) {
                const index = Math.floor(config.random() * enemies.length);
                picked.push(enemies[Math.min(index, enemies.length - 1)]!.unitId);
            }
            return picked;
        }
        case 'ENEMY_SINGLE': {
            if (enemies.length === 0) {
                return [];
            }
            return [applyTaunt(skill, enemies[0]!.unitId, enemies)];
        }
    }
}

/**
 * 嘲讽改指向。只对敌方单体生效（技术方案 §11.1）。
 * 只需知道「谁在嘲讽」，与施法者本身无关，故不传 actor。
 */
function applyTaunt(
    skill: SkillRuntime,
    intendedTargetId: number,
    enemies: readonly CombatUnit[],
): number {
    const taunts = enemies
        .filter((unit) => unit.tauntStrength > 0)
        .map((unit) => ({
            taunterId: unit.unitId,
            strength: unit.tauntStrength,
            isAlive: !unit.isDead,
        }));

    return resolveTauntedTarget(
        skill.targetType,
        skill.ignoreTaunt,
        intendedTargetId,
        taunts,
    );
}

function lowestHp(units: readonly CombatUnit[]): CombatUnit | null {
    return units.reduce<CombatUnit | null>(
        (best, unit) => (!best || unit.currentHp < best.currentHp ? unit : best),
        null,
    );
}

/** 对单个目标结算技能效果。 */
function applySkillTo(
    units: readonly CombatUnit[],
    actor: CombatUnit,
    skill: SkillRuntime,
    targetId: number,
    config: ResolverConfig,
    events: CombatEventPayload[],
): readonly CombatUnit[] {
    const target = units.find((unit) => unit.unitId === targetId);
    if (!target || target.isDead) {
        return units;
    }

    // 治疗类：damageKind 为 none 且指向友方
    const isHeal = skill.damageKind === 'none' && !isEnemyTarget(skill.targetType);

    let updated = units;

    if (skill.damageKind !== 'none') {
        const base = skillBaseDamage(actor.attributes, {
            primaryAttribute: skill.primaryAttribute,
            primaryPercent: skill.primaryPercent,
            secondaryAttribute: skill.secondaryAttribute,
            secondaryPercent: skill.secondaryPercent,
        });

        // 破甲削减防御后再算减伤
        const defenseKey = defenseAttributeFor(skill.damageKind);
        const armorBreak = target.statuses
            .filter((status) => status.kind === 'armor_break' || status.kind === 'resist_down')
            .reduce((sum, status) => sum + status.magnitude, 0);
        const defense = target.attributes[defenseKey] - armorBreak;

        const raw = finalDamage(
            base,
            damageReduction(defense, config.defenseLevelConstant),
        );

        // 护盾优先吸收
        const shield = shieldAmountOf(target);
        const absorbed = Math.min(shield, raw);
        const toHp = raw - absorbed;

        updated = updated.map((unit) => {
            if (unit.unitId !== targetId) {
                return unit;
            }
            const statuses = absorbed > 0 ? consumeShield(unit, absorbed) : unit.statuses;
            const hp = Math.max(0, unit.currentHp - toHp);
            return { ...unit, currentHp: hp, statuses, isDead: hp <= 0 };
        });

        events.push({
            type: 'damage.dealt',
            actorId: actor.unitId,
            targetId,
            amount: toHp,
            damageKind: skill.damageKind,
            absorbedByShield: absorbed,
        });

        const after = updated.find((unit) => unit.unitId === targetId)!;
        if (after.isDead && !target.isDead) {
            events.push({ type: 'unit.died', unitId: targetId });
        }
    } else if (isHeal && skill.primaryPercent > 0) {
        const amount = skillBaseDamage(actor.attributes, {
            primaryAttribute: skill.primaryAttribute,
            primaryPercent: skill.primaryPercent,
            secondaryAttribute: skill.secondaryAttribute,
            secondaryPercent: skill.secondaryPercent,
        });
        updated = updated.map((unit) =>
            unit.unitId === targetId
                ? { ...unit, currentHp: Math.min(unit.maxHp, unit.currentHp + amount) }
                : unit,
        );
        events.push({ type: 'heal.applied', actorId: actor.unitId, targetId, amount });
    }

    // 施加状态
    if (skill.appliesStatus) {
        const { kind, durationTicks, magnitude } = skill.appliesStatus;
        updated = updated.map((unit) =>
            unit.unitId === targetId
                ? {
                      ...unit,
                      statuses: [
                          ...unit.statuses,
                          {
                              kind,
                              remainingTicks: durationTicks,
                              magnitude,
                              sourceId: actor.unitId,
                          },
                      ],
                      // 嘲讽通过状态施加时同步更新强度
                      tauntStrength:
                          kind === 'gather_spirit' ? magnitude : unit.tauntStrength,
                  }
                : unit,
        );
        events.push({
            type: 'status.applied',
            targetId,
            kind,
            durationTicks,
            magnitude,
        });
    }

    return updated;
}

/** 按吸收量消耗护盾，耗尽的移除。 */
function consumeShield(unit: CombatUnit, absorbed: number): readonly StatusEffect[] {
    let remaining = absorbed;
    const result: StatusEffect[] = [];
    for (const status of unit.statuses) {
        if (status.kind !== 'shield' || remaining <= 0) {
            result.push(status);
            continue;
        }
        const used = Math.min(status.magnitude, remaining);
        remaining -= used;
        const left = status.magnitude - used;
        if (left > 0) {
            result.push({ ...status, magnitude: left });
        }
    }
    return result;
}

/**
 * 跑完整场战斗。
 * 供自动化测试与战力评估使用；实际游戏中由表现层逐 tick 播放。
 */
export function runToCompletion(
    initial: CombatSnapshot,
    config: ResolverConfig,
): { readonly snapshot: CombatSnapshot; readonly events: readonly CombatEventPayload[] } {
    let snapshot = initial;
    const events: CombatEventPayload[] = [];
    const maxTicks = config.maxTicks ?? DEFAULT_MAX_TICKS;

    while (snapshot.outcome === null && snapshot.tick < maxTicks) {
        const result = step(snapshot, config);
        snapshot = result.snapshot;
        events.push(...result.events);
    }

    return { snapshot, events };
}
