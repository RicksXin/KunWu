import type { CombatSnapshot } from 'db://assets/scripts/domain/CombatState';
import type { ExpeditionPreparationConfig } from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { EventBus } from 'db://assets/scripts/services/EventBus';
import type { GameState, HeroInstance } from 'db://assets/scripts/services/GameState';
import { settleExpeditionPartyDeath } from 'db://assets/scripts/services/map/MapDeathSettlement';
import { mapErrorMessage, restoreRecordValue } from 'db://assets/scripts/services/map/MapApplicationUtils';
import type { CombatContext, CombatSettlementResult, CombatUnitMeta } from './CombatApplicationModels';
import type { CombatLootDefinition } from './CombatCatalog';
import { buildCombatLootPanel } from './CombatLootOperations';

export interface CombatSettlementDeps {
    readonly state: GameState;
    readonly events: EventBus;
    readonly save: () => Promise<void>;
    readonly nowUtcSeconds: () => number;
}

export async function prepareCombatVictory(
    deps: CombatSettlementDeps,
    context: CombatContext,
    snapshot: CombatSnapshot,
    unitMeta: ReadonlyMap<number, CombatUnitMeta>,
    soulCrystalReward: number,
): Promise<CombatSettlementResult> {
    return settleSurvivingParty(
        deps,
        context,
        snapshot,
        unitMeta,
        [],
        true,
        soulCrystalReward,
        `战斗胜利，已获得 ${soulCrystalReward} 魂晶`,
    );
}

export async function settlePreparedCombatLoot(
    deps: CombatSettlementDeps,
    context: CombatContext,
    snapshot: CombatSnapshot,
    unitMeta: ReadonlyMap<number, CombatUnitMeta>,
    loot: readonly CombatLootDefinition[],
    takeLoot: boolean,
    config: ExpeditionPreparationConfig,
): Promise<CombatSettlementResult> {
    if (!takeLoot) {
        return {
            ok: true,
            message: '已离开战场，未拾取的战利品留在原地',
            destination: 'map',
            outcome: 'ally_win',
        };
    }
    const burden = buildCombatLootPanel(deps.state, context, snapshot, unitMeta, loot, config);
    if (!burden.canTakeAll) {
        return failure(
            `负重不足（${burden.projectedBurden}/${burden.burdenLimit}），无法拾取全部战利品`,
            true,
        );
    }
    return savePreparedLoot(deps, context, loot);
}

async function savePreparedLoot(
    deps: CombatSettlementDeps,
    context: CombatContext,
    loot: readonly CombatLootDefinition[],
): Promise<CombatSettlementResult> {
    const expedition = deps.state.require().expedition;
    if (!expedition || expedition.mapId !== context.mapId) {
        return failure('当前没有可结算的战利品进度', true);
    }
    const lootBefore = new Map(loot.map((item) => [item.itemId, expedition.temporaryLoot[item.itemId]]));
    loot.forEach((item) => {
        expedition.temporaryLoot[item.itemId] =
            (expedition.temporaryLoot[item.itemId] ?? 0) + item.amount;
    });
    try {
        await deps.save();
    } catch (error) {
        loot.forEach((item) => restoreRecordValue(
            expedition.temporaryLoot,
            item.itemId,
            lootBefore.get(item.itemId),
        ));
        return failure(mapErrorMessage('战利品保存失败', error), true);
    }
    deps.events.emit('expedition.lootChanged', { loot: expedition.temporaryLoot });
    return { ok: true, message: '已拾取全部战利品', destination: 'map', outcome: 'ally_win' };
}

export async function settleCombatExit(
    deps: CombatSettlementDeps,
    context: CombatContext,
    snapshot: CombatSnapshot,
    unitMeta: ReadonlyMap<number, CombatUnitMeta>,
): Promise<CombatSettlementResult> {
    return settleSurvivingParty(deps, context, snapshot, unitMeta, [], false, 0);
}

export async function settleCombatDefeat(
    deps: CombatSettlementDeps,
    context: CombatContext,
): Promise<CombatSettlementResult> {
    const result = await settleExpeditionPartyDeath(deps, context.mapId, 'combat_defeat');
    return result.ok
        ? { ok: true, message: '队伍全员阵亡，已返回营地', destination: 'camp', outcome: 'enemy_win' }
        : { ok: false, message: result.message, destination: 'camp', outcome: 'enemy_win' };
}

