/**
 * 修士灵根资质、境界与属性成长（PRD-03 §3、§8、§9、任务 P1-HERO-001）。
 *
 * 纯逻辑、无引擎依赖。三条来自 PRD 的硬约束：
 *
 *   1. **属性详情必须区分基础、成长、装备、状态和最终值**（PRD-03 §8）。
 *      故不能只存一个数——UI 要能告诉玩家"这 120 点力道从哪来"。
 *
 *   2. **灵根影响初始七维、成长幅度和潜能，不改变技能数量**（PRD-03 §3）。
 *      杂灵根修士必须能通过合理培养完成主线，故成长倍率差距不能过大。
 *
 *   3. **境界突破固定成功，不加入失败概率**（PRD-03 §9）。
 *      故这里只做等级区间映射，没有概率判定。
 */

import { ATTRIBUTE_KEYS, createAttributes, addAttributes } from './Attributes';
import type { AttributeKey, Attributes, MutableAttributes } from './Attributes';

/** 六档灵根资质（PRD-03 §3）。顺序即强度递增。 */
export const SPIRITUAL_ROOT_IDS = [
    'mixed_root',
    'pseudo_root',
    'triple_root',
    'dual_root',
    'heavenly_root',
    'variant_root',
] as const;
export type SpiritualRootId = (typeof SPIRITUAL_ROOT_IDS)[number];

/**
 * 灵根成长倍率，百分比整数。
 *
 * 杂灵根取 100 作基准。差距刻意收窄，避免低资质修士被数值淘汰。
 *
 * 正式取值来自 `assets/data/balance/spiritual_root_multipliers.json` 的 `growthPercent`，
 * 通过 `computeGrowth` 的 `rootMultiplier` 参数注入。此处仅作默认值与兜底，
 * **不要在新代码里直接引用**（技术方案 §1：数值不在业务代码中硬编码）。
 */
export const SPIRITUAL_ROOT_GROWTH_PERCENT: Readonly<Record<SpiritualRootId, number>> = {
    mixed_root: 100,
    pseudo_root: 110,
    triple_root: 122,
    dual_root: 136,
    heavenly_root: 152,
    variant_root: 190,
};

/**
 * 灵根初始倍率，百分比整数。
 *
 * PRD-03 §3 要求灵根影响**初始七维**，而非只影响成长。
 *
 * 曲线比成长倍率更平：初始值只需让玩家在招募时看出差别，
 * 不该在 1 级就制造代差。正式取值同样来自 `spiritual_root_multipliers.json`。
 *
 * 步长约 8 个百分点是**为了跨过整数取整**：初始七维在 13–16 的个位数量级，
 * 105% 作用在 14 上得 14.7，floor 后仍是 14——杂灵根与下一档的 1 级面板会完全相同。
 * 想调这条曲线时先验算 floor 后相邻灵根是否仍有差异。
 */
export const SPIRITUAL_ROOT_BASE_PERCENT: Readonly<Record<SpiritualRootId, number>> = {
    mixed_root: 100,
    pseudo_root: 108,
    triple_root: 116,
    dual_root: 124,
    heavenly_root: 133,
    variant_root: 152,
};

/** 成长率的千分位基数：3000 表示每级 +3.0 点。 */
export const GROWTH_RATE_SCALE = 1000;

/** Schema v5 冻结的八个稳定境界 ID；合体、大乘当前锁定。 */
export const REALM_IDS = [
    'lian_qi',
    'zhu_ji',
    'jie_dan',
    'yuan_ying',
    'hua_shen',
    'lian_xu',
    'he_ti',
    'da_cheng',
] as const;
export type RealmId = (typeof REALM_IDS)[number];

/** 各境界的等级区间（PRD-03 §9）。 */
export const REALM_LEVEL_RANGES: Readonly<Record<RealmId, { min: number; max: number }>> = {
    lian_qi: { min: 1, max: 10 },
    zhu_ji: { min: 11, max: 20 },
    jie_dan: { min: 21, max: 30 },
    yuan_ying: { min: 31, max: 40 },
    hua_shen: { min: 41, max: 50 },
    lian_xu: { min: 51, max: 60 },
    he_ti: { min: 61, max: 70 },
    da_cheng: { min: 71, max: 80 },
};

/** 旧兼容成长实现的等级上限；1.0可玩范围由PRD-03限制为Lv1–30。 */
export const MAX_LEVEL = 60;
/** 筑基分支开放等级（PRD-03 §6）。 */
export const TIER_1_LEVEL = 10;

