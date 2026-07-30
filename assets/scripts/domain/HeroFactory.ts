/**
 * 修士实例化与战斗单位转换（PRD-03 §2、§8、任务 P1-HERO-001）。
 *
 * 纯逻辑、无引擎依赖。职责边界：把「数据表 + 品级 + 等级」变成
 * 可用于战斗的 CombatUnit，不做数据表加载（那在 DataRegistry）。
 *
 * 属性来源必须可拆解（PRD-03 §8），故先算 AttributeBreakdown 再取 final，
 * 不直接算一个总数——UI 要能回答「这 47 点力道从哪来」。
 */

import { createAttributes } from './Attributes';
import type { AttributeKey, Attributes } from './Attributes';
import { computeGrowth, summarize, MAX_LEVEL } from './HeroGrowth';
import type { AttributeBreakdown, GrowthProfile, HeroGrade } from './HeroGrowth';
import { maxHp } from './CombatFormulas';
import type { CombatUnit, CombatSide, SkillRuntime } from './CombatState';
import type { SkillTargetType } from './SkillTargeting';
import type { DamageKind } from './CombatTypes';

/** 职业定义，对应 assets/data/careers.json 的条目。 */
export interface CareerData {
    readonly id: string;
    readonly nameKey: string;
    readonly tier: number;
    readonly primaryAttribute: AttributeKey;
    /** 恰好三个技能 ID（PRD-04 §4）。 */
    readonly skillIds: readonly string[];
    readonly baseAttributes: Readonly<Record<AttributeKey, number>>;
    readonly baseHp: number;
    readonly growth: {
        readonly primaryPerLevel: number;
        readonly secondaryPerLevel: number;
        readonly secondaryAttribute?: AttributeKey;
    };
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

/** 修士实例，对应 starting_heroes.json 与存档中的英雄。 */
export interface HeroData {
    readonly instanceId: string;
    readonly nameKey: string;
    readonly careerId: string;
    readonly grade: HeroGrade;
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

    const profile: GrowthProfile = {
        primaryPerLevel: career.growth.primaryPerLevel,
        secondaryPerLevel: career.growth.secondaryPerLevel,
        primaryAttribute: career.primaryAttribute,
        secondaryAttribute: career.growth.secondaryAttribute,
    };

    const base = createAttributes(career.baseAttributes);
    const growth = computeGrowth(data.level, data.grade, profile);
    const attributes = summarize({
        base,
        growth,
        equipment: data.equipmentBonus,
    });

    return {
        data,
        career,
        attributes,
        maxHp: maxHp(career.baseHp, attributes.final.constitution),
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
