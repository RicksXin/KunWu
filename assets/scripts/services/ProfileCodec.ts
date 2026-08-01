/**
 * Profile 的新档创建、运行时还原与存档序列化（技术方案 §5、§13）。
 *
 * SaveRepository 只保证 Envelope、校验和与迁移正确，不理解业务字段；
 * 本模块负责把 unknown payload 收窄成可安全交给 GameState 的 Profile。
 * 这样坏档不会在资源栏里悄悄变成 undefined/NaN。
 */

import { ATTRIBUTE_KEYS } from '../domain/Attributes';
import type { Attributes, MutableAttributes } from '../domain/Attributes';
import { HERO_GRADES } from '../domain/HeroGrowth';
import type { HeroGrade } from '../domain/HeroGrowth';
import { GridCoord } from '../domain/GridCoord';
import { migratedWorkerCount } from '../domain/LingPu';
import { EXPEDITION_ITEM_IDS } from '../domain/ExpeditionPreparation';
import type { ExpeditionLoadout } from '../domain/ExpeditionPreparation';
import { validatePresets } from '../domain/Party';
import type { PartyPreset, PartySlots } from '../domain/Party';
import type {
    CampState,
    ExpeditionPreparationState,
    ExpeditionState,
    HeroInstance,
    Profile,
    Wallet,
} from './GameState';

type UnknownRecord = Record<string, unknown>;

const WALLET_KEYS = [
    'spiritGrain',
    'spiritWood',
    'darkIron',
    'spiritStone',
    'gengJing',
    'soulCrystal',
    'immortalCoin',
] as const satisfies readonly (keyof Wallet)[];

function recordOf(value: unknown, path: string): UnknownRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${path} 应为对象`);
    }
    return value as UnknownRecord;
}

function stringOf(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${path} 应为非空字符串`);
    }
    return value;
}

function booleanOf(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') {
        throw new Error(`${path} 应为布尔值`);
    }
    return value;
}

function integerOf(value: unknown, path: string, minimum = 0): number {
    if (!Number.isSafeInteger(value) || (value as number) < minimum) {
        throw new Error(`${path} 应为不小于 ${minimum} 的安全整数`);
    }
    return value as number;
}

function numberRecordOf(value: unknown, path: string): Record<string, number> {
    const raw = recordOf(value, path);
    const result: Record<string, number> = {};
    for (const [key, item] of Object.entries(raw)) {
        result[key] = integerOf(item, `${path}.${key}`);
    }
    return result;
}

function booleanRecordOf(value: unknown, path: string): Record<string, boolean> {
    const raw = recordOf(value, path);
    const result: Record<string, boolean> = {};
    for (const [key, item] of Object.entries(raw)) {
        result[key] = booleanOf(item, `${path}.${key}`);
    }
    return result;
}

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

function gradeOf(value: unknown, path: string): HeroGrade {
    if (!(HERO_GRADES as readonly unknown[]).includes(value)) {
        throw new Error(`${path} 不是合法品级`);
    }
    return value as HeroGrade;
}

