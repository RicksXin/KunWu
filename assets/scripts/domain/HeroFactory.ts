/**
 * 修士实例化与战斗单位转换（PRD-03 §2、§8、任务 P1-HERO-001）。
 *
 * 纯逻辑、无引擎依赖。职责边界：把「数据表 + 灵根 + 等级」变成
 * 可用于战斗的 CombatUnit，不做数据表加载（那在 DataRegistry）。
 *
 * 属性来源必须可拆解（PRD-03 §8），故先算 AttributeBreakdown 再取 final，
 * 不直接算一个总数——UI 要能回答「这 47 点力道从哪来」。
 */

import { createAttributes } from './Attributes';
import type { AttributeKey, Attributes } from './Attributes';
import {
    computeGrowth,
    scaleBaseBySpiritualRoot,
    summarize,
    MAX_LEVEL,
    realmIdOf,
} from './HeroGrowth';
import type { AttributeBreakdown, GrowthRates, SpiritualRootId, RealmId } from './HeroGrowth';
import { maxHp } from './CombatFormulas';
import type { CombatUnit, CombatSide, SkillRuntime } from './CombatState';
import type { SkillTargetType } from './SkillTargeting';
import type { DamageKind } from './CombatTypes';

/** 职业定义，对应 assets/data/careers/*.json 的条目。 */
export interface CareerData {
    readonly id: string;
    readonly nameKey: string;
    readonly tier: number;
    readonly primaryAttribute: AttributeKey;
    /** 恰好三个技能 ID（PRD-04 §4）。 */
    readonly skillIds: readonly string[];
    readonly baseAttributes: Readonly<Record<AttributeKey, number>>;
    readonly baseHp: number;
}

/**
 * 实例化所需的平衡数值，来自 `assets/data/balance/`。
 *
 * 全部可选：省略时退回各模块的默认常数，与接入数据表前的行为一致。
 * 之所以整体作为一个参数而非拆成多个：这三项必须同批变更——
 * 只换成长率不换灵根倍率会得到一份没人验算过的曲线。
 */
export interface HeroBalanceContext {
    /** 职业 id → 七维成长率（千分位）。 */
    readonly growthRates?: Readonly<Record<string, GrowthRates>>;
    /** 灵根 → 初始与成长倍率（百分比）。 */
    readonly spiritualRootMultipliers?: Readonly<
        Record<SpiritualRootId, { readonly basePercent: number; readonly growthPercent: number }>
    >;
    /** 生命上限中肉身的系数。 */
    readonly constitutionHpFactor?: number;
}

/** 技能定义，对应 assets/data/skills.json 的条目。 */
export interface SkillData {
    readonly id: string;
    readonly nameKey: string;
    readonly damageKind: DamageKind;
    readonly scalingAttribute?: AttributeKey;
    readonly targetType: SkillTargetType;
    readonly ignoreTaunt: boolean;
    readonly baseIntervalTicks: number;
    readonly cooldownTicks: number;
    readonly castTicks: number;
    readonly primaryPercent: number;
    readonly secondaryAttribute?: AttributeKey;
    readonly secondaryPercent?: number;
    readonly appliesStatus?: {
        readonly kind: string;
        readonly durationTicks: number;
        readonly magnitude: number;
    };
}

/** 修士实例，对应 starting_heroes.json 与存档中的修士。 */
export interface HeroData {
    readonly instanceId: string;
    readonly nameKey: string;
    readonly careerId: string;
    readonly spiritualRootId: SpiritualRootId;
    readonly realmId: RealmId;
    readonly level: number;
    /** 装备加成汇总。缺省为全 0。 */
    readonly equipmentBonus?: Attributes;
}

export interface HeroInstance {
    readonly data: HeroData;
    readonly career: CareerData;
    readonly attributes: AttributeBreakdown;
    readonly maxHp: number;
    readonly skillIds: readonly string[];
}

/**
 * 实例化修士。
 *
 * 抛错而非返回 null：职业 ID 找不到说明数据表与存档不一致，
 * 静默跳过会让玩家发现某个角色凭空消失，比直接报错更难查。
 */
