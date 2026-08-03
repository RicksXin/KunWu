import { actionIntervalTicks } from '../CombatFormulas';
import type { CombatEventPayload, CombatUnit } from '../CombatState';
import type { CombatCommand } from '../CombatTypes';
import { applySkillTo } from './CombatEffects';
import type { ResolverConfig } from './CombatResolverTypes';
import { chooseSkill, chooseSkillById } from './CombatTargeting';

export interface ChosenActionResult {
    readonly units: readonly CombatUnit[];
    readonly accepted: boolean;
}

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
    return performCommand(units, {
        actorId,
        skillId: choice.skill.skillId,
        targetIds: choice.targetIds,
    }, config, events);
}

export function performChosenAction(
    units: readonly CombatUnit[],
    actorId: number,
    skillId: string,
    config: ResolverConfig,
    events: CombatEventPayload[],
): ChosenActionResult {
    const actor = units.find((unit) => unit.unitId === actorId);
    if (!actor || actor.isDead || actor.actionTimer !== 0) return { units, accepted: false };
    const choice = chooseSkillById(units, actor, skillId, config);
    if (!choice) return { units, accepted: false };
    return {
        units: performCommand(units, {
            actorId,
            skillId: choice.skill.skillId,
            targetIds: choice.targetIds,
        }, config, events),
        accepted: true,
    };
}

function performCommand(
    units: readonly CombatUnit[],
    command: CombatCommand,
    config: ResolverConfig,
    events: CombatEventPayload[],
): readonly CombatUnit[] {
    const actor = units.find((unit) => unit.unitId === command.actorId)!;
    const skill = config.skills.get(command.skillId)!;
    events.push({
        type: 'unit.acted',
        actorId: command.actorId,
        skillId: command.skillId,
        targetIds: command.targetIds,
    });
    let next = units;
    for (const targetId of command.targetIds) {
        next = applySkillTo(next, actor, skill, targetId, config, events);
    }
    return next.map((unit) => {
        if (unit.unitId !== command.actorId) return unit;
        const interval = actionIntervalTicks(skill.baseIntervalTicks, unit.attributes.speed);
        const cooldowns = { ...unit.cooldowns };
        if (skill.cooldownTicks > 0) cooldowns[skill.skillId] = skill.cooldownTicks;
        return { ...unit, actionTimer: interval, cooldowns };
    });
}
