/**
 * 入山整备领域规则（PRD-04 §2、PRD-05 §6、PRD-09 §6.2）。
 *
 * 纯 TypeScript、无引擎依赖。负责灵息自然恢复、入山负重、携带物资与地图门槛；
 * 表现层只消费这里的计算结果，不得自行决定能否入山。
 */

import { MAX_PARTY_SIZE } from './CombatTypes';
import { membersOf } from './Party';
import type { PartySlots } from './Party';
import type { Attributes } from './Attributes';

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

export interface ExpeditionPreparationConfig {
    readonly staminaMax: number;
    readonly staminaRecoveryAmount: number;
    readonly staminaRecoveryIntervalSeconds: number;
    readonly baseBurden: number;
    readonly strengthBurdenFactor: number;
    readonly constitutionBurdenFactor: number;
    readonly maxPartyPresets: number;
    /** 索引即队伍编号减一；第 1 队必须为 0。 */
    readonly partyUnlockCosts: readonly number[];
    readonly items: Readonly<Record<ExpeditionItemId, ExpeditionItemConfig>>;
    readonly maps: readonly ExpeditionMapOption[];
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
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${path} 应为对象`);
    }
    return value as UnknownRecord;
}

function integerOf(value: unknown, path: string, minimum = 0): number {
    if (!Number.isSafeInteger(value) || (value as number) < minimum) {
        throw new Error(`${path} 应为不小于 ${minimum} 的安全整数`);
    }
    return value as number;
}

function stringOf(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${path} 应为非空字符串`);
    }
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

/** shared/expedition_preparation.json 的运行时收窄与交叉校验。 */
export function parseExpeditionPreparationConfig(value: unknown): ExpeditionPreparationConfig {
    const raw = recordOf(value, 'expedition_preparation');
    const maxPartyPresets = integerOf(raw.maxPartyPresets, 'maxPartyPresets', 1);
    if (maxPartyPresets > 9) {
        throw new Error('maxPartyPresets 不得超过 9');
    }

    if (!Array.isArray(raw.partyUnlockCosts)) {
        throw new Error('partyUnlockCosts 应为数组');
    }
    const partyUnlockCosts = raw.partyUnlockCosts.map((cost, index) =>
        integerOf(cost, `partyUnlockCosts[${index}]`),
    );
    if (partyUnlockCosts.length !== maxPartyPresets || partyUnlockCosts[0] !== 0) {
        throw new Error('partyUnlockCosts 数量须与 maxPartyPresets 一致，且第 1 队费用为 0');
    }

    if (!Array.isArray(raw.items)) {
        throw new Error('items 应为数组');
    }
    const items = {} as Record<ExpeditionItemId, ExpeditionItemConfig>;
    for (const [index, valueOfItem] of raw.items.entries()) {
        const item = recordOf(valueOfItem, `items[${index}]`);
        const id = itemIdOf(item.id, `items[${index}].id`);
        if (items[id]) {
            throw new Error(`items 存在重复 ID: ${id}`);
        }
        items[id] = {
            id,
            nameKey: stringOf(item.nameKey, `items[${index}].nameKey`),
            inventoryId: nullableStringOf(
                item.inventoryId,
                `items[${index}].inventoryId`,
            ),
            weight: integerOf(item.weight, `items[${index}].weight`, 1),
        };
    }
    for (const id of EXPEDITION_ITEM_IDS) {
        if (!items[id]) {
            throw new Error(`items 缺少 ${id}`);
        }
    }

    if (!Array.isArray(raw.maps) || raw.maps.length === 0) {
        throw new Error('maps 应为非空数组');
    }
    const mapIds = new Set<string>();
    const mapNumbers = new Set<number>();
    const maps = raw.maps.map((valueOfMap, index): ExpeditionMapOption => {
        const map = recordOf(valueOfMap, `maps[${index}]`);
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
            minimumCarriedGrain: integerOf(
                map.minimumCarriedGrain,
                `maps[${index}].minimumCarriedGrain`,
                1,
            ),
            unlockFlag: nullableStringOf(map.unlockFlag, `maps[${index}].unlockFlag`),
        };
    });

    return {
        staminaMax: integerOf(raw.staminaMax, 'staminaMax', 1),
        staminaRecoveryAmount: integerOf(
            raw.staminaRecoveryAmount,
            'staminaRecoveryAmount',
            1,
        ),
        staminaRecoveryIntervalSeconds: integerOf(
            raw.staminaRecoveryIntervalSeconds,
            'staminaRecoveryIntervalSeconds',
            1,
        ),
        baseBurden: integerOf(raw.baseBurden, 'baseBurden'),
        strengthBurdenFactor: integerOf(
            raw.strengthBurdenFactor,
            'strengthBurdenFactor',
        ),
        constitutionBurdenFactor: integerOf(
            raw.constitutionBurdenFactor,
            'constitutionBurdenFactor',
        ),
        maxPartyPresets,
        partyUnlockCosts,
        items,
        maps,
    };
}

