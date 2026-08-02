import type { CombatEventPayload, CombatSnapshot, SkillRuntime } from '../CombatState';

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
}
