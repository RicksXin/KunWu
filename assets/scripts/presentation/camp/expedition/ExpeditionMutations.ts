import {
    loadoutWeight,
    maximumSpiritGrainLoadout,
    partyBurdenLimit,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import type {
    ExpeditionItemId,
    ExpeditionPreparationConfig,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import {
    assignToSlot,
    clearSlot,
    createPreset,
    membersOf,
} from 'db://assets/scripts/domain/Party';
import type { PartySlots } from 'db://assets/scripts/domain/Party';
import type { HeroInstance, Profile } from 'db://assets/scripts/services/GameState';
import {
    availableExpeditionItemCount,
    currentExpeditionPreset,
    expeditionHeroSnapshots,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionState';
import { partyRejectionText } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionTheme';

export interface ExpeditionMutationResult {
    readonly changed: boolean;
    readonly message?: string;
    readonly walletChanged?: boolean;
}

export function unlockExpeditionParty(
    profile: Profile,
    config: ExpeditionPreparationConfig,
    index: number,
): ExpeditionMutationResult {
    if (index !== profile.expeditionPreparation.partyPresets.length) {
        return { changed: false, message: '请按顺序解锁队伍' };
    }
    const cost = config.partyUnlockCosts[index] ?? 0;
    if (profile.wallet.immortalCoin < cost) {
        return { changed: false, message: `解锁 ${index + 1}队需要 ${cost} 灵石` };
    }
    profile.wallet.immortalCoin -= cost;
    const next = createPreset(`party_${String(index + 1).padStart(2, '0')}`, `${index + 1}队`);
    profile.expeditionPreparation.partyPresets.push(next);
    profile.expeditionPreparation.activePresetId = next.presetId;
    return {
        changed: true,
        message: `${index + 1}队已解锁`,
        walletChanged: true,
    };
}

export function adjustExpeditionLoadout(
    profile: Profile,
    config: ExpeditionPreparationConfig,
    itemId: ExpeditionItemId,
    delta: number,
): ExpeditionMutationResult {
    const state = profile.expeditionPreparation;
    const preset = currentExpeditionPreset(state);
    const next = state.loadout[itemId] + delta;
    const available = availableExpeditionItemCount(itemId, profile, config);
    if (next < 0 || next > available) {
        return { changed: false };
    }
    const old = state.loadout[itemId];
    state.loadout[itemId] = next;
    const limit = partyBurdenLimit(preset.slots, expeditionHeroSnapshots(profile), config);
    if (loadoutWeight(state.loadout, config) > limit) {
        state.loadout[itemId] = old;
        return { changed: false, message: '负重已达上限' };
    }
    return { changed: true };
}

export function maximizeExpeditionSpiritGrain(
    profile: Profile,
    config: ExpeditionPreparationConfig,
): ExpeditionMutationResult {
    const state = profile.expeditionPreparation;
    const preset = currentExpeditionPreset(state);
    const next = maximumSpiritGrainLoadout({
        slots: preset.slots,
        heroes: expeditionHeroSnapshots(profile),
        loadout: state.loadout,
        availableSpiritGrain: profile.wallet.spiritGrain,
        config,
    });
    if (state.loadout.spiritGrain === next) return { changed: false };
    state.loadout.spiritGrain = next;
    return { changed: true };
}

export function toggleExpeditionHero(
    profile: Profile,
    hero: HeroInstance,
): ExpeditionMutationResult {
    const state = profile.expeditionPreparation;
    const presetIndex = state.partyPresets.findIndex(
        (candidate) => candidate.presetId === state.activePresetId,
    );
    const preset = state.partyPresets[presetIndex];
    if (!preset) {
        return { changed: false };
    }
    const existing = preset.slots.indexOf(hero.instanceId);
    let slots: PartySlots;
    if (existing >= 0) {
        slots = clearSlot(preset.slots, existing);
    } else {
        const empty = preset.slots.indexOf(null);
        if (empty < 0) {
            return { changed: false, message: '队伍已满，请先取消一名修士' };
        }
        const otherPartyMembers = state.partyPresets
            .filter((candidate) => candidate.presetId !== preset.presetId)
            .flatMap((candidate) => membersOf(candidate.slots));
        const assigned = assignToSlot({
            slots: preset.slots,
            slotIndex: empty,
            heroId: hero.instanceId,
            heroes: profile.roster,
            otherPartyMembers,
        });
        if (!assigned.ok) {
            return { changed: false, message: partyRejectionText(assigned.reason) };
        }
        slots = assigned.slots;
    }
    state.partyPresets[presetIndex] = { ...preset, slots };
    return { changed: true };
}
