/**
 * 战斗数值公式（PRD-04 §3、§5、技术方案 §10）。
 *
 * 纯函数、无引擎依赖。这些公式是结算器的地基，必须先有测试再谈战斗实现——
 * 公式写错的症状是「数值不对但不崩」，靠玩会漏掉边界。
 *
 * 三条约束：
 *   1. 技能必须显式声明属性来源，不能按职业名推断（PRD-04 §5 末句）。
 *      故所有函数都要求传入 scalingAttribute，不接受「职业」参数。
 *   2. 行动间隔以 tick 计（技术方案 §10），不用秒——帧率不影响结算顺序。
 *   3. 减伤率用整数域比值，不做浮点累乘，避免误差累积。
 */

import type { AttributeKey, Attributes } from './Attributes';
import { SIMULATION_TICK_HZ } from './CombatTypes';

/** 行动间隔下限与上限，单位 tick（PRD-04 §3 的 clamp 边界）。 */
export const MIN_ACTION_INTERVAL_TICKS = 4;
export const MAX_ACTION_INTERVAL_TICKS = 200;

/**
 * 减伤计算的等级常数（PRD-04 §5）。
 * 数值随等级增长，使同样的护体值在高等级下减伤更少。
 * 具体曲线由数据表提供，此处给出 Demo 阶段基线。
 */
export const DEFENSE_LEVEL_CONSTANT_BASE = 100;

/** 生命上限中肉身的系数（PRD-04 §5）。 */
export const CONSTITUTION_HP_FACTOR = 8;

/**
 * 行动间隔（PRD-04 §3）：
 *   行动间隔 = clamp(技能基础间隔 × 100 / (100 + 遁速), 下限, 上限)
 *
 * 用整数除法并向下取整：tick 是离散的，保留小数没有意义，
 * 且不同平台的浮点舍入可能让结算顺序不一致。
 */
export function actionIntervalTicks(baseIntervalTicks: number, speed: number): number {
    if (!Number.isInteger(baseIntervalTicks) || baseIntervalTicks <= 0) {
        throw new Error(`技能基础间隔必须为正整数 tick，收到 ${baseIntervalTicks}`);
    }
    if (speed < 0) {
        throw new Error(`遁速不能为负，收到 ${speed}`);
    }

    const raw = Math.floor((baseIntervalTicks * 100) / (100 + speed));
    return Math.min(MAX_ACTION_INTERVAL_TICKS, Math.max(MIN_ACTION_INTERVAL_TICKS, raw));
}

/** tick 转秒，仅用于 UI 展示。结算一律用 tick。 */
export function ticksToSeconds(ticks: number): number {
    return ticks / SIMULATION_TICK_HZ;
}

/**
 * 生命上限（PRD-04 §5）：
 *   生命上限 = 职业基础生命 + 肉身 × 生命系数 + 装备生命
 */
export function maxHp(
    careerBaseHp: number,
    constitution: number,
    equipmentHp = 0,
    factor: number = CONSTITUTION_HP_FACTOR,
): number {
    const total = careerBaseHp + constitution * factor + equipmentHp;
    // 生命上限至少为 1：0 会让单位在入场瞬间就算死亡
    return Math.max(1, Math.floor(total));
}

export interface SkillScaling {
    /** 主属性来源。必须显式声明（PRD-04 §5）。 */
    readonly primaryAttribute: AttributeKey;
    /** 主属性倍率，百分比整数。100 表示 1.0 倍。 */
    readonly primaryPercent: number;
    /** 副属性来源，通常为神识。可省略。 */
    readonly secondaryAttribute?: AttributeKey;
    readonly secondaryPercent?: number;
}

/**
 * 技能基础伤害（PRD-04 §5）：
 *   物理技能 = 力道 × 力道倍率 + 神识 × 副倍率
 *   法术技能 = 法力 × 法力倍率 + 神识 × 副倍率
 *
 * 两式结构相同，差别只在属性来源，故统一实现——
 * 分成两个函数会诱使调用方按职业选函数，正是 PRD 禁止的推断方式。
 */
export function skillBaseDamage(attributes: Attributes, scaling: SkillScaling): number {
    if (scaling.primaryPercent < 0) {
        throw new Error(`主属性倍率不能为负，收到 ${scaling.primaryPercent}`);
    }

    // 百分比在整数域相乘后再除，避免先除产生舍入误差
    let total = (attributes[scaling.primaryAttribute] * scaling.primaryPercent) / 100;

    if (scaling.secondaryAttribute) {
        const percent = scaling.secondaryPercent ?? 0;
        if (percent < 0) {
            throw new Error(`副属性倍率不能为负，收到 ${percent}`);
        }
        total += (attributes[scaling.secondaryAttribute] * percent) / 100;
    }

    return Math.floor(total);
}

/**
 * 减伤率（PRD-04 §5）：
 *   物理减伤率 = 护体 / (护体 + 等级常数)
 *   法术减伤率 = 定力 / (定力 + 等级常数)
 *
 * 返回 0–1 之间的比值。该式天然不会到达 1，故无需额外封顶——
 * 但防御值为负时会算出负减伤（等于增伤），所以要拦。
 */
export function damageReduction(
    defenseValue: number,
    levelConstant: number = DEFENSE_LEVEL_CONSTANT_BASE,
): number {
    if (levelConstant <= 0) {
        throw new Error(`等级常数必须为正，收到 ${levelConstant}`);
    }
    // 负防御按 0 处理：破甲可能把护体压到负数，但不该变成增伤
    const defense = Math.max(0, defenseValue);
    return defense / (defense + levelConstant);
}

/**
 * 最终伤害。
 * 至少造成 1 点——0 伤害会让高防单位完全无敌，破坏战斗推进。
 */
export function finalDamage(baseDamage: number, reduction: number): number {
    if (reduction < 0 || reduction >= 1) {
        throw new Error(`减伤率须在 [0, 1) 区间，收到 ${reduction}`);
    }
    return Math.max(1, Math.floor(baseDamage * (1 - reduction)));
}

/** 按伤害类型取对应防御属性（技术方案 §10.1：物理走护体，法术走定力）。 */
export function defenseAttributeFor(damageKind: 'physical' | 'magical'): AttributeKey {
    return damageKind === 'physical' ? 'armor' : 'resistance';
}
