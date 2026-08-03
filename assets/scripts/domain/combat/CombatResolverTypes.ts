import type { CombatEventPayload, CombatSnapshot, CombatUnit, SkillRuntime } from '../CombatState';

export type RandomSource = () => number;

export interface StepResult {
    readonly snapshot: CombatSnapshot;
    readonly events: readonly CombatEventPayload[];
}

export interface ResolverConfig {
    readonly skills: ReadonlyMap<string, SkillRuntime>;
    readonly random: RandomSource;
    readonly maxTicks?: number;
    readonly defenseLevelConstant?: number;
    /** 返回 true 时该就绪单位停在行动条满值，等待应用层提交玩家指令。 */
    readonly deferActor?: (actor: CombatUnit) => boolean;
}
