import {
    currentExpeditionBurden,
    currentExpeditionBurdenLimit,
    fieldItemNameKey,
    fieldItemWeight,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { ExpeditionPreparationConfig } from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { CombatSnapshot } from 'db://assets/scripts/domain/CombatState';
import type { EventBus } from 'db://assets/scripts/services/EventBus';
import type { GameState } from 'db://assets/scripts/services/GameState';
import { mapErrorMessage, restoreRecordValue } from 'db://assets/scripts/services/map/MapApplicationUtils';
import type {
    CombatContext,
    CombatLootActionResult,
    CombatLootEntry,
    CombatLootPanelView,
    CombatUnitMeta,
} from './CombatApplicationModels';
import type { CombatLootDefinition } from './CombatCatalog';

export interface CombatLootOperationDeps {
    readonly state: GameState;
    readonly events: EventBus;
    readonly save: () => Promise<void>;
}

export function buildCombatLootPanel(
    state: GameState,
    context: CombatContext,
    snapshot: CombatSnapshot,
    unitMeta: ReadonlyMap<number, CombatUnitMeta>,
    loot: readonly CombatLootDefinition[],
    config: ExpeditionPreparationConfig,
    soulCrystalReward = 0,
    soulCrystalGranted = false,
): CombatLootPanelView {
    const profile = state.require();
    const expedition = profile.expedition;
    if (!expedition || expedition.mapId !== context.mapId) {
        throw new Error('当前没有可处理战利品的入山进度');
    }
    const backpack = Object.entries(expedition.temporaryLoot)
        .filter(([, amount]) => amount > 0)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([itemId, amount]): CombatLootEntry => ({
            itemId,
            nameKey: fieldItemNameKey(itemId, config),
            amount,
            unitWeight: fieldItemWeight(itemId, config),
        }));
    const rewards = mergeLootDefinitions(loot, config);
    const currentBurden = currentExpeditionBurden(expedition, config);
    const burdenLimit = currentExpeditionBurdenLimit(
        { partyMemberIds: survivingPartyIds(expedition.partyMemberIds, snapshot, unitMeta) },
        profile.roster,
        config,
    );
    const rewardWeight = rewards.reduce(
        (sum, entry) => sum + entry.amount * entry.unitWeight,
        0,
    );
    const projectedBurden = currentBurden + rewardWeight;
    return {
        backpack,
        rewards,
        soulCrystalReward,
        soulCrystalGranted,
        currentBurden,
        burdenLimit,
        rewardWeight,
        projectedBurden,
        canTakeAll: projectedBurden <= burdenLimit,
    };
}

export async function dropCombatBackpackItem(
    deps: CombatLootOperationDeps,
    context: CombatContext,
    snapshot: CombatSnapshot,
    unitMeta: ReadonlyMap<number, CombatUnitMeta>,
    loot: readonly CombatLootDefinition[],
    config: ExpeditionPreparationConfig,
    itemId: string,
    soulCrystalReward = 0,
    soulCrystalGranted = false,
): Promise<CombatLootActionResult> {
    const expedition = deps.state.require().expedition;
    if (!expedition || expedition.mapId !== context.mapId) {
        return failure(
            '当前没有可操作的野外背包', deps, context, snapshot, unitMeta, loot, config,
            soulCrystalReward, soulCrystalGranted,
        );
    }
    const previous = expedition.temporaryLoot[itemId];
    if (!previous || previous <= 0) {
        return failure(
            '该物品已经不在背包中', deps, context, snapshot, unitMeta, loot, config,
            soulCrystalReward, soulCrystalGranted,
        );
    }
    if (previous === 1) delete expedition.temporaryLoot[itemId];
    else expedition.temporaryLoot[itemId] = previous - 1;
    try {
        await deps.save();
    } catch (error) {
        restoreRecordValue(expedition.temporaryLoot, itemId, previous);
        return failure(
            mapErrorMessage('丢弃物品保存失败', error),
            deps,
            context,
            snapshot,
            unitMeta,
            loot,
            config,
            soulCrystalReward,
            soulCrystalGranted,
        );
    }
    deps.events.emit('expedition.lootChanged', { loot: expedition.temporaryLoot });
    return {
        ok: true,
        message: '已将 1 件物品丢在原地',
        view: buildCombatLootPanel(
            deps.state, context, snapshot, unitMeta, loot, config,
            soulCrystalReward, soulCrystalGranted,
        ),
    };
}

function mergeLootDefinitions(
    loot: readonly CombatLootDefinition[],
    config: ExpeditionPreparationConfig,
): readonly CombatLootEntry[] {
    const merged = new Map<string, { readonly nameKey: string; amount: number }>();
    loot.forEach((item) => {
        const current = merged.get(item.itemId);
        if (current) current.amount += item.amount;
        else merged.set(item.itemId, { nameKey: item.nameKey, amount: item.amount });
    });
    return Array.from(merged, ([itemId, item]) => ({
        itemId,
        nameKey: item.nameKey,
        amount: item.amount,
        unitWeight: fieldItemWeight(itemId, config),
    }));
}

function survivingPartyIds(
    partyMemberIds: readonly string[],
    snapshot: CombatSnapshot,
    unitMeta: ReadonlyMap<number, CombatUnitMeta>,
): readonly string[] {
    const survivors = new Set(snapshot.units
        .filter((unit) => unit.side === 'ally' && !unit.isDead && unit.currentHp > 0)
        .flatMap((unit) => {
            const heroId = unitMeta.get(unit.unitId)?.heroInstanceId;
            return heroId ? [heroId] : [];
        }));
    return partyMemberIds.filter((heroId) => survivors.has(heroId));
}

function failure(
    message: string,
    deps: CombatLootOperationDeps,
    context: CombatContext,
    snapshot: CombatSnapshot,
    unitMeta: ReadonlyMap<number, CombatUnitMeta>,
    loot: readonly CombatLootDefinition[],
    config: ExpeditionPreparationConfig,
    soulCrystalReward: number,
    soulCrystalGranted: boolean,
): CombatLootActionResult {
    return {
        ok: false,
        message,
        view: buildCombatLootPanel(
            deps.state, context, snapshot, unitMeta, loot, config,
            soulCrystalReward, soulCrystalGranted,
        ),
    };
}