function stringArrayOf(value: unknown, path: string): readonly string[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} 应为数组`);
    }
    return value.map((item, index) => stringOf(item, `${path}[${index}]`));
}

function heroOf(value: unknown, index: number): HeroInstance {
    const path = `profile.roster[${index}]`;
    const raw = recordOf(value, path);
    const maxHp = integerOf(raw.maxHp, `${path}.maxHp`, 1);
    const currentHp = integerOf(raw.currentHp, `${path}.currentHp`);
    if (currentHp > maxHp) {
        throw new Error(`${path}.currentHp 不得超过 maxHp`);
    }

    const skillIds = stringArrayOf(raw.skillIds, `${path}.skillIds`);
    if (skillIds.length !== 3) {
        throw new Error(`${path}.skillIds 必须恰好包含 3 个技能`);
    }

    const stamina = integerOf(raw.stamina, `${path}.stamina`);
    if (stamina > 100) {
        throw new Error(`${path}.stamina 不得超过 100`);
    }

    return {
        instanceId: stringOf(raw.instanceId, `${path}.instanceId`),
        definitionId: stringOf(raw.definitionId, `${path}.definitionId`),
        nameKey: stringOf(raw.nameKey, `${path}.nameKey`),
        careerId: stringOf(raw.careerId, `${path}.careerId`),
        grade: gradeOf(raw.grade, `${path}.grade`),
        level: integerOf(raw.level, `${path}.level`, 1),
        attributes: attributesOf(raw.attributes, `${path}.attributes`),
        maxHp,
        currentHp,
        skillIds,
        isDead: booleanOf(raw.isDead, `${path}.isDead`),
        stamina,
    };
}

function rosterOf(value: unknown): HeroInstance[] {
    if (!Array.isArray(value)) {
        throw new Error('profile.roster 应为数组');
    }
    const roster = value.map((hero, index) => heroOf(hero, index));
    const ids = new Set<string>();
    for (const hero of roster) {
        if (ids.has(hero.instanceId)) {
            throw new Error(`profile.roster 存在重复修士 ${hero.instanceId}`);
        }
        ids.add(hero.instanceId);
    }
    return roster;
}

function campOf(value: unknown, defaultSettledAtUtc?: number): CampState {
    const raw = recordOf(value, 'profile.camp');
    const storedTimestamp = raw.lastSettledAtUtc;
    const workerAssignments = numberRecordOf(
        raw.workerAssignments,
        'profile.camp.workerAssignments',
    );
    const workerCount = integerOf(raw.workerCount, 'profile.camp.workerCount');
    const assignedCount = Object.values(workerAssignments).reduce(
        (sum, count) => sum + count,
        0,
    );
    if (assignedCount > workerCount) {
        throw new Error(
            `profile.camp 已分配杂役 ${assignedCount} 超过总数 ${workerCount}`,
        );
    }
    return {
        buildingLevels: numberRecordOf(raw.buildingLevels, 'profile.camp.buildingLevels'),
        workerCount,
        workerAssignments,
        resourceStorageLevels: numberRecordOf(
            raw.resourceStorageLevels,
            'profile.camp.resourceStorageLevels',
        ),
        lastSettledAtUtc:
            defaultSettledAtUtc ??
            integerOf(storedTimestamp, 'profile.camp.lastSettledAtUtc'),
    };
}

function expeditionOf(value: unknown): ExpeditionState | null {
    if (value === null) {
        return null;
    }
    const raw = recordOf(value, 'profile.expedition');
    const position = recordOf(raw.position, 'profile.expedition.position');
    const revealed = stringArrayOf(raw.revealedTiles, 'profile.expedition.revealedTiles');
    return {
        mapId: stringOf(raw.mapId, 'profile.expedition.mapId'),
        position: new GridCoord(
            integerOf(position.x, 'profile.expedition.position.x'),
            integerOf(position.y, 'profile.expedition.position.y'),
        ),
        remainingGrain: integerOf(
            raw.remainingGrain,
            'profile.expedition.remainingGrain',
        ),
        revealedTiles: new Set(revealed),
        temporaryLoot: numberRecordOf(
            raw.temporaryLoot,
            'profile.expedition.temporaryLoot',
        ),
    };
}

function partySlotsOf(value: unknown, path: string): PartySlots {
    if (!Array.isArray(value) || value.length !== 4) {
        throw new Error(`${path} 必须恰好包含 4 个槽位`);
    }
    return value.map((item, index) => {
        if (item === null) {
            return null;
        }
        return stringOf(item, `${path}[${index}]`);
    });
}

function partyPresetsOf(value: unknown): PartyPreset[] {
    if (!Array.isArray(value)) {
        throw new Error('profile.expeditionPreparation.partyPresets 应为数组');
    }
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
    if (!validation.isValid) {
        throw new Error(validation.problems.join('；'));
    }
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

function expeditionPreparationOf(
    value: unknown,
    defaultSettledAtUtc?: number,
): ExpeditionPreparationState {
    const raw = recordOf(value, 'profile.expeditionPreparation');
    const partyPresets = partyPresetsOf(raw.partyPresets);
    const activePresetId = stringOf(
        raw.activePresetId,
        'profile.expeditionPreparation.activePresetId',
    );
    if (!partyPresets.some((preset) => preset.presetId === activePresetId)) {
        throw new Error(`当前队伍 ${activePresetId} 不在已解锁队伍中`);
    }
    return {
        partyPresets,
        activePresetId,
        loadout: loadoutOf(raw.loadout),
        lastStaminaSettledAtUtc:
            defaultSettledAtUtc ??
            integerOf(
                raw.lastStaminaSettledAtUtc,
                'profile.expeditionPreparation.lastStaminaSettledAtUtc',
            ),
    };
}

function validatePartyAssignments(
    roster: readonly HeroInstance[],
    preparation: ExpeditionPreparationState,
): void {
    const heroes = new Map(roster.map((hero) => [hero.instanceId, hero]));
    const occupiedBy = new Map<string, string>();
    for (const preset of preparation.partyPresets) {
        const seenInPreset = new Set<string>();
        for (const heroId of preset.slots) {
            if (heroId === null) {
                continue;
            }
            const hero = heroes.get(heroId);
            if (!hero) {
                throw new Error(`队伍 ${preset.presetId} 引用了不存在的修士 ${heroId}`);
            }
            if (hero.isDead) {
                throw new Error(`队伍 ${preset.presetId} 包含已阵亡修士 ${heroId}`);
            }
            if (seenInPreset.has(heroId)) {
                throw new Error(`队伍 ${preset.presetId} 重复上阵修士 ${heroId}`);
            }
            seenInPreset.add(heroId);
            const otherPresetId = occupiedBy.get(heroId);
            if (otherPresetId) {
                throw new Error(`修士 ${heroId} 同时出现在 ${otherPresetId} 与 ${preset.presetId}`);
            }
            occupiedBy.set(heroId, preset.presetId);
        }
    }
}

function parseProfile(value: unknown, defaultSettledAtUtc?: number): Profile {
    const raw = recordOf(value, 'profile');
    const roster = rosterOf(raw.roster);
    const expeditionPreparation = expeditionPreparationOf(
        raw.expeditionPreparation,
        defaultSettledAtUtc,
    );
    validatePartyAssignments(roster, expeditionPreparation);
    return {
        wallet: walletOf(raw.wallet),
        camp: campOf(raw.camp, defaultSettledAtUtc),
        roster,
        inventory: numberRecordOf(raw.inventory, 'profile.inventory'),
        storyFlags: booleanRecordOf(raw.storyFlags, 'profile.storyFlags'),
        expeditionPreparation,
        expedition: expeditionOf(raw.expedition),
    };
}

/** 从 shared Bundle 的新档数据种子创建独立 Profile。 */
export function createDefaultProfile(seed: unknown, nowUtcSeconds: number): Profile {
    const raw = recordOf(seed, 'profile');
    if (!Array.isArray(raw.roster) || raw.roster.length !== 4) {
        const count = Array.isArray(raw.roster) ? raw.roster.length : 0;
        throw new Error(`新档必须恰好包含 4 名初始修士，实际 ${count}`);
    }
    const profile = parseProfile(seed, integerOf(nowUtcSeconds, 'nowUtcSeconds'));
    return profile;
}

/** 把 SaveEnvelope.payload 恢复为运行时 Profile。 */
export function deserializeProfile(payload: unknown): Profile {
    return parseProfile(payload);
}

/**
 * 把运行时 Profile 转成纯 JSON 数据。
 * Set 与 GridCoord 不能直接交给 JSON.stringify，故在这里显式展开。
 */
export function serializeProfile(profile: Profile): Record<string, unknown> {
    const expedition = profile.expedition;
    return {
        wallet: { ...profile.wallet },
        camp: {
            buildingLevels: { ...profile.camp.buildingLevels },
            workerCount: profile.camp.workerCount,
            workerAssignments: { ...profile.camp.workerAssignments },
            resourceStorageLevels: { ...profile.camp.resourceStorageLevels },
            lastSettledAtUtc: profile.camp.lastSettledAtUtc,
        },
        roster: profile.roster.map((hero) => ({
            ...hero,
            attributes: { ...hero.attributes },
            skillIds: [...hero.skillIds],
        })),
        inventory: { ...profile.inventory },
        storyFlags: { ...profile.storyFlags },
        expeditionPreparation: {
            partyPresets: profile.expeditionPreparation.partyPresets.map((preset) => ({
                presetId: preset.presetId,
                name: preset.name,
                slots: [...preset.slots],
            })),
            activePresetId: profile.expeditionPreparation.activePresetId,
            loadout: { ...profile.expeditionPreparation.loadout },
            lastStaminaSettledAtUtc:
                profile.expeditionPreparation.lastStaminaSettledAtUtc,
        },
        expedition: expedition
            ? {
                  mapId: expedition.mapId,
                  position: { x: expedition.position.x, y: expedition.position.y },
                  remainingGrain: expedition.remainingGrain,
                  revealedTiles: Array.from(expedition.revealedTiles).sort(),
                  temporaryLoot: { ...expedition.temporaryLoot },
              }
            : null,
    };
}

/**
 * v1 → v2：补充杂役总数和三种基础资源的独立存储等级。
 * 6 人与 1 级是 v2 发布时的历史迁移口径；后续平衡表调整不得回改此迁移。
 */
export function migrateProfileV1ToV2(
    payload: Record<string, unknown>,
): Record<string, unknown> {
    const profile = recordOf(payload, 'profile');
    const camp = recordOf(profile.camp, 'profile.camp');
    const assignments = camp.workerAssignments && typeof camp.workerAssignments === 'object'
        ? (camp.workerAssignments as Record<string, number>)
        : {};
    return {
        ...profile,
        camp: {
            ...camp,
            workerCount:
                camp.workerCount ?? migratedWorkerCount(assignments, 6),
            resourceStorageLevels: camp.resourceStorageLevels ?? {
                spiritGrain: 1,
                spiritWood: 1,
                darkIron: 1,
            },
        },
    };
}

/**
 * v3 发布时的成长曲线快照（Docs/13_数值设计方案.md §3）。
 *
 * **刻意内联而非引用运行时表**：迁移必须对同一份旧档在任何版本都产出相同结果。
 * 若引用运行时的 balance 表，v4 调整数值后，同一个 v2 旧档在 v4 迁出的面板
 * 会与在 v3 迁出的不同——玩家换个版本读档，角色属性就变了。
 * 沿用 migrateProfileV1ToV2 的同一条纪律：后续平衡表调整不得回改这些常量。
 */
const V3_BASE_PERCENT: Readonly<Record<HeroGrade, number>> = {
    D: 100,
    C: 108,
    B: 116,
    A: 124,
    S: 133,
    SS: 142,
    SSS: 152,
};

const V3_GROWTH_PERCENT: Readonly<Record<HeroGrade, number>> = {
    D: 100,
    C: 110,
    B: 122,
    A: 136,
    S: 152,
    SS: 170,
    SSS: 190,
};

/** 千分位，与 balance/growth_rates.json 在 v3 时刻一致。 */
const V3_GROWTH_RATES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
    ti_xiu: { strength: 800, magic: 200, technique: 300, speed: 300, constitution: 3000, armor: 3000, resistance: 800 },
    wu_xiu: { strength: 3000, magic: 200, technique: 600, speed: 600, constitution: 2000, armor: 1200, resistance: 600 },
    qian_xiu: { strength: 800, magic: 200, technique: 3000, speed: 1200, constitution: 800, armor: 600, resistance: 600 },
    fa_xiu: { strength: 200, magic: 3000, technique: 2000, speed: 400, constitution: 800, armor: 600, resistance: 1200 },
    yi_xiu: { strength: 200, magic: 3000, technique: 800, speed: 400, constitution: 800, armor: 600, resistance: 2000 },
    fu_xiu: { strength: 200, magic: 2000, technique: 3000, speed: 400, constitution: 800, armor: 600, resistance: 1200 },
};

/** v3 时刻的职业初始七维与基础生命，同样是快照。 */
const V3_CAREER_BASE: Readonly<
    Record<string, { readonly attrs: Readonly<Record<string, number>>; readonly hp: number }>
> = {
    ti_xiu: { attrs: { strength: 12, magic: 3, technique: 6, speed: 7, constitution: 16, armor: 13, resistance: 8 }, hp: 140 },
    wu_xiu: { attrs: { strength: 14, magic: 4, technique: 7, speed: 8, constitution: 13, armor: 11, resistance: 6 }, hp: 120 },
    qian_xiu: { attrs: { strength: 10, magic: 5, technique: 14, speed: 14, constitution: 8, armor: 6, resistance: 6 }, hp: 96 },
    fa_xiu: { attrs: { strength: 4, magic: 15, technique: 10, speed: 8, constitution: 7, armor: 4, resistance: 11 }, hp: 84 },
    yi_xiu: { attrs: { strength: 4, magic: 13, technique: 11, speed: 9, constitution: 8, armor: 5, resistance: 12 }, hp: 92 },
    fu_xiu: { attrs: { strength: 5, magic: 11, technique: 15, speed: 9, constitution: 8, armor: 5, resistance: 10 }, hp: 90 },
};

/** v3 时刻的生命系数，对应 combat_constants.json 的 constitutionHpFactor。 */
const V3_CONSTITUTION_HP_FACTOR = 8;

/** 千分位基数，与 HeroGrowth.GROWTH_RATE_SCALE 在 v3 时刻一致。 */
const V3_GROWTH_RATE_SCALE = 1000;

/**
 * v2 → v3：按新成长曲线重算 roster 的 attributes 与 maxHp。
 *
 * 为何必须迁移：`heroOf` 把 `attributes` 与 `maxHp` 当**存档字段**读入，
 * 不是每次从数据表重算的派生值。Docs/13 §3 把七维从「只长 2 维」改为全维成长、
 * 品级从「只影响成长」改为同时影响初始值，旧档若原样读入会：
 *   1. 带着旧曲线的面板进入新版本，与同等级新角色数值不一致；
 *   2. 当新 maxHp 低于旧值时，撞上 heroOf 的 currentHp > maxHp 校验被直接拒绝读档。
 *
 * currentHp 取 min(旧值, 新 maxHp) 而非按比例缩放：按比例会让玩家看到「读档掉血」，
 * 而那看起来像 bug；钳制则只在确实超限时生效，多数情况下血量原样保留。
 *
 * 职业不在快照内时（例如未来新增职业的存档回滚到 v3）保留原值：
 * 此时无法重算，抹成 0 会毁掉角色，保留旧面板至少可玩。
 */
export function migrateProfileV2ToV3(
    payload: Record<string, unknown>,
): Record<string, unknown> {
    const profile = recordOf(payload, 'profile');
    if (!Array.isArray(profile.roster)) {
        // roster 结构非法交给 heroOf 报错，迁移不做兜底判断
        return { ...profile };
    }

    const roster = profile.roster.map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return entry;
        }
        const hero = entry as UnknownRecord;
        const careerId = typeof hero.careerId === 'string' ? hero.careerId : '';
        const grade = hero.grade as HeroGrade;
        const level = typeof hero.level === 'number' ? hero.level : 1;

        const careerBase = V3_CAREER_BASE[careerId];
        const rates = V3_GROWTH_RATES[careerId];
        const basePercent = V3_BASE_PERCENT[grade];
        const growthPercent = V3_GROWTH_PERCENT[grade];

        if (!careerBase || !rates || basePercent === undefined || growthPercent === undefined) {
            return hero;
        }

        const levelsGained = Math.max(0, level - 1);
        const attributes: Record<string, number> = {};
        for (const key of ATTRIBUTE_KEYS) {
            const base = Math.floor(((careerBase.attrs[key] ?? 0) * basePercent) / 100);
            const growth = Math.floor(
                (levelsGained * (rates[key] ?? 0) * growthPercent) /
                    (V3_GROWTH_RATE_SCALE * 100),
            );
            attributes[key] = Math.max(0, base + growth);
        }

        const nextMaxHp = Math.max(
            1,
            careerBase.hp + attributes.constitution! * V3_CONSTITUTION_HP_FACTOR,
        );
        const previousHp = typeof hero.currentHp === 'number' ? hero.currentHp : nextMaxHp;

        return {
            ...hero,
            attributes,
            maxHp: nextMaxHp,
            currentHp: Math.max(0, Math.min(previousHp, nextMaxHp)),
        };
    });

    return { ...profile, roster };
}

/**
 * v3 → v4：增加修士灵息与入山整备状态。
 *
 * 100、首队满编与 60 灵粮是 v4 发布时的历史新档口径；后续数值表调整不得回改。
 */
export function migrateProfileV3ToV4(
    payload: Record<string, unknown>,
): Record<string, unknown> {
    const profile = recordOf(payload, 'profile');
    const roster = Array.isArray(profile.roster)
        ? profile.roster.map((entry) => {
              if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                  return entry;
              }
              const hero = entry as UnknownRecord;
              return { ...hero, stamina: hero.stamina ?? 100 };
          })
        : profile.roster;
    const heroIds = Array.isArray(roster)
        ? roster
              .map((entry) =>
                  entry && typeof entry === 'object' && !Array.isArray(entry)
                      ? (entry as UnknownRecord).instanceId
                      : null,
              )
              .filter((id): id is string => typeof id === 'string')
              .slice(0, 4)
        : [];
    const camp = profile.camp && typeof profile.camp === 'object' && !Array.isArray(profile.camp)
        ? (profile.camp as UnknownRecord)
        : {};
    const recoveryAnchor = Number.isSafeInteger(camp.lastSettledAtUtc)
        ? (camp.lastSettledAtUtc as number)
        : 0;

    return {
        ...profile,
        roster,
        expeditionPreparation: profile.expeditionPreparation ?? {
            partyPresets: [
                {
                    presetId: 'party_01',
                    name: '1队',
                    slots: new Array<string | null>(4)
                        .fill(null)
                        .map((_, index) => heroIds[index] ?? null),
                },
            ],
            activePresetId: 'party_01',
            loadout: { spiritGrain: 60, pickaxe: 0, lens: 0 },
            lastStaminaSettledAtUtc: recoveryAnchor,
        },
    };
}
