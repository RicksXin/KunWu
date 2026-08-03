import type { EventBus } from 'db://assets/scripts/services/EventBus';
import type { GameState } from 'db://assets/scripts/services/GameState';
import { mapErrorMessage, replaceRecord } from './MapApplicationUtils';
import type { MapActionResult } from './MapApplicationModels';

export interface MapDeathSettlementDeps {
    readonly state: GameState;
    readonly events: EventBus;
    readonly save: () => Promise<void>;
    readonly nowUtcSeconds: () => number;
}

export async function settleGrainDepletionDeath(
    deps: MapDeathSettlementDeps,
    mapId: string,
    depletionStepLimit: number,
): Promise<MapActionResult> {
    const profile = deps.state.require();
    const expedition = profile.expedition;
    if (!expedition || expedition.mapId !== mapId) {
        return { ok: false, message: '当前没有可结算的入山进度' };
    }
    if (expedition.remainingGrain > 0
        || expedition.grainDepletionSteps < depletionStepLimit) {
        return { ok: false, message: '队伍尚未进入断粮阵亡状态' };
    }
    return settleExpeditionPartyDeath(deps, mapId, 'grain_depletion');
}

/** 战斗失败与断粮共用的全队阵亡原子结算。 */
export async function settleExpeditionPartyDeath(
    deps: MapDeathSettlementDeps,
    mapId: string,
    source: 'grain_depletion' | 'combat_defeat',
): Promise<MapActionResult> {
    const profile = deps.state.require();
    const expedition = profile.expedition;
    if (!expedition || expedition.mapId !== mapId) {
        return { ok: false, message: '当前没有可结算的入山进度' };
    }
    const memberIds = new Set(expedition.partyMemberIds);
    const heroes = profile.roster.filter((hero) => memberIds.has(hero.instanceId));
    if (heroes.length === 0) {
        return { ok: false, message: '本次入山队伍缺少有效修士' };
    }

    const inventoryBefore = { ...profile.inventory };
    const heroesBefore = heroes.map((hero) => ({
        hero,
        currentHp: hero.currentHp,
        isDead: hero.isDead,
    }));
    const presetsBefore = profile.expeditionPreparation.partyPresets.map((preset) => ({
        ...preset,
        slots: [...preset.slots],
    }));
    const recoveryAnchorBefore = profile.expeditionPreparation.lastStaminaSettledAtUtc;
    try {
        heroes.forEach((hero) => {
            hero.currentHp = 0;
            hero.isDead = true;
        });
        profile.expeditionPreparation.partyPresets = presetsBefore.map((preset) => ({
            ...preset,
            slots: preset.slots.map((heroId) => heroId && memberIds.has(heroId) ? null : heroId),
        }));
        returnHalfOfLossPool(profile.inventory, expedition.carriedItems, expedition.temporaryLoot);
        profile.expeditionPreparation.lastStaminaSettledAtUtc = deps.nowUtcSeconds();
        profile.expedition = null;
        await deps.save();
    } catch (error) {
        replaceRecord(profile.inventory, inventoryBefore);
        heroesBefore.forEach(({ hero, currentHp, isDead }) => {
            hero.currentHp = currentHp;
            hero.isDead = isDead;
        });
        profile.expeditionPreparation.partyPresets = presetsBefore;
        profile.expeditionPreparation.lastStaminaSettledAtUtc = recoveryAnchorBefore;
        profile.expedition = expedition;
        const label = source === 'grain_depletion' ? '断粮阵亡' : '战斗阵亡';
        return { ok: false, message: mapErrorMessage(`${label}结算保存失败`, error) };
    }

    const heroIds = heroes.map((hero) => hero.instanceId);
    deps.events.emit('heroes.deathChanged', { heroIds, source });
    deps.events.emit('inventory.changed', { inventory: profile.inventory });
    deps.events.emit('camp.badgesChanged', { source });
    deps.events.emit('expedition.ended', {
        mapId,
        reason: source,
    });
    return { ok: true };
}

function returnHalfOfLossPool(
    inventory: Record<string, number>,
    carriedItems: Readonly<Record<string, number>>,
    temporaryLoot: Readonly<Record<string, number>>,
): void {
    const pool: Record<string, number> = {};
    for (const source of [carriedItems, temporaryLoot]) {
        for (const [itemId, amount] of Object.entries(source)) {
            pool[itemId] = (pool[itemId] ?? 0) + amount;
        }
    }
    for (const [itemId, amount] of Object.entries(pool)) {
        const retained = Math.floor(amount / 2);
        if (retained > 0) inventory[itemId] = (inventory[itemId] ?? 0) + retained;
    }
}
