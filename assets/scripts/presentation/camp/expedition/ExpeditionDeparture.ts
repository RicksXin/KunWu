import {
    EXPEDITION_ITEM_IDS,
    restUseLimit,
    validateExpeditionReadiness,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import type {
    ExpeditionMapOption,
    ExpeditionPreparationConfig,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { AppRoot } from 'db://assets/scripts/AppRoot';
import type { Profile } from 'db://assets/scripts/services/GameState';
import {
    availableExpeditionItemCount,
    currentExpeditionPreset,
    expeditionHeroSnapshots,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionState';

export type ExpeditionDepartureResult =
    | { readonly ok: false; readonly message: string }
    | {
        readonly ok: true;
        readonly partyPresetId: string;
        readonly partyMemberIds: readonly string[];
        readonly loadout: Profile['expeditionPreparation']['loadout'];
        readonly carriedItems: Readonly<Record<string, number>>;
        readonly restUses: number;
    };

export function prepareExpeditionDeparture(
    profile: Profile,
    config: ExpeditionPreparationConfig,
    map: ExpeditionMapOption,
): ExpeditionDepartureResult {
    const preset = currentExpeditionPreset(profile.expeditionPreparation);
    const loadout = { ...profile.expeditionPreparation.loadout };
    for (const itemId of EXPEDITION_ITEM_IDS) {
        loadout[itemId] = Math.min(
            loadout[itemId],
            availableExpeditionItemCount(itemId, profile, config),
        );
    }
    const readiness = validateExpeditionReadiness({
        slots: preset.slots,
        heroes: expeditionHeroSnapshots(profile),
        loadout,
        map,
        config,
    });
    if (!readiness.isReady) {
        return { ok: false, message: readiness.problems[0] ?? '当前无法入山' };
    }
    return {
        ok: true,
        partyPresetId: preset.presetId,
        partyMemberIds: preset.slots.filter((id): id is string => id !== null),
        loadout,
        carriedItems: Object.fromEntries(
            EXPEDITION_ITEM_IDS.flatMap((itemId) => {
                const inventoryId = config.items[itemId].inventoryId;
                return inventoryId && loadout[itemId] > 0
                    ? [[inventoryId, loadout[itemId]] as const]
                    : [];
            }),
        ),
        restUses: restUseLimit(config.field, profile.camp.buildingLevels.lian_qi_fang ?? 0),
    };
}

export async function startExpeditionDeparture(
    app: AppRoot,
    config: ExpeditionPreparationConfig,
    map: ExpeditionMapOption,
    closePreparation: () => void,
): Promise<void> {
    const profile = app.state.require();
    const departure = prepareExpeditionDeparture(profile, config, map);
    if (!departure.ok) {
        app.showFeedback(departure.message, 3);
        return;
    }
    Object.assign(profile.expeditionPreparation.loadout, departure.loadout);
    app.events.emit('expedition.mapSelected', {
        mapId: map.mapId,
        partyPresetId: departure.partyPresetId,
        partyMemberIds: departure.partyMemberIds,
        staminaCost: map.staminaCost,
        loadout: departure.loadout,
        carriedItems: departure.carriedItems,
        restUses: departure.restUses,
    });
    app.map.stageDeparture({
        mapId: map.mapId,
        partyPresetId: departure.partyPresetId,
        partyMemberIds: departure.partyMemberIds,
        staminaCost: map.staminaCost,
        loadout: departure.loadout,
        carriedItems: departure.carriedItems,
        restUses: departure.restUses,
    });
    closePreparation();
    try {
        await app.router.replaceRoot({ pageId: 'map', params: { mapId: map.mapId } });
    } catch (error) {
        app.map.cancelStagedDeparture();
        console.error('[入山整备] 地图场景加载失败', error);
        app.showFeedback('地图加载失败，未扣除灵息与物资', 3);
        try {
            await app.router.replaceRoot({ pageId: 'camp' });
        } catch (restoreError) {
            console.error('[入山整备] 恢复营地场景失败', restoreError);
        }
    }
}
