import { ATTRIBUTE_KEYS } from 'db://assets/scripts/domain/Attributes';
import type { Attributes, MutableAttributes } from 'db://assets/scripts/domain/Attributes';
import {
    MAX_LEVEL,
    REALM_IDS,
    SPIRITUAL_ROOT_IDS,
    realmIdOf,
} from 'db://assets/scripts/domain/HeroGrowth';
import type {
    RealmId,
    SpiritualRootId,
} from 'db://assets/scripts/domain/HeroGrowth';
import { GridCoord } from 'db://assets/scripts/domain/GridCoord';
import { EXPEDITION_ITEM_IDS } from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { ExpeditionLoadout } from 'db://assets/scripts/domain/ExpeditionPreparation';
import { validatePresets } from 'db://assets/scripts/domain/Party';
import type { PartyPreset, PartySlots } from 'db://assets/scripts/domain/Party';
import type {
    CampState,
    ExpeditionPreparationState,
    ExpeditionState,
    HeroInstance,
    Profile,
    Wallet,
} from 'db://assets/scripts/services/GameState';
import {
    booleanOf,
    booleanRecordOf,
    integerOf,
    numberRecordOf,
    recordOf,
    stringArrayOf,
    stringOf,
} from './ProfileValueReaders';

const WALLET_KEYS = [
    'spiritGrain', 'spiritWood', 'darkIron', 'spiritStone', 'gengJing',
    'soulCrystal', 'immortalCoin',
] as const satisfies readonly (keyof Wallet)[];

function walletOf(value: unknown): Wallet {
    const raw = recordOf(value, 'profile.wallet');
    const wallet = {} as Wallet;
    for (const key of WALLET_KEYS) {
        wallet[key] = integerOf(raw[key], `profile.wallet.${key}`);
    }
    return wallet;
}

function attributesOf(value: unknown, path: string): Attributes {
    const raw = recordOf(value, path);
    const result = {} as MutableAttributes;
    for (const key of ATTRIBUTE_KEYS) {
        result[key] = integerOf(raw[key], `${path}.${key}`);
    }
    return result;
}

function spiritualRootIdOf(value: unknown, path: string): SpiritualRootId {
    if (!(SPIRITUAL_ROOT_IDS as readonly unknown[]).includes(value)) {
        throw new Error(`${path} 不是合法灵根资质`);
    }
    return value as SpiritualRootId;
}

function persistedRealmIdOf(value: unknown, path: string): RealmId {
    if (!(REALM_IDS as readonly unknown[]).includes(value)) {
        throw new Error(`${path} 不是合法境界`);
    }
    return value as RealmId;
}

function heroOf(value: unknown, index: number): HeroInstance {
    const path = `profile.roster[${index}]`;
    const raw = recordOf(value, path);
    const maxHp = integerOf(raw.maxHp, `${path}.maxHp`, 1);
    const currentHp = integerOf(raw.currentHp, `${path}.currentHp`);
    if (currentHp > maxHp) throw new Error(`${path}.currentHp 不得超过 maxHp`);
    const skillIds = stringArrayOf(raw.skillIds, `${path}.skillIds`);
    if (skillIds.length !== 3) throw new Error(`${path}.skillIds 必须恰好包含 3 个技能`);
    const stamina = integerOf(raw.stamina, `${path}.stamina`);
    if (stamina > 100) throw new Error(`${path}.stamina 不得超过 100`);
    const level = integerOf(raw.level, `${path}.level`, 1);
    if (level > MAX_LEVEL) throw new Error(`${path}.level 不得超过当前上限 ${MAX_LEVEL}`);
    const realmId = persistedRealmIdOf(raw.realmId, `${path}.realmId`);
    const expectedRealmId = realmIdOf(level);
    if (realmId !== expectedRealmId) {
        throw new Error(`${path}.realmId ${realmId} 与等级 ${level} 不一致，应为 ${expectedRealmId}`);
    }
    return {
        instanceId: stringOf(raw.instanceId, `${path}.instanceId`),
        definitionId: stringOf(raw.definitionId, `${path}.definitionId`),
        nameKey: stringOf(raw.nameKey, `${path}.nameKey`),
        careerId: stringOf(raw.careerId, `${path}.careerId`),
        spiritualRootId: spiritualRootIdOf(
            raw.spiritualRootId,
            `${path}.spiritualRootId`,
        ),
        realmId,
        level,
        attributes: attributesOf(raw.attributes, `${path}.attributes`),
        maxHp,
        currentHp,
        skillIds,
        isDead: booleanOf(raw.isDead, `${path}.isDead`),
        stamina,
    };
}

function rosterOf(value: unknown): HeroInstance[] {
    if (!Array.isArray(value)) throw new Error('profile.roster 应为数组');
    const roster = value.map((hero, index) => heroOf(hero, index));
    const ids = new Set<string>();
    for (const hero of roster) {
        if (ids.has(hero.instanceId)) throw new Error(`profile.roster 存在重复修士 ${hero.instanceId}`);
        ids.add(hero.instanceId);
    }
    return roster;
}

function campOf(value: unknown, defaultSettledAtUtc?: number): CampState {
    const raw = recordOf(value, 'profile.camp');
    const workerAssignments = numberRecordOf(raw.workerAssignments, 'profile.camp.workerAssignments');
    const workerCount = integerOf(raw.workerCount, 'profile.camp.workerCount');
    const assignedCount = Object.values(workerAssignments).reduce((sum, count) => sum + count, 0);
    if (assignedCount > workerCount) {
        throw new Error(`profile.camp 已分配杂役 ${assignedCount} 超过总数 ${workerCount}`);
    }
    return {
        buildingLevels: numberRecordOf(raw.buildingLevels, 'profile.camp.buildingLevels'),
        workerCount,
        workerAssignments,
        resourceStorageLevels: numberRecordOf(raw.resourceStorageLevels, 'profile.camp.resourceStorageLevels'),
        lastSettledAtUtc: defaultSettledAtUtc ?? integerOf(raw.lastSettledAtUtc, 'profile.camp.lastSettledAtUtc'),
    };
}

