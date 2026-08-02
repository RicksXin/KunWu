import { actionIntervalTicks } from '../CombatFormulas';
import type { CombatEventPayload, CombatUnit } from '../CombatState';
import { applySkillTo } from './CombatEffects';
import type { ResolverConfig } from './CombatResolverTypes';
import { chooseSkill } from './CombatTargeting';

export function performAction(
    units: readonly CombatUnit[],
    actorId: number,
    config: ResolverConfig,
    events: CombatEventPayload[],
): readonly CombatUnit[] {
    const actor = units.find((unit) => unit.unitId === actorId)!;
    const choice = chooseSkill(units, actor, config);
    if (!choice) {
        return units.map((unit) => unit.unitId === actorId ? { ...unit, actionTimer: 20 } : unit);
    }
    const { skill, targetIds } = choice;
    events.push({ type: 'unit.acted', actorId, skillId: skill.skillId, targetIds });
    let next = units;
    for (const targetId of targetIds) {
        next = applySkillTo(next, actor, skill, targetId, config, events);
    }
    return next.map((unit) => {
        if (unit.unitId !== actorId) return unit;
        const interval = actionIntervalTicks(skill.baseIntervalTicks, unit.attributes.speed);
        const cooldowns = { ...unit.cooldowns };
        if (skill.cooldownTicks > 0) cooldowns[skill.skillId] = skill.cooldownTicks;
        return { ...unit, actionTimer: interval, cooldowns };
    });
}
