import {
    EXPEDITION_ITEM_IDS,
    validateExpeditionReadiness,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import type {
    ExpeditionMapOption,
    ExpeditionPreparationConfig,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { Profile } from 'db://assets/scripts/services/GameState';
import {
    availableExpeditionItemCount,
    currentExpeditionPreset,
    expeditionHeroSnapshots,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionState';
import { expeditionText } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionTheme';

export type ExpeditionDepartureResult =
    | { readonly ok: false; readonly message: string }
    | {
        readonly ok: true;
        readonly partyPresetId: string;
        readonly loadout: Profile['expeditionPreparation']['loadout'];
    };

export function prepareExpeditionDeparture(
    profile: Profile,
    config: ExpeditionPreparationConfig,
    map: ExpeditionMapOption,
): ExpeditionDepartureResult {
    const preset = currentExpeditionPreset(profile.expeditionPreparation);
    for (const itemId of EXPEDITION_ITEM_IDS) {
        const carried = profile.expeditionPreparation.loadout[itemId];
        if (carried > availableExpeditionItemCount(itemId, profile, config)) {
            return {
                ok: false,
                message: `${expeditionText(config.items[itemId].nameKey)}库存不足`,
            };
        }
    }
    const readiness = validateExpeditionReadiness({
        slots: preset.slots,
        heroes: expeditionHeroSnapshots(profile),
        loadout: profile.expeditionPreparation.loadout,
        map,
        config,
    });
    if (!readiness.isReady) {
        return { ok: false, message: readiness.problems[0] ?? '当前无法入山' };
    }
    return {
        ok: true,
        partyPresetId: preset.presetId,
        loadout: { ...profile.expeditionPreparation.loadout },
    };
}
