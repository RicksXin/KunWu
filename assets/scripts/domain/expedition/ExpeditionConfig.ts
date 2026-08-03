import type { Attributes } from '../Attributes';

export const EXPEDITION_CONFIG_TABLE = 'expedition_preparation_config';
export const EXPEDITION_CONFIG_ID = 'default';
export const EXPEDITION_ITEM_IDS = ['spiritGrain', 'pickaxe', 'lens'] as const;
export type ExpeditionItemId = (typeof EXPEDITION_ITEM_IDS)[number];

export interface ExpeditionLoadout {
    spiritGrain: number;
    pickaxe: number;
    lens: number;
}

export interface ExpeditionItemConfig {
    readonly id: ExpeditionItemId;
    readonly nameKey: string;
    readonly inventoryId: string | null;
    readonly weight: number;
}

export interface ExpeditionMapOption {
    readonly mapId: string;
    readonly mapNumber: number;
    readonly nameKey: string;
    readonly staminaCost: number;
    readonly grainPerStep: number;
    readonly minimumCarriedGrain: number;
    readonly unlockFlag: string | null;
}

export interface ExpeditionFoodConfig {
    readonly itemId: string;
    readonly nameKey: string;
    readonly weight: number;
    readonly grainRestored: number;
}

export interface ExpeditionFieldConfig {
    readonly restUseLimitsByForgeLevel: readonly number[];
    readonly grainDepletionStepLimit: number;
    readonly healingPercent: number;
    readonly defaultLootWeight: number;
    readonly foodItems: readonly ExpeditionFoodConfig[];
    readonly returnTalismanItemId: string;
    readonly returnTalismanNameKey: string;
}

export interface ExpeditionPreparationConfig {
    readonly staminaMax: number;
    readonly staminaRecoveryAmount: number;
    readonly staminaRecoveryIntervalSeconds: number;
    readonly baseBurden: number;
    readonly strengthBurdenFactor: number;
    readonly constitutionBurdenFactor: number;
    readonly maxPartyPresets: number;
    readonly partyUnlockCosts: readonly number[];
    readonly items: Readonly<Record<ExpeditionItemId, ExpeditionItemConfig>>;
    readonly maps: readonly ExpeditionMapOption[];
    readonly field: ExpeditionFieldConfig;
}

export interface ExpeditionHeroSnapshot {
    readonly instanceId: string;
    readonly isDead: boolean;
    readonly stamina: number;
    readonly attributes: Attributes;
}

export interface StaminaSettlement {
    readonly staminaByHero: Readonly<Record<string, number>>;
    readonly nextSettledAtUtc: number;
    readonly recovered: number;
    readonly changed: boolean;
}

export interface ExpeditionReadiness {
    readonly isReady: boolean;
    readonly problems: readonly string[];
}

type UnknownRecord = Record<string, unknown>;

function recordOf(value: unknown, path: string): UnknownRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} 应为对象`);
    return value as UnknownRecord;
}

function integerOf(value: unknown, path: string, minimum = 0): number {
    if (!Number.isSafeInteger(value) || (value as number) < minimum) {
        throw new Error(`${path} 应为不小于 ${minimum} 的安全整数`);
    }
    return value as number;
}

function stringOf(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${path} 应为非空字符串`);
    return value;
}

function nullableStringOf(value: unknown, path: string): string | null {
    return value === null ? null : stringOf(value, path);
}

function itemIdOf(value: unknown, path: string): ExpeditionItemId {
    if (!(EXPEDITION_ITEM_IDS as readonly unknown[]).includes(value)) {
        throw new Error(`${path} 不是合法的入山物品 ID`);
    }
    return value as ExpeditionItemId;
}