export function createEmptyLoadout(): ExpeditionLoadout {
    return { spiritGrain: 0, pickaxe: 0, lens: 0 };
}

export function loadoutWeight(
    loadout: Readonly<ExpeditionLoadout>,
    config: ExpeditionPreparationConfig,
): number {
    return EXPEDITION_ITEM_IDS.reduce(
        (sum, id) => sum + loadout[id] * config.items[id].weight,
        0,
    );
}

/** 力道、肉身与配置系数共同决定队伍负重上限。 */
export function partyBurdenLimit(
    slots: PartySlots,
    heroes: readonly ExpeditionHeroSnapshot[],
    config: ExpeditionPreparationConfig,
): number {
    const selected = new Set(membersOf(slots));
    let strength = 0;
    let constitution = 0;
    for (const hero of heroes) {
        if (!selected.has(hero.instanceId)) {
            continue;
        }
        strength += hero.attributes.strength;
        constitution += hero.attributes.constitution;
    }
    return config.baseBurden +
        strength * config.strengthBurdenFactor +
        constitution * config.constitutionBurdenFactor;
}

/**
 * 在营地按完整周期恢复灵息；禁地内完全暂停。
 * 返回新值而不修改入参，便于存档层原子应用。
 */
export function settleNaturalStamina(input: {
    readonly heroes: readonly Pick<ExpeditionHeroSnapshot, 'instanceId' | 'stamina'>[];
    readonly lastSettledAtUtc: number;
    readonly nowUtcSeconds: number;
    readonly isInExpedition: boolean;
    readonly config: ExpeditionPreparationConfig;
}): StaminaSettlement {
    const current = Object.fromEntries(
        input.heroes.map((hero) => [hero.instanceId, hero.stamina]),
    );
    if (input.isInExpedition || input.nowUtcSeconds <= input.lastSettledAtUtc) {
        return {
            staminaByHero: current,
            nextSettledAtUtc: input.lastSettledAtUtc,
            recovered: 0,
            changed: false,
        };
    }

    const interval = input.config.staminaRecoveryIntervalSeconds;
    const cycles = Math.floor((input.nowUtcSeconds - input.lastSettledAtUtc) / interval);
    if (cycles <= 0) {
        return {
            staminaByHero: current,
            nextSettledAtUtc: input.lastSettledAtUtc,
            recovered: 0,
            changed: false,
        };
    }

    const staminaByHero: Record<string, number> = {};
    let recovered = 0;
    for (const hero of input.heroes) {
        const next = Math.min(
            input.config.staminaMax,
            hero.stamina + cycles * input.config.staminaRecoveryAmount,
        );
        staminaByHero[hero.instanceId] = next;
        recovered += next - hero.stamina;
    }
    return {
        staminaByHero,
        nextSettledAtUtc: input.lastSettledAtUtc + cycles * interval,
        recovered,
        changed: true,
    };
}

/** 地图项目点击前一次列出全部阻断原因。 */
export function validateExpeditionReadiness(input: {
    readonly slots: PartySlots;
    readonly heroes: readonly ExpeditionHeroSnapshot[];
    readonly loadout: Readonly<ExpeditionLoadout>;
    readonly map: ExpeditionMapOption;
    readonly config: ExpeditionPreparationConfig;
}): ExpeditionReadiness {
    const problems: string[] = [];
    if (input.slots.length !== MAX_PARTY_SIZE) {
        problems.push(`队伍槽位数应为 ${MAX_PARTY_SIZE}`);
    }
    const memberIds = membersOf(input.slots);
    if (memberIds.length === 0) {
        problems.push('至少选择 1 名存活修士');
    }
    const seen = new Set<string>();
    for (const id of memberIds) {
        if (seen.has(id)) {
            problems.push(`修士 ${id} 重复上阵`);
            continue;
        }
        seen.add(id);
        const hero = input.heroes.find((candidate) => candidate.instanceId === id);
        if (!hero) {
            problems.push(`修士 ${id} 不存在`);
        } else if (hero.isDead) {
            problems.push(`修士 ${id} 已阵亡`);
        } else if (hero.stamina < input.map.staminaCost) {
            problems.push(`有修士灵息不足（需要 ${input.map.staminaCost}）`);
        }
    }
    if (input.loadout.spiritGrain < input.map.minimumCarriedGrain) {
        problems.push(`至少携带 ${input.map.minimumCarriedGrain} 灵粮`);
    }
    const burden = loadoutWeight(input.loadout, input.config);
    const limit = partyBurdenLimit(input.slots, input.heroes, input.config);
    if (burden > limit) {
        problems.push(`负重超限（${burden}/${limit}）`);
    }
    return { isReady: problems.length === 0, problems };
}
