import type { CombatSnapshot, CombatUnit } from 'db://assets/scripts/domain/CombatState';
import type { Profile } from 'db://assets/scripts/services/GameState';
import type { CombatContext, CombatUnitMeta } from './CombatApplicationModels';
import type { CombatCatalog, CombatEncounterDefinition } from './CombatCatalog';

export interface ActiveCombatSession {
    readonly context: CombatContext;
    readonly catalog: CombatCatalog;
    readonly encounter: CombatEncounterDefinition;
    readonly unitMeta: ReadonlyMap<number, CombatUnitMeta>;
    readonly autoUnitIds: Set<number>;
    readonly manualReadyQueue: number[];
    readonly actionMaximums: Map<number, number>;
    snapshot: CombatSnapshot;
    settling: boolean;
    victoryPrepared: boolean;
}

export interface CombatSessionCreation {
    readonly session: ActiveCombatSession;
    readonly allyIds: readonly number[];
    readonly enemyIds: readonly number[];
}

export function createCombatSession(
    profile: Profile,
    context: CombatContext,
    catalog: CombatCatalog,
): CombatSessionCreation {
    const expedition = profile.expedition;
    if (!expedition || expedition.mapId !== context.mapId) {
        throw new Error('当前没有可进入战斗的入山进度');
    }
    const encounter = catalog.encounters.get(context.enemyId);
    if (!encounter) throw new Error(`找不到敌方配置：${context.enemyId}`);
    const heroes = expedition.partyMemberIds.map((id) => {
        const hero = profile.roster.find((candidate) => candidate.instanceId === id);
        if (!hero || hero.isDead) throw new Error(`参战修士不可用：${id}`);
        return hero;
    });
    if (heroes.length === 0) throw new Error('当前队伍没有可参战修士');
    if (catalog.partyInitialActionTimers.length < heroes.length) {
        throw new Error('战斗配置缺少队伍初始行动计时');
    }

    const allies: CombatUnit[] = heroes.map((hero, index) => ({
        unitId: index + 1,
        side: 'ally',
        nameKey: hero.nameKey,
        attributes: hero.attributes,
        currentHp: hero.currentHp,
        maxHp: hero.maxHp,
        skillIds: [...hero.skillIds],
        actionTimer: catalog.partyInitialActionTimers[index]!,
        cooldowns: {},
        statuses: [],
        isDead: false,
        tauntStrength: 0,
    }));
    const enemies: CombatUnit[] = encounter.enemies.map((enemy, index) => ({
        unitId: 101 + index,
        side: 'enemy',
        nameKey: enemy.nameKey,
        attributes: enemy.attributes,
        currentHp: enemy.maxHp,
        maxHp: enemy.maxHp,
        skillIds: [...enemy.skillIds],
        actionTimer: enemy.initialActionTimer,
        cooldowns: {},
        statuses: [],
        isDead: false,
        tauntStrength: 0,
    }));
    const unitMeta = new Map<number, CombatUnitMeta>();
    allies.forEach((unit, index) => unitMeta.set(unit.unitId, {
        unitId: unit.unitId,
        nameKey: unit.nameKey,
        raceKey: 'race.human',
        heroInstanceId: heroes[index]!.instanceId,
        portraitKey: unit.nameKey,
    }));
    enemies.forEach((unit, index) => unitMeta.set(unit.unitId, {
        unitId: unit.unitId,
        nameKey: unit.nameKey,
        raceKey: encounter.enemies[index]!.raceKey,
    }));
    const units = [...allies, ...enemies];
    return {
        session: {
            context,
            catalog,
            encounter,
            unitMeta,
            autoUnitIds: new Set(),
            manualReadyQueue: [],
            actionMaximums: new Map(units.map((unit) => [unit.unitId, unit.actionTimer])),
            snapshot: { tick: 0, units, outcome: null },
            settling: false,
            victoryPrepared: false,
        },
        allyIds: allies.map((unit) => unit.unitId),
        enemyIds: enemies.map((unit) => unit.unitId),
    };
}

export function captureCombatActionMaximums(
    session: ActiveCombatSession,
    before: readonly CombatUnit[],
    after: readonly CombatUnit[],
): void {
    after.forEach((unit) => {
        const previous = before.find((candidate) => candidate.unitId === unit.unitId);
        if (!previous || unit.actionTimer > previous.actionTimer) {
            session.actionMaximums.set(unit.unitId, Math.max(1, unit.actionTimer));
        }
    });
}
