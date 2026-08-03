/**
 * Profile 的公共编解码入口（技术方案 §5、§13）。
 *
 * 具体字段收窄与历史迁移分别位于 services/profile/，本文件只保留稳定 API，
 * 避免调用方依赖内部解析步骤。
 */

import type { Profile } from './GameState';
import { MAX_PARTY_SIZE } from 'db://assets/scripts/domain/CombatTypes';
import { parseProfile } from './profile/ProfileParsing';
import { integerOf, recordOf } from './profile/ProfileValueReaders';

export {
    migrateProfileV1ToV2,
    migrateProfileV2ToV3,
    migrateProfileV3ToV4,
    migrateProfileV4ToV5,
    migrateProfileV5ToV6,
    migrateProfileV6ToV7,
} from './profile/ProfileMigrations';
export { migrateProfileV7ToV8 } from './profile/ProfileMapMigrations';

/** 从 shared Bundle 的新档数据种子创建独立 Profile。 */
export function createDefaultProfile(seed: unknown, nowUtcSeconds: number): Profile {
    const raw = recordOf(seed, 'profile');
    if (!Array.isArray(raw.roster) || raw.roster.length !== 4) {
        const count = Array.isArray(raw.roster) ? raw.roster.length : 0;
        throw new Error(`新档必须恰好包含 4 名初始修士，实际 ${count}`);
    }
    return parseProfile(seed, integerOf(nowUtcSeconds, 'nowUtcSeconds'));
}

/** 把 SaveEnvelope.payload 恢复为运行时 Profile。 */
export function deserializeProfile(payload: unknown): Profile {
    return parseProfile(payload);
}

/** 把运行时 Profile 转成不含 Set/GridCoord 的纯 JSON 数据。 */
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
        completedMapObjects: { ...profile.completedMapObjects },
        expeditionPreparation: {
            partyPresets: profile.expeditionPreparation.partyPresets.map((preset) => ({
                presetId: preset.presetId,
                name: preset.name,
                slots: [...preset.slots],
            })),
            activePresetId: profile.expeditionPreparation.activePresetId,
            loadout: { ...profile.expeditionPreparation.loadout },
            lastStaminaSettledAtUtc: profile.expeditionPreparation.lastStaminaSettledAtUtc,
        },
        expedition: expedition
            ? {
                  mapId: expedition.mapId,
                  partyPresetId: expedition.partyPresetId,
                  partyMemberIds: [...expedition.partyMemberIds],
                  position: { x: expedition.position.x, y: expedition.position.y },
                  remainingGrain: expedition.remainingGrain,
                  grainCapacity: expedition.grainCapacity,
                  grainDepletionSteps: expedition.grainDepletionSteps,
                  carriedItems: { ...expedition.carriedItems },
                  restUsesRemaining: expedition.restUsesRemaining,
                  isResting: expedition.isResting,
                  restHealingUsed: expedition.restHealingUsed,
                  revealedTiles: Array.from(expedition.revealedTiles).sort(),
                  temporaryLoot: { ...expedition.temporaryLoot },
              }
            : null,
    };
}

/** localhost 灰盒调试恢复；是否允许恢复由启动层决定。 */
export function recoverDemoRoster(profile: Profile): void {
    profile.roster.forEach((hero) => {
        hero.currentHp = hero.maxHp;
        hero.isDead = false;
    });
    const activeId = profile.expeditionPreparation.activePresetId;
    const recoveredIds = profile.roster
        .slice(0, MAX_PARTY_SIZE)
        .map((hero) => hero.instanceId);
    const recoveredSet = new Set(recoveredIds);
    profile.expeditionPreparation.partyPresets = profile.expeditionPreparation.partyPresets
        .map((preset) => preset.presetId === activeId
            ? { ...preset, slots: recoveredIds }
            : {
                  ...preset,
                  slots: preset.slots.map((id) => id && recoveredSet.has(id) ? null : id),
              });
    profile.expedition = null;
}
