import { aliveUnitsOf, hasStatus } from '../CombatState';
import type { CombatSide, CombatSnapshot, CombatUnit, SkillRuntime } from '../CombatState';
import { resolveTauntedTarget } from '../SkillTargeting';
import type { ResolverConfig } from './CombatResolverTypes';

export interface SkillChoice {
    readonly skill: SkillRuntime;
    readonly targetIds: readonly number[];
}

export function chooseSkill(
    units: readonly CombatUnit[],
    actor: CombatUnit,
    config: ResolverConfig,
): SkillChoice | null {
    const snapshot: CombatSnapshot = { tick: 0, units, outcome: null };
    for (const skillId of actor.skillIds) {
        const skill = config.skills.get(skillId);
        if (!skill || (actor.cooldowns[skillId] ?? 0) > 0) continue;
        if (hasStatus(actor, 'silence') && skill.appliesStatus) continue;
        const targetIds = selectTargets(snapshot, actor, skill, config);
        if (targetIds.length > 0) return { skill, targetIds };
    }
    return null;
}

function selectTargets(
    snapshot: CombatSnapshot,
    actor: CombatUnit,
    skill: SkillRuntime,
    config: ResolverConfig,
): readonly number[] {
    const opposing: CombatSide = actor.side === 'ally' ? 'enemy' : 'ally';
    const enemies = aliveUnitsOf(snapshot, opposing);
    const allies = aliveUnitsOf(snapshot, actor.side);
    switch (skill.targetType) {
        case 'SELF': return [actor.unitId];
        case 'ALLY_ALL': return allies.map((unit) => unit.unitId);
        case 'ENEMY_ALL': return enemies.map((unit) => unit.unitId);
        case 'ALLY_SINGLE': return allies.length > 0 ? [allies[0]!.unitId] : [];
        case 'ALLY_LOWEST_HP': {
            const lowest = lowestHp(allies);
            return lowest ? [lowest.unitId] : [];
        }
        case 'ENEMY_LOWEST_HP': {
            const lowest = lowestHp(enemies);
            return lowest ? [applyTaunt(skill, lowest.unitId, enemies)] : [];
        }
        case 'ENEMY_HIGHEST_STAT': {
            const highest = enemies.reduce<CombatUnit | null>(
                (best, unit) => !best || unit.attributes.strength > best.attributes.strength ? unit : best,
                null,
            );
            return highest ? [applyTaunt(skill, highest.unitId, enemies)] : [];
        }
        case 'ENEMY_RANDOM_MULTI': {
            if (enemies.length === 0) return [];
            const count = Math.min(2, enemies.length);
            const picked: number[] = [];
            for (let index = 0; index < count; index += 1) {
                const enemyIndex = Math.floor(config.random() * enemies.length);
                picked.push(enemies[Math.min(enemyIndex, enemies.length - 1)]!.unitId);
            }
            return picked;
        }
        case 'ENEMY_SINGLE':
            return enemies.length > 0 ? [applyTaunt(skill, enemies[0]!.unitId, enemies)] : [];
    }
}

function applyTaunt(skill: SkillRuntime, intendedTargetId: number, enemies: readonly CombatUnit[]): number {
    const taunts = enemies
        .filter((unit) => unit.tauntStrength > 0)
        .map((unit) => ({ taunterId: unit.unitId, strength: unit.tauntStrength, isAlive: !unit.isDead }));
    return resolveTauntedTarget(skill.targetType, skill.ignoreTaunt, intendedTargetId, taunts);
}

function lowestHp(units: readonly CombatUnit[]): CombatUnit | null {
    return units.reduce<CombatUnit | null>(
        (best, unit) => !best || unit.currentHp < best.currentHp ? unit : best,
        null,
    );
}