/**
 * 按等级取境界。
 * 越界抛错而非返回默认值——等级超范围说明升级逻辑有 bug，
 * 静默钳制会让问题在数值上表现为"卡在 60 级"而难以定位。
 */
export function realmIdOf(level: number): RealmId {
    const schemaMaxLevel = REALM_LEVEL_RANGES.da_cheng.max;
    if (!Number.isInteger(level) || level < 1 || level > schemaMaxLevel) {
        throw new Error(`等级须为 1–${schemaMaxLevel} 的整数，收到 ${level}`);
    }
    for (const realm of REALM_IDS) {
        const range = REALM_LEVEL_RANGES[realm];
        if (level >= range.min && level <= range.max) {
            return realm;
        }
    }
    // REALM_LEVEL_RANGES 覆盖 1–80，理论上不可达
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
    /** 职业与灵根决定的初始值。 */
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

/**
 * 七维每级成长率，千分位整数（`3000` = 每级 +3.0 点）。
 *
 * 七维**全部**需要成长率，且都应为正。此前的结构只声明主维与副维两个数，
 * 其余五维从 1 级到满级一点不涨；冻结的后果是减伤公式与生命上限对该职业失效——
 * 非坦职业护体锁死在个位数，减伤率恒为 4%–6%，等同于减伤机制不存在。
 * 详见 Docs/13_数值设计方案.md §1.2 问题 1。
 *
 * 用千分位而非浮点：整数域运算保证跨平台一致（技术方案 §7）。
 */
export type GrowthRates = Readonly<Record<AttributeKey, number>>;

/**
 * 计算等级成长（PRD-03 §3：灵根影响成长幅度）。
 *
 * 成长从 1 级起算，故 1 级时成长为 0——初始值全部来自 base，
 * 这样"1 级角色的面板"与数据表里的初始值一致，便于策划核对。
 *
 * @param rates 七维成长率，千分位。来自 `balance/growth_rates.json`
 * @param rootMultiplier 灵根成长倍率，百分比。
 */
export function computeGrowth(
    level: number,
    spiritualRootId: SpiritualRootId,
    rates: GrowthRates,
    rootMultiplier?: number,
): Attributes {
    if (!Number.isInteger(level) || level < 1) {
        throw new Error(`等级须为正整数，收到 ${level}`);
    }
    const levelsGained = level - 1;
    const percent = rootMultiplier ?? SPIRITUAL_ROOT_GROWTH_PERCENT[spiritualRootId];

    const result = createAttributes() as MutableAttributes;
    for (const key of ATTRIBUTE_KEYS) {
        const rate = rates[key] ?? 0;
        if (rate < 0) {
            throw new Error(`${key} 的成长率不能为负，收到 ${rate}`);
        }
        // 先乘后除保持整数域（技术方案 §7）：
        // 除数是 GROWTH_RATE_SCALE × 100，因为 rate 是千分位而 percent 是百分比
        result[key] = Math.floor(
            (levelsGained * rate * percent) / (GROWTH_RATE_SCALE * 100),
        );
    }
    return result;
}

/**
 * 按灵根缩放初始七维（PRD-03 §3：灵根影响初始七维）。
 *
 * @param baseAttributes 职业表里的裸初始值
 * @param rootMultiplier 灵根初始倍率，百分比。
 */
export function scaleBaseBySpiritualRoot(
    baseAttributes: Attributes,
    spiritualRootId: SpiritualRootId,
    rootMultiplier?: number,
): Attributes {
    const percent = rootMultiplier ?? SPIRITUAL_ROOT_BASE_PERCENT[spiritualRootId];
    if (percent <= 0) {
        throw new Error(`灵根初始倍率必须为正，收到 ${percent}`);
    }
    const result = createAttributes() as MutableAttributes;
    for (const key of ATTRIBUTE_KEYS) {
        result[key] = Math.floor((baseAttributes[key] * percent) / 100);
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

/** 双灵根及以上解雇需要二次确认。 */
export function requiresDismissConfirm(spiritualRootId: SpiritualRootId): boolean {
    return SPIRITUAL_ROOT_IDS.indexOf(spiritualRootId)
        >= SPIRITUAL_ROOT_IDS.indexOf('dual_root');
}

/** 天灵根和异灵根默认锁定。 */
export function isDismissLocked(spiritualRootId: SpiritualRootId): boolean {
    return SPIRITUAL_ROOT_IDS.indexOf(spiritualRootId)
        >= SPIRITUAL_ROOT_IDS.indexOf('heavenly_root');
}
