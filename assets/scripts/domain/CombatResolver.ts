/**
 * 战斗结算器公共入口。保持 CombatCommand → 结算器 → CombatEvent 单向数据流。
 */

import { evaluateOutcome, isIncapacitated } from './CombatState';
import type { CombatEventPayload, CombatSnapshot } from './CombatState';
import { performAction } from './combat/CombatActions';
import { tickStatuses } from './combat/CombatEffects';
import type { ResolverConfig, StepResult } from './combat/CombatResolverTypes';

export type { RandomSource, ResolverConfig, StepResult } from './combat/CombatResolverTypes';

/** 默认上限：20Hz × 180 秒 = 3600 tick。 */
export const DEFAULT_MAX_TICKS = 3600;

export function step(snapshot: CombatSnapshot, config: ResolverConfig): StepResult {
    if (snapshot.outcome !== null) return { snapshot, events: [] };
    const events: CombatEventPayload[] = [];
    let units = tickStatuses(snapshot.units, events);
    units = units.map((unit) => {
        if (unit.isDead) return unit;
        const cooldowns: Record<string, number> = {};
        for (const [skillId, remaining] of Object.entries(unit.cooldowns)) {
            if (remaining > 1) cooldowns[skillId] = remaining - 1;
        }
        const timer = isIncapacitated(unit) ? unit.actionTimer : Math.max(0, unit.actionTimer - 1);
        return { ...unit, cooldowns, actionTimer: timer };
    });
    const actors = units
        .filter((unit) => !unit.isDead && unit.actionTimer === 0 && !isIncapacitated(unit))
        .map((unit) => unit.unitId)
        .sort((left, right) => left - right);
    for (const actorId of actors) {
        const current = units.find((unit) => unit.unitId === actorId);
        if (current && !current.isDead) units = performAction(units, actorId, config, events);
    }
    const tick = snapshot.tick + 1;
    const nextSnapshot: CombatSnapshot = { tick, units, outcome: null };
    let outcome = evaluateOutcome(nextSnapshot);
    if (outcome === null && tick >= (config.maxTicks ?? DEFAULT_MAX_TICKS)) outcome = 'draw';
    if (outcome !== null) events.push({ type: 'combat.ended', outcome, tick });
    return { snapshot: { tick, units, outcome }, events };
}

export function runToCompletion(
    initial: CombatSnapshot,
    config: ResolverConfig,
): { readonly snapshot: CombatSnapshot; readonly events: readonly CombatEventPayload[] } {
    let snapshot = initial;
    const events: CombatEventPayload[] = [];
    const maxTicks = config.maxTicks ?? DEFAULT_MAX_TICKS;
    while (snapshot.outcome === null && snapshot.tick < maxTicks) {
        const result = step(snapshot, config);
        snapshot = result.snapshot;
        events.push(...result.events);
    }
    return { snapshot, events };
}
