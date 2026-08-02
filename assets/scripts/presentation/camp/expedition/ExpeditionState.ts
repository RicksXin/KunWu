import type {
    ExpeditionHeroSnapshot,
    ExpeditionItemId,
    ExpeditionPreparationConfig,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { PartyPreset } from 'db://assets/scripts/domain/Party';
import type {
    ExpeditionPreparationState,
    Profile,
} from 'db://assets/scripts/services/GameState';

export function currentExpeditionPreset(
    state: ExpeditionPreparationState,
): PartyPreset {
    const preset = state.partyPresets.find(
        (candidate) => candidate.presetId === state.activePresetId,
    );
    if (!preset) {
        throw new Error(`当前队伍 ${state.activePresetId} 不存在`);
    }
    return preset;
}

export function expeditionHeroSnapshots(
    profile: Profile,
): readonly ExpeditionHeroSnapshot[] {
    return profile.roster.map((hero) => ({
        instanceId: hero.instanceId,
        isDead: hero.isDead,
        stamina: hero.stamina,
        attributes: hero.attributes,
    }));
}

export function availableExpeditionItemCount(
    itemId: ExpeditionItemId,
    profile: Profile,
    config: ExpeditionPreparationConfig,
): number {
    if (itemId === 'spiritGrain') {
        return profile.wallet.spiritGrain;
    }
    const inventoryId = config.items[itemId].inventoryId;
    return inventoryId ? profile.inventory[inventoryId] ?? 0 : 0;
}
