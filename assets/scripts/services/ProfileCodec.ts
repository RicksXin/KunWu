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
import type {
    CampState,
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
    return {
        buildingLevels: numberRecordOf(raw.buildingLevels, 'profile.camp.buildingLevels'),
        workerAssignments: numberRecordOf(
            raw.workerAssignments,
            'profile.camp.workerAssignments',
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

function parseProfile(value: unknown, defaultSettledAtUtc?: number): Profile {
    const raw = recordOf(value, 'profile');
    return {
        wallet: walletOf(raw.wallet),
        camp: campOf(raw.camp, defaultSettledAtUtc),
        roster: rosterOf(raw.roster),
        inventory: numberRecordOf(raw.inventory, 'profile.inventory'),
        storyFlags: booleanRecordOf(raw.storyFlags, 'profile.storyFlags'),
        expedition: expeditionOf(raw.expedition),
    };
}

/** 从 shared Bundle 的新档数据种子创建独立 Profile。 */
export function createDefaultProfile(seed: unknown, nowUtcSeconds: number): Profile {
    const profile = parseProfile(seed, integerOf(nowUtcSeconds, 'nowUtcSeconds'));
    if (profile.roster.length !== 4) {
        throw new Error(`新档必须恰好包含 4 名初始修士，实际 ${profile.roster.length}`);
    }
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
            workerAssignments: { ...profile.camp.workerAssignments },
            lastSettledAtUtc: profile.camp.lastSettledAtUtc,
        },
        roster: profile.roster.map((hero) => ({
            ...hero,
            attributes: { ...hero.attributes },
            skillIds: [...hero.skillIds],
        })),
        inventory: { ...profile.inventory },
        storyFlags: { ...profile.storyFlags },
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