export function parseExpeditionPreparationConfig(value: unknown): ExpeditionPreparationConfig {
    const raw = recordOf(value, 'expedition_preparation');
    const maxPartyPresets = integerOf(raw.maxPartyPresets, 'maxPartyPresets', 1);
    if (maxPartyPresets > 9) throw new Error('maxPartyPresets 不得超过 9');
    if (!Array.isArray(raw.partyUnlockCosts)) throw new Error('partyUnlockCosts 应为数组');
    const partyUnlockCosts = raw.partyUnlockCosts.map((cost, index) => integerOf(cost, `partyUnlockCosts[${index}]`));
    if (partyUnlockCosts.length !== maxPartyPresets || partyUnlockCosts[0] !== 0) {
        throw new Error('partyUnlockCosts 数量须与 maxPartyPresets 一致，且第 1 队费用为 0');
    }
    if (!Array.isArray(raw.items)) throw new Error('items 应为数组');
    const items = {} as Record<ExpeditionItemId, ExpeditionItemConfig>;
    for (const [index, itemValue] of raw.items.entries()) {
        const item = recordOf(itemValue, `items[${index}]`);
        const id = itemIdOf(item.id, `items[${index}].id`);
        if (items[id]) throw new Error(`items 存在重复 ID: ${id}`);
        items[id] = {
            id,
            nameKey: stringOf(item.nameKey, `items[${index}].nameKey`),
            inventoryId: nullableStringOf(item.inventoryId, `items[${index}].inventoryId`),
            weight: integerOf(item.weight, `items[${index}].weight`, 1),
        };
    }
    for (const id of EXPEDITION_ITEM_IDS) if (!items[id]) throw new Error(`items 缺少 ${id}`);
    if (!Array.isArray(raw.maps) || raw.maps.length === 0) throw new Error('maps 应为非空数组');
    const mapIds = new Set<string>();
    const mapNumbers = new Set<number>();
    const maps = raw.maps.map((mapValue, index): ExpeditionMapOption => {
        const map = recordOf(mapValue, `maps[${index}]`);
        const mapId = stringOf(map.mapId, `maps[${index}].mapId`);
        const mapNumber = integerOf(map.mapNumber, `maps[${index}].mapNumber`, 1);
        if (mapIds.has(mapId) || mapNumbers.has(mapNumber)) {
            throw new Error(`maps 存在重复地图 ID 或编号: ${mapId}/${mapNumber}`);
        }
        mapIds.add(mapId);
        mapNumbers.add(mapNumber);
        return {
            mapId,
            mapNumber,
            nameKey: stringOf(map.nameKey, `maps[${index}].nameKey`),
            staminaCost: integerOf(map.staminaCost, `maps[${index}].staminaCost`, 1),
            grainPerStep: integerOf(map.grainPerStep, `maps[${index}].grainPerStep`, 1),
            minimumCarriedGrain: integerOf(map.minimumCarriedGrain, `maps[${index}].minimumCarriedGrain`, 1),
            unlockFlag: nullableStringOf(map.unlockFlag, `maps[${index}].unlockFlag`),
        };
    });
    const fieldRaw = recordOf(raw.field, 'field');
    if (!Array.isArray(fieldRaw.restUseLimitsByForgeLevel)
        || fieldRaw.restUseLimitsByForgeLevel.length === 0) {
        throw new Error('field.restUseLimitsByForgeLevel 应为非空数组');
    }
    const restUseLimitsByForgeLevel = fieldRaw.restUseLimitsByForgeLevel.map(
        (count, index) => integerOf(count, `field.restUseLimitsByForgeLevel[${index}]`, 1),
    );
    const healingPercent = integerOf(fieldRaw.healingPercent, 'field.healingPercent', 1);
    if (healingPercent > 100) throw new Error('field.healingPercent 不得超过 100');
    if (!Array.isArray(fieldRaw.foodItems) || fieldRaw.foodItems.length === 0) {
        throw new Error('field.foodItems 应为非空数组');
    }
    const foodIds = new Set<string>();
    const foodItems = fieldRaw.foodItems.map((foodValue, index): ExpeditionFoodConfig => {
        const food = recordOf(foodValue, `field.foodItems[${index}]`);
        const itemId = stringOf(food.itemId, `field.foodItems[${index}].itemId`);
        if (foodIds.has(itemId)) throw new Error(`field.foodItems 存在重复 ID: ${itemId}`);
        foodIds.add(itemId);
        return {
            itemId,
            nameKey: stringOf(food.nameKey, `field.foodItems[${index}].nameKey`),
            weight: integerOf(food.weight, `field.foodItems[${index}].weight`, 1),
            grainRestored: integerOf(food.grainRestored, `field.foodItems[${index}].grainRestored`, 1),
        };
    });
    return {
        staminaMax: integerOf(raw.staminaMax, 'staminaMax', 1),
        staminaRecoveryAmount: integerOf(raw.staminaRecoveryAmount, 'staminaRecoveryAmount', 1),
        staminaRecoveryIntervalSeconds: integerOf(raw.staminaRecoveryIntervalSeconds, 'staminaRecoveryIntervalSeconds', 1),
        baseBurden: integerOf(raw.baseBurden, 'baseBurden'),
        strengthBurdenFactor: integerOf(raw.strengthBurdenFactor, 'strengthBurdenFactor'),
        constitutionBurdenFactor: integerOf(raw.constitutionBurdenFactor, 'constitutionBurdenFactor'),
        maxPartyPresets,
        partyUnlockCosts,
        items,
        maps,
        field: {
            restUseLimitsByForgeLevel,
            grainDepletionStepLimit: integerOf(
                fieldRaw.grainDepletionStepLimit,
                'field.grainDepletionStepLimit',
                1,
            ),
            healingPercent,
            defaultLootWeight: integerOf(fieldRaw.defaultLootWeight, 'field.defaultLootWeight', 1),
            foodItems,
            returnTalismanItemId: stringOf(fieldRaw.returnTalismanItemId, 'field.returnTalismanItemId'),
            returnTalismanNameKey: stringOf(fieldRaw.returnTalismanNameKey, 'field.returnTalismanNameKey'),
        },
    };
}
