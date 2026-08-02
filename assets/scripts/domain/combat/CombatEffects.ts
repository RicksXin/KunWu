import { damageReduction, defenseAttributeFor, finalDamage, skillBaseDamage } from '../CombatFormulas';
import { shieldAmountOf } from '../CombatState';
import type { CombatEventPayload, CombatUnit, SkillRuntime, StatusEffect } from '../CombatState';
import { isEnemyTarget } from '../SkillTargeting';
import type { ResolverConfig } from './CombatResolverTypes';

export function tickStatuses(
    units: readonly CombatUnit[],
    events: CombatEventPayload[],
): readonly CombatUnit[] {
    return units.map((unit) => {
        if (unit.isDead || unit.statuses.length === 0) return unit;
        let hp = unit.currentHp;
        const kept: StatusEffect[] = [];
        for (const status of unit.statuses) {
            if (status.kind === 'poison' || status.kind === 'burn') {
                const amount = Math.max(1, status.magnitude);
                hp -= amount;
                events.push({ type: 'status.ticked', targetId: unit.unitId, kind: status.kind, amount });
            }
            if (status.remainingTicks <= 1) {
                events.push({ type: 'status.expired', targetId: unit.unitId, kind: status.kind });
                continue;
            }
            kept.push({ ...status, remainingTicks: status.remainingTicks - 1 });
        }
        const isDead = hp <= 0;
        if (isDead && !unit.isDead) events.push({ type: 'unit.died', unitId: unit.unitId });
        return { ...unit, currentHp: Math.max(0, hp), statuses: kept, isDead };
    });
}

export function applySkillTo(
    units: readonly CombatUnit[],
    actor: CombatUnit,
    skill: SkillRuntime,
    targetId: number,
    config: ResolverConfig,
    events: CombatEventPayload[],
): readonly CombatUnit[] {
    const target = units.find((unit) => unit.unitId === targetId);
    if (!target || target.isDead) return units;
    const isHeal = skill.damageKind === 'none' && !isEnemyTarget(skill.targetType);
    let updated = units;
    if (skill.damageKind !== 'none') {
        const base = skillBaseDamage(actor.attributes, {
            primaryAttribute: skill.primaryAttribute,
            primaryPercent: skill.primaryPercent,
            secondaryAttribute: skill.secondaryAttribute,
            secondaryPercent: skill.secondaryPercent,
        });
        const defenseKey = defenseAttributeFor(skill.damageKind);
        const armorBreak = target.statuses
            .filter((status) => status.kind === 'armor_break' || status.kind === 'resist_down')
            .reduce((sum, status) => sum + status.magnitude, 0);
        const defense = target.attributes[defenseKey] - armorBreak;
        const raw = finalDamage(base, damageReduction(defense, config.defenseLevelConstant));
        const shield = shieldAmountOf(target);
        const absorbed = Math.min(shield, raw);
        const toHp = raw - absorbed;
        updated = updated.map((unit) => {
            if (unit.unitId !== targetId) return unit;
            const statuses = absorbed > 0 ? consumeShield(unit, absorbed) : unit.statuses;
            const hp = Math.max(0, unit.currentHp - toHp);
            return { ...unit, currentHp: hp, statuses, isDead: hp <= 0 };
        });
        events.push({
            type: 'damage.dealt', actorId: actor.unitId, targetId, amount: toHp,
            damageKind: skill.damageKind, absorbedByShield: absorbed,
        });
        const after = updated.find((unit) => unit.unitId === targetId)!;
        if (after.isDead && !target.isDead) events.push({ type: 'unit.died', unitId: targetId });
    } else if (isHeal && skill.primaryPercent > 0) {
        const amount = skillBaseDamage(actor.attributes, {
            primaryAttribute: skill.primaryAttribute,
            primaryPercent: skill.primaryPercent,
            secondaryAttribute: skill.secondaryAttribute,
            secondaryPercent: skill.secondaryPercent,
        });
        updated = updated.map((unit) => unit.unitId === targetId
            ? { ...unit, currentHp: Math.min(unit.maxHp, unit.currentHp + amount) }
            : unit);
        events.push({ type: 'heal.applied', actorId: actor.unitId, targetId, amount });
    }
    if (skill.appliesStatus) {
        const { kind, durationTicks, magnitude } = skill.appliesStatus;
        updated = updated.map((unit) => unit.unitId === targetId
            ? {
                  ...unit,
                  statuses: [...unit.statuses, { kind, remainingTicks: durationTicks, magnitude, sourceId: actor.unitId }],
                  tauntStrength: kind === 'gather_spirit' ? magnitude : unit.tauntStrength,
              }
            : unit);
        events.push({ type: 'status.applied', targetId, kind, durationTicks, magnitude });
    }
    return updated;
}

function consumeShield(unit: CombatUnit, absorbed: number): readonly StatusEffect[] {
    let remaining = absorbed;
    const result: StatusEffect[] = [];
    for (const status of unit.statuses) {
        if (status.kind !== 'shield' || remaining <= 0) {
            result.push(status);
            continue;
        }
        const used = Math.min(status.magnitude, remaining);
        remaining -= used;
        const left = status.magnitude - used;
        if (left > 0) result.push({ ...status, magnitude: left });
    }
    return result;
}