function expeditionOf(value: unknown): ExpeditionState | null {
    if (value === null) return null;
    const raw = recordOf(value, 'profile.expedition');
    const position = recordOf(raw.position, 'profile.expedition.position');
    return {
        mapId: stringOf(raw.mapId, 'profile.expedition.mapId'),
        position: new GridCoord(
            integerOf(position.x, 'profile.expedition.position.x'),
            integerOf(position.y, 'profile.expedition.position.y'),
        ),
        remainingGrain: integerOf(raw.remainingGrain, 'profile.expedition.remainingGrain'),
        revealedTiles: new Set(stringArrayOf(raw.revealedTiles, 'profile.expedition.revealedTiles')),
        temporaryLoot: numberRecordOf(raw.temporaryLoot, 'profile.expedition.temporaryLoot'),
    };
}

function partySlotsOf(value: unknown, path: string): PartySlots {
    if (!Array.isArray(value) || value.length !== 4) throw new Error(`${path} 必须恰好包含 4 个槽位`);
    return value.map((item, index) => item === null ? null : stringOf(item, `${path}[${index}]`));
}

function partyPresetsOf(value: unknown): PartyPreset[] {
    if (!Array.isArray(value)) throw new Error('profile.expeditionPreparation.partyPresets 应为数组');
    const presets = value.map((entry, index): PartyPreset => {
        const path = `profile.expeditionPreparation.partyPresets[${index}]`;
        const raw = recordOf(entry, path);
        return {
            presetId: stringOf(raw.presetId, `${path}.presetId`),
            name: stringOf(raw.name, `${path}.name`),
            slots: partySlotsOf(raw.slots, `${path}.slots`),
        };
    });
    const validation = validatePresets(presets);
    if (!validation.isValid) throw new Error(validation.problems.join('；'));
    return presets;
}

function loadoutOf(value: unknown): ExpeditionLoadout {
    const raw = recordOf(value, 'profile.expeditionPreparation.loadout');
    const result = {} as ExpeditionLoadout;
    for (const id of EXPEDITION_ITEM_IDS) {
        result[id] = integerOf(raw[id], `profile.expeditionPreparation.loadout.${id}`);
    }
    return result;
}

function expeditionPreparationOf(value: unknown, defaultSettledAtUtc?: number): ExpeditionPreparationState {
    const raw = recordOf(value, 'profile.expeditionPreparation');
    const partyPresets = partyPresetsOf(raw.partyPresets);
    const activePresetId = stringOf(raw.activePresetId, 'profile.expeditionPreparation.activePresetId');
    if (!partyPresets.some((preset) => preset.presetId === activePresetId)) {
        throw new Error(`当前队伍 ${activePresetId} 不在已解锁队伍中`);
    }
    return {
        partyPresets,
        activePresetId,
        loadout: loadoutOf(raw.loadout),
        lastStaminaSettledAtUtc: defaultSettledAtUtc
            ?? integerOf(raw.lastStaminaSettledAtUtc, 'profile.expeditionPreparation.lastStaminaSettledAtUtc'),
    };
}

function validatePartyAssignments(roster: readonly HeroInstance[], preparation: ExpeditionPreparationState): void {
    const heroes = new Map(roster.map((hero) => [hero.instanceId, hero]));
    const occupiedBy = new Map<string, string>();
    for (const preset of preparation.partyPresets) {
        const seenInPreset = new Set<string>();
        for (const heroId of preset.slots) {
            if (heroId === null) continue;
            const hero = heroes.get(heroId);
            if (!hero) throw new Error(`队伍 ${preset.presetId} 引用了不存在的修士 ${heroId}`);
            if (hero.isDead) throw new Error(`队伍 ${preset.presetId} 包含已阵亡修士 ${heroId}`);
            if (seenInPreset.has(heroId)) throw new Error(`队伍 ${preset.presetId} 重复上阵修士 ${heroId}`);
            seenInPreset.add(heroId);
            const otherPresetId = occupiedBy.get(heroId);
            if (otherPresetId) throw new Error(`修士 ${heroId} 同时出现在 ${otherPresetId} 与 ${preset.presetId}`);
            occupiedBy.set(heroId, preset.presetId);
        }
    }
}

export function parseProfile(value: unknown, defaultSettledAtUtc?: number): Profile {
    const raw = recordOf(value, 'profile');
    const roster = rosterOf(raw.roster);
    const expeditionPreparation = expeditionPreparationOf(raw.expeditionPreparation, defaultSettledAtUtc);
    validatePartyAssignments(roster, expeditionPreparation);
    return {
        wallet: walletOf(raw.wallet),
        camp: campOf(raw.camp, defaultSettledAtUtc),
        roster,
        inventory: numberRecordOf(raw.inventory, 'profile.inventory'),
        storyFlags: booleanRecordOf(raw.storyFlags, 'profile.storyFlags'),
        completedMapObjects: booleanRecordOf(
            raw.completedMapObjects,
            'profile.completedMapObjects',
        ),
        expeditionPreparation,
        expedition: expeditionOf(raw.expedition),
    };
}
