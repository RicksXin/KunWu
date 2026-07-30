/**
 * 修士品级、境界与属性成长（PRD-03 §3、§8、§9、任务 P1-HERO-001）。
 *
 * 纯逻辑、无引擎依赖。三条来自 PRD 的硬约束：
 *
 *   1. **属性详情必须区分基础、成长、装备、状态和最终值**（PRD-03 §8）。
 *      故不能只存一个数——UI 要能告诉玩家"这 120 点力道从哪来"。
 *
 *   2. **品级影响初始七维、成长幅度和潜能，不改变技能数量**（PRD-03 §3）。
 *      D 级角色必须能通过合理培养完成主线，故成长倍率差距不能过大。
 *
 *   3. **境界突破固定成功，不加入失败概率**（PRD-03 §9）。
 *      故这里只做等级区间映射，没有概率判定。
 */

import { ATTRIBUTE_KEYS, createAttributes, addAttributes } from './Attributes';
import type { AttributeKey, Attributes, MutableAttributes } from './Attributes';

/** 品级（PRD-03 §3）。顺序即强度递增。 */
export const HERO_GRADES = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'] as const;
export type HeroGrade = (typeof HERO_GRADES)[number];

/**
 * 品级成长倍率，百分比整数。
 *
 * D 级取 100 作基准。差距刻意收窄：PRD-03 §3 要求
 * 「D 级角色必须能通过合理培养与队伍搭配完成主线」，
 * 若 SSS 是 D 的数倍，低品级角色会在数值上被彻底淘汰。
 */
export const GRADE_GROWTH_PERCENT: Readonly<Record<HeroGrade, number>> = {
    D: 100,
    C: 110,
    B: 122,
    A: 136,
    S: 152,
    SS: 170,
    SSS: 190,
};

/** 境界（PRD-03 §9）。 */
export const REALMS = ['zhu_ji', 'jie_dan', 'yuan_ying'] as const;
export type Realm = (typeof REALMS)[number];

/** 各境界的等级区间（PRD-03 §9）。 */
export const REALM_LEVEL_RANGES: Readonly<Record<Realm, { min: number; max: number }>> = {
    zhu_ji: { min: 1, max: 20 },
    jie_dan: { min: 21, max: 40 },
    yuan_ying: { min: 41, max: 60 },
};

/** MVP 等级上限。 */
export const MAX_LEVEL = 60;
/** 一转开放等级（PRD-03 §6）。 */
export const TIER_1_LEVEL = 10;

/**
 * 按等级取境界。
 * 越界抛错而非返回默认值——等级超范围说明升级逻辑有 bug，
 * 静默钳制会让问题在数值上表现为"卡在 60 级"而难以定位。
 */
export function realmOf(level: number): Realm {
    if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
        throw new Error(`等级须为 1–${MAX_LEVEL} 的整数，收到 ${level}`);
    }
    for (const realm of REALMS) {
        const range = REALM_LEVEL_RANGES[realm];
        if (level >= range.min && level <= range.max) {
            return realm;
        }
    }
    // REALM_LEVEL_RANGES 覆盖 1–60，理论上不可达
    throw new Error(`等级 ${level} 未落入任何境界区间`);
}

export function canPromoteToTier1(level: number): boolean {
    return level >= TIER_1_LEVEL;
}

/**
 * 属性来源拆解（PRD-03 §8）。
 * 每一项都要能单独展示，故不合并存储。
 */
export interface AttributeBreakdown {
    /** 职业与品级决定的初始值。 */
    readonly base: Attributes;
    /** 等级成长累计。 */
    readonly growth: Attributes;
    /** 装备加成。 */
    readonly equipment: Attributes;
    /** 状态效果加成，可为负（破甲、降抗）。 */
    readonly state: Attributes;
    /** 最终值，已 clamp 到非负。 */
    readonly final: Attributes;
}

/** 每级的基础成长，由数据表提供；此处给出 Demo 基线。 */
export interface GrowthProfile {
    /** 主属性每级成长。 */
    readonly primaryPerLevel: number;
    /** 副属性每级成长。 */
    readonly secondaryPerLevel: number;
    /** 主属性键，来自职业定义。 */
    readonly primaryAttribute: AttributeKey;
    /** 次要属性键，可选。 */
    readonly secondaryAttribute?: AttributeKey;
}

/**
 * 计算等级成长（PRD-03 §3：品级影响成长幅度）。
 *
 * 成长从 1 级起算，故 1 级时成长为 0——初始值全部来自 base，
 * 这样"1 级角色的面板"与数据表里的初始值一致，便于策划核对。
 */
export function computeGrowth(
    level: number,
    grade: HeroGrade,
    profile: GrowthProfile,
): Attributes {
    if (!Number.isInteger(level) || level < 1) {
        throw new Error(`等级须为正整数，收到 ${level}`);
    }
    const levelsGained = level - 1;
    const percent = GRADE_GROWTH_PERCENT[grade];

    const result = createAttributes() as MutableAttributes;
    // 先乘后除保持整数域（技术方案 §7）
    result[profile.primaryAttribute] = Math.floor(
        (levelsGained * profile.primaryPerLevel * percent) / 100,
    );
    if (profile.secondaryAttribute) {
        const secondary = Math.floor(
            (levelsGained * profile.secondaryPerLevel * percent) / 100,
        );
        // 主副属性可能相同，此时应累加而非覆盖
        result[profile.secondaryAttribute] += secondary;
    }
    return result;
}

/**
 * 汇总属性。
 *
 * 最终值 clamp 到 0：破甲等减益可能把护体压到负数，
 * 负防御在 CombatFormulas.damageReduction 里会被当作 0，
 * 但面板显示负数会让玩家困惑，故在此统一。
 */
export function summarize(parts: {
    readonly base: Attributes;
    readonly growth: Attributes;
    readonly equipment?: Attributes;
    readonly state?: Attributes;
}): AttributeBreakdown {
    const equipment = parts.equipment ?? createAttributes();
    const state = parts.state ?? createAttributes();

    const summed = addAttributes(
        addAttributes(parts.base, parts.growth),
        addAttributes(equipment, state),
    );

    const final = createAttributes() as MutableAttributes;
    for (const key of ATTRIBUTE_KEYS) {
        final[key] = Math.max(0, summed[key]);
    }

    return { base: parts.base, growth: parts.growth, equipment, state, final };
}

/** 解雇返还比例，百分比整数（PRD-03 §10：比例由数值表配置）。 */
export const DISMISS_REFUND_PERCENT = 50;

/** 需二次确认才能解雇的品级（PRD-03 §10：A 级及以上）。 */
export function requiresDismissConfirm(grade: HeroGrade): boolean {
    return HERO_GRADES.indexOf(grade) >= HERO_GRADES.indexOf('A');
}

/** 默认锁定、不可解雇的品级（PRD-03 §10：S 级及以上）。 */
export function isDismissLocked(grade: HeroGrade): boolean {
    return HERO_GRADES.indexOf(grade) >= HERO_GRADES.indexOf('S');
}