async function settleSurvivingParty(
    deps: CombatSettlementDeps,
    context: CombatContext,
    snapshot: CombatSnapshot,
    unitMeta: ReadonlyMap<number, CombatUnitMeta>,
    loot: readonly CombatLootDefinition[],
    victory: boolean,
    soulCrystalReward: number,
    victoryMessage = '',
): Promise<CombatSettlementResult> {
    const profile = deps.state.require();
    const expedition = profile.expedition;
    if (!expedition || expedition.mapId !== context.mapId) {
        return failure('当前没有可结算的战斗进度', victory);
    }
    const heroChanges = collectHeroChanges(profile.roster, snapshot, unitMeta);
    const heroBefore = heroChanges.map(({ hero }) => ({
        hero,
        currentHp: hero.currentHp,
        isDead: hero.isDead,
    }));
    const presetsBefore = profile.expeditionPreparation.partyPresets.map((preset) => ({
        ...preset,
        slots: [...preset.slots],
    }));
    const lootBefore = new Map(loot.map((item) => [item.itemId, expedition.temporaryLoot[item.itemId]]));
    const progressKey = `${context.mapId}.${context.objectId}`;
    const completedBefore = profile.completedMapObjects[progressKey];
    const soulCrystalBefore = profile.wallet.soulCrystal;
    const expeditionBefore = profile.expedition;
    try {
        const newlyDead = new Set<string>();
        heroChanges.forEach(({ hero, currentHp }) => {
            hero.currentHp = currentHp;
            hero.isDead = currentHp <= 0;
            if (hero.isDead) newlyDead.add(hero.instanceId);
        });
        if (newlyDead.size > 0) {
            profile.expeditionPreparation.partyPresets = presetsBefore.map((preset) => ({
                ...preset,
                slots: preset.slots.map((id) => id && newlyDead.has(id) ? null : id),
            }));
            profile.expedition = {
                ...expedition,
                partyMemberIds: expedition.partyMemberIds.filter((id) => !newlyDead.has(id)),
            };
        }
        if (victory) {
            profile.completedMapObjects[progressKey] = true;
            if (!completedBefore) profile.wallet.soulCrystal += soulCrystalReward;
            loot.forEach((item) => {
                expedition.temporaryLoot[item.itemId] =
                    (expedition.temporaryLoot[item.itemId] ?? 0) + item.amount;
            });
        }
        await deps.save();
    } catch (error) {
        heroBefore.forEach(({ hero, currentHp, isDead }) => {
            hero.currentHp = currentHp;
            hero.isDead = isDead;
        });
        profile.expeditionPreparation.partyPresets = presetsBefore;
        profile.wallet.soulCrystal = soulCrystalBefore;
        profile.expedition = expeditionBefore;
        if (completedBefore) profile.completedMapObjects[progressKey] = completedBefore;
        else delete profile.completedMapObjects[progressKey];
        loot.forEach((item) => restoreRecordValue(
            expedition.temporaryLoot,
            item.itemId,
            lootBefore.get(item.itemId),
        ));
        return failure(mapErrorMessage('战斗结果保存失败', error), victory);
    }
    const heroIds = heroChanges.map(({ hero }) => hero.instanceId);
    deps.events.emit('heroes.healthChanged', { heroIds });
    if (heroChanges.some(({ currentHp }) => currentHp <= 0)) {
        deps.events.emit('heroes.deathChanged', { heroIds, source: 'combat' });
        deps.events.emit('camp.badgesChanged', { source: 'combat' });
    }
    if (victory) {
        if (!completedBefore && soulCrystalReward > 0) {
            deps.events.emit('wallet.changed', { wallet: profile.wallet });
        }
        deps.events.emit('map.objectResolved', {
            mapId: context.mapId,
            objectId: context.objectId,
            kind: 'enemy_group',
        });
        if (loot.length > 0) {
            deps.events.emit('expedition.lootChanged', { loot: expedition.temporaryLoot });
        }
    }
    return {
        ok: true,
        message: victory ? victoryMessage : '已脱离战斗',
        destination: 'map',
        outcome: victory ? 'ally_win' : 'escaped',
    };
}

function collectHeroChanges(
    roster: readonly HeroInstance[],
    snapshot: CombatSnapshot,
    unitMeta: ReadonlyMap<number, CombatUnitMeta>,
): readonly { readonly hero: HeroInstance; readonly currentHp: number }[] {
    return snapshot.units.flatMap((unit) => {
        const heroId = unitMeta.get(unit.unitId)?.heroInstanceId;
        const hero = heroId ? roster.find((candidate) => candidate.instanceId === heroId) : undefined;
        return hero ? [{ hero, currentHp: unit.currentHp }] : [];
    });
}

function failure(message: string, victory: boolean): CombatSettlementResult {
    return {
        ok: false,
        message,
        destination: 'map',
        outcome: victory ? 'ally_win' : 'escaped',
    };
}
