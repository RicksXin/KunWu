import { ATTRIBUTE_KEYS } from 'db://assets/scripts/domain/Attributes';
import type { HeroGrade } from 'db://assets/scripts/domain/HeroGrowth';
import { migratedWorkerCount } from 'db://assets/scripts/domain/LingPu';
import { recordOf } from './ProfileValueReaders';
import type { UnknownRecord } from './ProfileValueReaders';

/** v1 → v2：补充杂役总数和三种基础资源的独立存储等级。 */
export function migrateProfileV1ToV2(payload: Record<string, unknown>): Record<string, unknown> {
    const profile = recordOf(payload, 'profile');
    const camp = recordOf(profile.camp, 'profile.camp');
    const assignments = camp.workerAssignments && typeof camp.workerAssignments === 'object'
        ? (camp.workerAssignments as Record<string, number>)
        : {};
    return {
        ...profile,
        camp: {
            ...camp,
            workerCount: camp.workerCount ?? migratedWorkerCount(assignments, 6),
            resourceStorageLevels: camp.resourceStorageLevels ?? {
                spiritGrain: 1,
                spiritWood: 1,
                darkIron: 1,
            },
        },
    };
}

/**
 * v3 发布时的成长曲线快照。迁移必须保持历史确定性，不能引用运行时平衡表。
 */
const V3_BASE_PERCENT: Readonly<Record<HeroGrade, number>> = {
    D: 100, C: 108, B: 116, A: 124, S: 133, SS: 142, SSS: 152,
};

const V3_GROWTH_PERCENT: Readonly<Record<HeroGrade, number>> = {
    D: 100, C: 110, B: 122, A: 136, S: 152, SS: 170, SSS: 190,
};

const V3_GROWTH_RATES: Readonly<Record<string, Readonly<Record<string, number>>>> = {
    ti_xiu: { strength: 800, magic: 200, technique: 300, speed: 300, constitution: 3000, armor: 3000, resistance: 800 },
    wu_xiu: { strength: 3000, magic: 200, technique: 600, speed: 600, constitution: 2000, armor: 1200, resistance: 600 },
    qian_xiu: { strength: 800, magic: 200, technique: 3000, speed: 1200, constitution: 800, armor: 600, resistance: 600 },
    fa_xiu: { strength: 200, magic: 3000, technique: 2000, speed: 400, constitution: 800, armor: 600, resistance: 1200 },
    yi_xiu: { strength: 200, magic: 3000, technique: 800, speed: 400, constitution: 800, armor: 600, resistance: 2000 },
    fu_xiu: { strength: 200, magic: 2000, technique: 3000, speed: 400, constitution: 800, armor: 600, resistance: 1200 },
};

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

const V3_CONSTITUTION_HP_FACTOR = 8;
const V3_GROWTH_RATE_SCALE = 1000;

/** v2 → v3：按 v3 发布快照重算 roster 的 attributes 与 maxHp。 */
export function migrateProfileV2ToV3(payload: Record<string, unknown>): Record<string, unknown> {
    const profile = recordOf(payload, 'profile');
    if (!Array.isArray(profile.roster)) return { ...profile };
    const roster = profile.roster.map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
        const hero = entry as UnknownRecord;
        const careerId = typeof hero.careerId === 'string' ? hero.careerId : '';
        const grade = hero.grade as HeroGrade;
        const level = typeof hero.level === 'number' ? hero.level : 1;
        const careerBase = V3_CAREER_BASE[careerId];
        const rates = V3_GROWTH_RATES[careerId];
        const basePercent = V3_BASE_PERCENT[grade];
        const growthPercent = V3_GROWTH_PERCENT[grade];
        if (!careerBase || !rates || basePercent === undefined || growthPercent === undefined) return hero;

        const levelsGained = Math.max(0, level - 1);
        const attributes: Record<string, number> = {};
        for (const key of ATTRIBUTE_KEYS) {
            const base = Math.floor(((careerBase.attrs[key] ?? 0) * basePercent) / 100);
            const growth = Math.floor(
                (levelsGained * (rates[key] ?? 0) * growthPercent) / (V3_GROWTH_RATE_SCALE * 100),
            );
            attributes[key] = Math.max(0, base + growth);
        }
        const nextMaxHp = Math.max(1, careerBase.hp + attributes.constitution! * V3_CONSTITUTION_HP_FACTOR);
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

/** v3 → v4：增加修士灵息与入山整备状态。 */
export function migrateProfileV3ToV4(payload: Record<string, unknown>): Record<string, unknown> {
    const profile = recordOf(payload, 'profile');
    const roster = Array.isArray(profile.roster)
        ? profile.roster.map((entry) => {
              if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
              const hero = entry as UnknownRecord;
              return { ...hero, stamina: hero.stamina ?? 100 };
          })
        : profile.roster;
    const heroIds = Array.isArray(roster)
        ? roster
              .map((entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
                  ? (entry as UnknownRecord).instanceId : null)
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
            partyPresets: [{
                presetId: 'party_01',
                name: '1队',
                slots: new Array<string | null>(4).fill(null).map((_, index) => heroIds[index] ?? null),
            }],
            activePresetId: 'party_01',
            loadout: { spiritGrain: 60, pickaxe: 0, lens: 0 },
            lastStaminaSettledAtUtc: recoveryAnchor,
        },
    };
}
