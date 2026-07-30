/**
 * 技能目标类型与嘲讽判定（PRD-04 §4、§6、技术方案 §11.1）。
 *
 * 为何独立成文件：`isSingleTarget: boolean` 表达不了 PRD-04 §4 的九种目标类型，
 * 而「是否受嘲讽约束」必须由目标类型推导，不能各处手填——
 * 手填必然出现「群体技能却标记受嘲讽」这类自相矛盾的配置。
 */

/** 九种目标类型（PRD-04 §4）。 */
export const SKILL_TARGET_TYPES = [
    'SELF',
    'ALLY_SINGLE',
    'ALLY_LOWEST_HP',
    'ALLY_ALL',
    'ENEMY_SINGLE',
    'ENEMY_LOWEST_HP',
    'ENEMY_HIGHEST_STAT',
    'ENEMY_RANDOM_MULTI',
    'ENEMY_ALL',
] as const;
export type SkillTargetType = (typeof SKILL_TARGET_TYPES)[number];

/** 指向敌方的目标类型。 */
const ENEMY_TARGETS: readonly SkillTargetType[] = [
    'ENEMY_SINGLE',
    'ENEMY_LOWEST_HP',
    'ENEMY_HIGHEST_STAT',
    'ENEMY_RANDOM_MULTI',
    'ENEMY_ALL',
];

/** 只作用于单一目标的类型。 */
const SINGLE_TARGETS: readonly SkillTargetType[] = [
    'SELF',
    'ALLY_SINGLE',
    'ALLY_LOWEST_HP',
    'ENEMY_SINGLE',
    'ENEMY_LOWEST_HP',
    'ENEMY_HIGHEST_STAT',
];

export function isEnemyTarget(type: SkillTargetType): boolean {
    return ENEMY_TARGETS.includes(type);
}

export function isSingleTarget(type: SkillTargetType): boolean {
    return SINGLE_TARGETS.includes(type);
}

/**
 * 该目标类型是否可被嘲讽约束（PRD-04 §6、技术方案 §11.1）。
 *
 * 只有「敌方单体」才可能被强制改指向嘲讽者。
 * 群体、随机多段不受影响；友方与自身技能与嘲讽无关。
 *
 * 由类型推导而非配置声明，从根上排除矛盾配置。
 */
export function isTauntable(type: SkillTargetType): boolean {
    return isEnemyTarget(type) && isSingleTarget(type);
}

export interface TauntState {
    /** 嘲讽者的单位 ID。 */
    readonly taunterId: number;
    /** 嘲讽强度。多个嘲讽者时取最高（PRD-04 §6）。 */
    readonly strength: number;
    /** 嘲讽者是否存活。死亡后立即失效（PRD-04 §6）。 */
    readonly isAlive: boolean;
}

/**
 * 解析嘲讽后的实际目标（PRD-04 §6）。
 *
 * @param targetType    技能目标类型
 * @param ignoreTaunt   技能是否显式无视嘲讽
 * @param intendedTargetId AI 原本选定的目标
 * @param taunts        当前生效的嘲讽状态
 * @returns 实际应攻击的单位 ID
 */
export function resolveTauntedTarget(
    targetType: SkillTargetType,
    ignoreTaunt: boolean,
    intendedTargetId: number,
    taunts: readonly TauntState[],
): number {
    if (ignoreTaunt || !isTauntable(targetType)) {
        return intendedTargetId;
    }

    // 嘲讽者死亡后立即恢复正常选目标
    const active = taunts.filter((taunt) => taunt.isAlive);
    if (active.length === 0) {
        return intendedTargetId;
    }

    // 多个嘲讽者先比较强度；同强度取 ID 较小者，保证结算可复现
    let best = active[0]!;
    for (const taunt of active.slice(1)) {
        if (
            taunt.strength > best.strength ||
            (taunt.strength === best.strength && taunt.taunterId < best.taunterId)
        ) {
            best = taunt;
        }
    }
    return best.taunterId;
}
