import type { EventBus } from 'db://assets/scripts/services/EventBus';
import type { GameState } from 'db://assets/scripts/services/GameState';
import { mapErrorMessage, replaceRecord } from './MapApplicationUtils';
import type { MapActionResult } from './MapApplicationModels';

export interface MapReturnSettlementDeps {
    readonly state: GameState;
    readonly events: EventBus;
    readonly save: () => Promise<void>;
    readonly nowUtcSeconds: () => number;
}

export async function settleMapReturn(
    deps: MapReturnSettlementDeps,
    input: {
        readonly mapId: string;
        readonly consumeItemId?: string;
    },
): Promise<MapActionResult> {
    const profile = deps.state.require();
    const expedition = profile.expedition;
    if (!expedition || expedition.mapId !== input.mapId) {
        return { ok: false, message: '当前没有可结算的探索进度' };
    }
    const walletBefore = profile.wallet.spiritGrain;
    const inventoryBefore = { ...profile.inventory };
    const recoveryAnchorBefore = profile.expeditionPreparation.lastStaminaSettledAtUtc;
    if (input.consumeItemId) {
        profile.inventory[input.consumeItemId] = (profile.inventory[input.consumeItemId] ?? 0) - 1;
    }
    profile.wallet.spiritGrain += expedition.remainingGrain;
    mergeItems(profile.inventory, expedition.carriedItems);
    mergeItems(profile.inventory, expedition.temporaryLoot);
    profile.expeditionPreparation.lastStaminaSettledAtUtc = deps.nowUtcSeconds();
    profile.expedition = null;
    try {
        await deps.save();
    } catch (error) {
        profile.wallet.spiritGrain = walletBefore;
        replaceRecord(profile.inventory, inventoryBefore);
        profile.expeditionPreparation.lastStaminaSettledAtUtc = recoveryAnchorBefore;
        profile.expedition = expedition;
        return { ok: false, message: mapErrorMessage('归营保存失败', error) };
    }
    deps.events.emit('wallet.changed', { wallet: profile.wallet });
    deps.events.emit('inventory.changed', { inventory: profile.inventory });
    deps.events.emit('expedition.ended', { mapId: input.mapId, reason: 'returned' });
    return { ok: true };
}

function mergeItems(target: Record<string, number>, source: Readonly<Record<string, number>>): void {
    for (const [itemId, amount] of Object.entries(source)) {
        target[itemId] = (target[itemId] ?? 0) + amount;
    }
}