export function instantiateHero(
    data: HeroData,
    careers: ReadonlyMap<string, CareerData>,
    balance: HeroBalanceContext = {},
): HeroInstance {
    const career = careers.get(data.careerId);
    if (!career) {
        throw new Error(
            `修士 ${data.instanceId} 的职业 ${data.careerId} 不存在于数据表`,
        );
    }

    if (data.level < 1 || data.level > MAX_LEVEL) {
        throw new Error(
            `修士 ${data.instanceId} 的等级 ${data.level} 超出 1–${MAX_LEVEL}`,
        );
    }

    const expectedRealmId = realmIdOf(data.level);
    if (data.realmId !== expectedRealmId) {
        throw new Error(
            `修士 ${data.instanceId} 的境界 ${data.realmId} 与等级 ${data.level} 不一致，` +
            `应为 ${expectedRealmId}`,
        );
    }

    const multiplier = balance.spiritualRootMultipliers?.[data.spiritualRootId];
    const rates = balance.growthRates?.[career.id];

    // 缺成长率时抛错而非按 0 处理：零成长会让七维终身冻结，
    // 症状是「等级涨了面板不动」，比启动时报错难查得多。
    // 但完全没传 balance 时走默认常数，保持未接表调用方可用。
    if (balance.growthRates && !rates) {
        throw new Error(
            `职业 ${career.id} 在 growth_rates 表中缺少成长率配置`,
        );
    }

    const base = scaleBaseBySpiritualRoot(
        createAttributes(career.baseAttributes),
        data.spiritualRootId,
        multiplier?.basePercent,
    );
    const growth = rates
        ? computeGrowth(
            data.level,
            data.spiritualRootId,
            rates,
            multiplier?.growthPercent,
        )
        : createAttributes();
    const attributes = summarize({
        base,
        growth,
        equipment: data.equipmentBonus,
    });

    return {
        data,
        career,
        attributes,
        maxHp: maxHp(
            career.baseHp,
            attributes.final.constitution,
            0,
            balance.constitutionHpFactor,
        ),
        skillIds: career.skillIds,
    };
}

/**
 * 转成战斗单位。
 *
 * unitId 由调用方分配：战斗内用小整数便于事件序列化，
 * 而 instanceId 是存档用的稳定字符串，两者职责不同不能混用。
 */
export function toCombatUnit(
    hero: HeroInstance,
    unitId: number,
    side: CombatSide = 'ally',
    currentHp?: number,
): CombatUnit {
    return {
        unitId,
        side,
        nameKey: hero.data.nameKey,
        attributes: hero.attributes.final,
        currentHp: currentHp ?? hero.maxHp,
        maxHp: hero.maxHp,
        skillIds: hero.skillIds,
        // 首次行动稍有错开，避免全队同 tick 出手
        actionTimer: 1 + (unitId % 4),
        cooldowns: {},
        statuses: [],
        isDead: false,
        tauntStrength: 0,
    };
}

/** 把数据表技能转成结算器用的运行时技能。 */
export function toSkillRuntime(skill: SkillData): SkillRuntime {
    if (skill.damageKind !== 'none' && !skill.scalingAttribute) {
        // 技术方案 §10.1：不得按职业名推断伤害来源
        throw new Error(`技能 ${skill.id} 造成伤害却未声明 scalingAttribute`);
    }

    return {
        skillId: skill.id,
        damageKind: skill.damageKind,
        targetType: skill.targetType,
        ignoreTaunt: skill.ignoreTaunt,
        baseIntervalTicks: skill.baseIntervalTicks,
        cooldownTicks: skill.cooldownTicks,
        // 无伤害技能用主属性占位，倍率为 0 时不参与计算
        primaryAttribute: skill.scalingAttribute ?? 'strength',
        primaryPercent: skill.primaryPercent,
        secondaryAttribute: skill.secondaryAttribute,
        secondaryPercent: skill.secondaryPercent,
        appliesStatus: skill.appliesStatus as SkillRuntime['appliesStatus'],
    };
}

/** 批量构建技能表，供结算器使用。 */
export function buildSkillTable(
    skills: readonly SkillData[],
): ReadonlyMap<string, SkillRuntime> {
    return new Map(skills.map((skill) => [skill.id, toSkillRuntime(skill)]));
}
