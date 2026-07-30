/**
 * 战斗状态与事件定义（PRD-04 §3、技术方案 §10、任务 P1-COMBAT-001）。
 *
 * 纯数据契约，无引擎依赖。
 *
 * **单向数据流的类型基础**：所有状态变化都必须产出 CombatEvent，
 * 表现层只读事件。故此处的状态对象一律 readonly——
 * 要改状态只能经结算器返回新状态，从类型上堵住"表现层顺手改一下"。
 */

import type { Attributes } from './Attributes';
import type { DamageKind } from './CombatTypes';
import type { SkillTargetType } from './SkillTargeting';

/** 阵营。无前后排，故阵营是唯一的位置概念（PRD-04 §2）。 */
export type CombatSide = 'ally' | 'enemy';

/** 状态效果类型（PRD-04 §8）。 */
export const BUFF_KINDS = [
    'shield',
    'haste',
    'gather_spirit',
    'counter',
    'purify',
    'damage_up',
] as const;
export const DEBUFF_KINDS = [
    'armor_break',
    'resist_down',
    'poison',
    'burn',
    'slow',
    'seal',
] as const;
/** 控制类：会暂停或延迟行动（PRD-04 §3）。 */
export const CONTROL_KINDS = ['stun', 'entangle', 'silence'] as const;

export type StatusKind =
    | (typeof BUFF_KINDS)[number]
    | (typeof DEBUFF_KINDS)[number]
    | (typeof CONTROL_KINDS)[number];

export function isControlStatus(kind: StatusKind): boolean {
    return (CONTROL_KINDS as readonly string[]).includes(kind);
}

export interface StatusEffect {
    readonly kind: StatusKind;
    /** 剩余 tick 数。0 表示本 tick 结束后移除。 */
    readonly remainingTicks: number;
    /** 效果强度。护盾为吸收量，中毒为每跳伤害，破甲为削减值。 */
    readonly magnitude: number;
    /** 施加者，用于反击与伤害归属。 */
    readonly sourceId: number;
}

export interface CombatUnit {
    readonly unitId: number;
    readonly side: CombatSide;
    /** 显示名的本地化 Key。 */
    readonly nameKey: string;
    readonly attributes: Attributes;
    readonly currentHp: number;
    readonly maxHp: number;
    /** 三个主动技能的 ID（PRD-04 §4：每职业固定三技能）。 */
    readonly skillIds: readonly string[];
    /**
     * 行动计时器，单位 tick。递减到 0 时行动。
     * 用倒计时而非累加进度：控制效果延迟行动时直接加计时器即可。
     */
    readonly actionTimer: number;
    /** 技能 ID → 剩余冷却 tick。 */
    readonly cooldowns: Readonly<Record<string, number>>;
    readonly statuses: readonly StatusEffect[];
    readonly isDead: boolean;
    /** 嘲讽强度。>0 时可吸引敌方单体技能（PRD-04 §6）。 */
    readonly tauntStrength: number;
}

export interface SkillRuntime {
    readonly skillId: string;
    readonly damageKind: DamageKind;
    readonly targetType: SkillTargetType;
    readonly ignoreTaunt: boolean;
    /** 基础行动间隔，tick。经遁速修正后决定下次行动时间。 */
    readonly baseIntervalTicks: number;
    readonly cooldownTicks: number;
    /** 主属性来源，必须显式声明（技术方案 §10.1）。 */
    readonly primaryAttribute: keyof Attributes;
    readonly primaryPercent: number;
    readonly secondaryAttribute?: keyof Attributes;
    readonly secondaryPercent?: number;
    /** 命中后施加的状态。 */
    readonly appliesStatus?: {
        readonly kind: StatusKind;
        readonly durationTicks: number;
        readonly magnitude: number;
    };
}

export interface CombatSnapshot {
    /** 当前 tick 数，从 0 开始。 */
    readonly tick: number;
    readonly units: readonly CombatUnit[];
    /** 已结束时的胜负。null 表示进行中。 */
    readonly outcome: CombatOutcome | null;
}

export type CombatOutcome = 'ally_win' | 'enemy_win' | 'draw';

// ── 事件（表现层唯一的信息来源）─────────────────────────────

export type CombatEventPayload =
    | { readonly type: 'combat.started'; readonly allyIds: readonly number[]; readonly enemyIds: readonly number[] }
    | { readonly type: 'unit.acted'; readonly actorId: number; readonly skillId: string; readonly targetIds: readonly number[] }
    | { readonly type: 'damage.dealt'; readonly actorId: number; readonly targetId: number; readonly amount: number; readonly damageKind: DamageKind; readonly absorbedByShield: number }
    | { readonly type: 'heal.applied'; readonly actorId: number; readonly targetId: number; readonly amount: number }
    | { readonly type: 'status.applied'; readonly targetId: number; readonly kind: StatusKind; readonly durationTicks: number; readonly magnitude: number }
    | { readonly type: 'status.expired'; readonly targetId: number; readonly kind: StatusKind }
    | { readonly type: 'status.ticked'; readonly targetId: number; readonly kind: StatusKind; readonly amount: number }
    | { readonly type: 'unit.died'; readonly unitId: number }
    | { readonly type: 'taunt.redirected'; readonly actorId: number; readonly intendedTargetId: number; readonly actualTargetId: number }
    | { readonly type: 'skill.blocked'; readonly actorId: number; readonly skillId: string; readonly reason: SkillBlockReason }
    | { readonly type: 'combat.ended'; readonly outcome: CombatOutcome; readonly tick: number };

export type SkillBlockReason =
    /** 冷却未结束。 */
    | 'on_cooldown'
    /** 被沉默，无法施法。 */
    | 'silenced'
    /** 无合法目标。 */
    | 'no_valid_target';

/** 找单位。返回 undefined 而非抛错——死亡单位可能已被移出。 */
export function findUnit(
    snapshot: CombatSnapshot,
    unitId: number,
): CombatUnit | undefined {
    return snapshot.units.find((unit) => unit.unitId === unitId);
}

export function aliveUnitsOf(
    snapshot: CombatSnapshot,
    side: CombatSide,
): readonly CombatUnit[] {
    return snapshot.units.filter((unit) => unit.side === side && !unit.isDead);
}

/** 护盾总吸收量。多个护盾叠加。 */
export function shieldAmountOf(unit: CombatUnit): number {
    return unit.statuses
        .filter((status) => status.kind === 'shield')
        .reduce((sum, status) => sum + status.magnitude, 0);
}

export function hasStatus(unit: CombatUnit, kind: StatusKind): boolean {
    return unit.statuses.some((status) => status.kind === kind);
}

/** 是否被控制而无法行动（PRD-04 §8）。 */
export function isIncapacitated(unit: CombatUnit): boolean {
    return unit.statuses.some(
        (status) => status.kind === 'stun' || status.kind === 'entangle',
    );
}

/** 判定胜负（PRD-04 §5 的胜负条件）。 */
export function evaluateOutcome(snapshot: CombatSnapshot): CombatOutcome | null {
    const alliesAlive = aliveUnitsOf(snapshot, 'ally').length;
    const enemiesAlive = aliveUnitsOf(snapshot, 'enemy').length;

    if (alliesAlive === 0 && enemiesAlive === 0) {
        // 同时全灭：算平局，避免"最后一击互换"时结果依赖判定顺序
        return 'draw';
    }
    if (alliesAlive === 0) {
        return 'enemy_win';
    }
    if (enemiesAlive === 0) {
        return 'ally_win';
    }
    return null;
}
