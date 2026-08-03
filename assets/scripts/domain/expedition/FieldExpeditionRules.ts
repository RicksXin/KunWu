import type {
    ExpeditionFieldConfig,
    ExpeditionHeroSnapshot,
    ExpeditionPreparationConfig,
} from './ExpeditionConfig';
import { partyBurdenLimit } from './ExpeditionRules';

export interface FieldExpeditionSnapshot {
    readonly partyMemberIds: readonly string[];
    readonly remainingGrain: number;
    readonly carriedItems: Readonly<Record<string, number>>;
    readonly temporaryLoot: Readonly<Record<string, number>>;
}

export function restUseLimit(field: ExpeditionFieldConfig, forgeLevel: number): number {
    const index = Math.min(
        Math.max(0, Math.floor(forgeLevel)),
        field.restUseLimitsByForgeLevel.length - 1,
    );
    return field.restUseLimitsByForgeLevel[index]!;
}

export function fieldItemWeight(itemId: string, config: ExpeditionPreparationConfig): number {
    const loadoutItem = Object.values(config.items).find((item) => item.inventoryId === itemId);
    if (loadoutItem) return loadoutItem.weight;
    const food = config.field.foodItems.find((item) => item.itemId === itemId);
    return food?.weight ?? config.field.defaultLootWeight;
}

export function fieldItemNameKey(itemId: string, config: ExpeditionPreparationConfig): string {
    const loadoutItem = Object.values(config.items).find((item) => item.inventoryId === itemId);
    if (loadoutItem) return loadoutItem.nameKey;
    const food = config.field.foodItems.find((item) => item.itemId === itemId);
    if (food) return food.nameKey;
    if (itemId === config.field.returnTalismanItemId) return config.field.returnTalismanNameKey;
    return `item.${itemId}`;
}

export function currentExpeditionBurden(
    expedition: FieldExpeditionSnapshot,
    config: ExpeditionPreparationConfig,
): number {
    const grainWeight = config.items.spiritGrain.weight;
    const carried = recordWeight(expedition.carriedItems, config);
    const loot = recordWeight(expedition.temporaryLoot, config);
    return expedition.remainingGrain * grainWeight + carried + loot;
}

export function currentExpeditionBurdenLimit(
    expedition: Pick<FieldExpeditionSnapshot, 'partyMemberIds'>,
    heroes: readonly ExpeditionHeroSnapshot[],
    config: ExpeditionPreparationConfig,
): number {
    return partyBurdenLimit(expedition.partyMemberIds, heroes, config);
}

function recordWeight(
    record: Readonly<Record<string, number>>,
    config: ExpeditionPreparationConfig,
): number {
    return Object.entries(record).reduce(
        (sum, [itemId, amount]) => sum + fieldItemWeight(itemId, config) * amount,
        0,
    );
}
