/**
 * 战斗核心契约（技术方案 §10）。
 *
 * 数据流严格单向：
 *   行动意图 → CombatCommand → 结算器 → CombatEvent → 表现层
 *
 * 表现层只消费 CombatEvent，不得反向决定伤害结果。
 * 这条约束是加速战斗、跳过动画、战斗回放和自动化测试的共同前提，
 * 一旦被打破，上述四项能力会同时失效。
 */

/** 模拟频率 20 Hz，与渲染 60 FPS 解耦（技术方案 §10）。 */
export const SIMULATION_TICK_HZ = 20;
export const SIMULATION_TICK_SECONDS = 1 / SIMULATION_TICK_HZ;

export interface CombatCommand {
    readonly actorId: number;
    readonly skillId: string;
    readonly targetIds: readonly number[];
}

export interface CombatEvent {
    readonly type: string;
    readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * 技能依赖的属性必须显式声明（技术方案 §10.1）。
 * 不允许根据职业名称在代码中推断伤害来源。
 */
export type DamageKind = 'physical' | 'magical' | 'none';

// 目标规则与嘲讽判定见 SkillTargeting.ts：
// 目标类型是 SkillDefinition 的字段，是否受嘲讽由类型推导，不另设接口。

/** 敌人轻量状态机（技术方案 §11）。Boss 另用阶段脚本，不做通用行为树。 */
export type EnemyAiState =
    | 'Idle'
    | 'ChooseAction'
    | 'Cast'
    | 'Recover'
    | 'Disabled'
    | 'Dead';

/**
 * 战斗规模上限（技术方案 §10）：
 * 最多 4 名友方 + 6 名普通敌人，或 1 名大型 Boss + 2 个召唤物。
 */
export const MAX_PARTY_SIZE = 4;
export const MAX_NORMAL_ENEMIES = 6;
export const MAX_BOSS_SUMMONS = 2;
