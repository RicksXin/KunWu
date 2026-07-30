/**
 * 职业树与技能定义（PRD-03 §5、§6、技术方案 §1）。
 *
 * 硬约束：每个职业节点恰好 3 个主动技能（CLAUDE.md、PRD-10 §6）。
 * 该约束由 Schema 校验保证，不靠代码里的 if 判断。
 */

import type { AttributeKey } from './Attributes';
import type { DamageKind } from './CombatTypes';

/** 每个职业节点的主动技能数量。已冻结，改动等于重做战斗数值。 */
export const SKILLS_PER_CAREER = 3;

/** 职业阶段：初始职业与一转（PRD-03 §6）。 */
export type CareerTier = 'base' | 'tier_1';

/** 一转所需等级（PRD-03 §6）。 */
export const TIER_1_REQUIRED_LEVEL = 10;

export interface SkillDefinition {
    readonly id: string;
    /** 本地化 Key，不是显示名——授权名与原创名通过本地化表切换（策划案 §2）。 */
    readonly nameKey: string;
    readonly damageKind: DamageKind;
    /**
     * 伤害/治疗依赖的属性，必须显式声明（技术方案 §10.1）。
     * damageKind 为 none 时可省略。
     */
    readonly scalingAttribute?: AttributeKey;
    readonly isSingleTarget: boolean;
    readonly ignoreTaunt: boolean;
    /** 冷却与前摇均以模拟 tick 计，避免帧率影响结算。 */
    readonly cooldownTicks: number;
    readonly castTicks: number;
}

export interface CareerDefinition {
    readonly id: string;
    readonly nameKey: string;
    readonly tier: CareerTier;
    /** 主属性，用于成长权重与 UI 展示。 */
    readonly primaryAttribute: AttributeKey;
    /** 恰好 SKILLS_PER_CAREER 个技能 ID。 */
    readonly skillIds: readonly string[];
    /** 一转节点的前置初始职业；base 节点为 null。 */
    readonly parentCareerId: string | null;
}
