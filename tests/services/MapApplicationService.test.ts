import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { GridCoord } from 'db://assets/scripts/domain/GridCoord';
import type { DemoMapDefinition } from 'db://assets/scripts/domain/map/DemoMapDefinition';
import { EventBus } from 'db://assets/scripts/services/EventBus';
import { GameState } from 'db://assets/scripts/services/GameState';
import type { Profile } from 'db://assets/scripts/services/GameState';
import { MapApplicationService } from 'db://assets/scripts/services/map/MapApplicationService';
import {
    migrateProfileV5ToV6,
    migrateProfileV6ToV7,
    migrateProfileV7ToV8,
} from 'db://assets/scripts/services/ProfileCodec';

const MAP: DemoMapDefinition = {
    id: 'map_01',
    name: '破禁山麓',
    width: 3,
    height: 3,
    activeWidth: 3,
    activeHeight: 3,
    entryX: 0,
    entryY: 0,
    terrainRows: ['...', '...', 'E..'],
    objects: [
        {
            id: 'chest_01',
            kind: 'treasure_chest',
            x: 1,
            y: 0,
            initialState: 'AVAILABLE',
            title: '封禁木匣',
            description: '匣中留有一柄开山镐。',
            eventActions: ['operate', 'leave'],
            reward: { itemId: 'pickaxe', itemName: '开山镐', amount: 1 },
        },
        {
            id: 'story_01',
            kind: 'story_event',
            x: 1,
            y: 1,
            initialState: 'AVAILABLE',
            title: '残碑留痕',
            description: '石碑上留有警告。',
            eventActions: ['leave'],
        },
    ],
    visual: {
        tiledMapAssetPath: 'test',
        sourceTileSize: 16,
        logicalTileSize: 48,
    },
};

function makeProfile(position: GridCoord, temporaryLoot: Record<string, number> = {}): Profile {
    return {
        wallet: {
            spiritGrain: 0,
            spiritWood: 0,
            darkIron: 0,
            spiritStone: 0,
            gengJing: 0,
            soulCrystal: 0,
            immortalCoin: 0,
        },
        camp: {
            buildingLevels: {},
            workerCount: 0,
            workerAssignments: {},
            resourceStorageLevels: {},
            lastSettledAtUtc: 0,
        },
        roster: [],
        inventory: {},
        storyFlags: {},
        completedMapObjects: {},
        expeditionPreparation: {
            partyPresets: [],
            activePresetId: '',
            loadout: { spiritGrain: 0, pickaxe: 0, lens: 0 },
            lastStaminaSettledAtUtc: 0,
        },
        expedition: {
            mapId: MAP.id,
            partyPresetId: 'party_01',
            partyMemberIds: [],
            position,
            remainingGrain: 10,
            grainCapacity: 10,
            grainDepletionSteps: 0,
            carriedItems: {},
            restUsesRemaining: 1,
            isResting: false,
            restHealingUsed: false,
            revealedTiles: new Set([position.toKey()]),
            temporaryLoot,
        },
    };
}

function createService(profile: Profile, save: () => Promise<void>): MapApplicationService {
    const state = new GameState();
    state.load(profile);
    return new MapApplicationService({
        state,
        events: new EventBus(),
        save,
        nowUtcSeconds: () => 100,
        readGrainDepletionStepLimit: () => 4,
    });
}

describe('MapApplicationService 地图对象与临时战利品', () => {
    test('宝箱只结算一次，奖励先进入本次入山临时战利品', async () => {
        const profile = makeProfile(new GridCoord(1, 0));
        let saves = 0;
        const service = createService(profile, async () => { saves += 1; });
        const chest = MAP.objects[0]!;

        assert.deepEqual(await service.resolveObject(MAP, chest), { ok: true, resolved: true });
        assert.equal(profile.completedMapObjects['map_01.chest_01'], true);
        assert.equal(profile.expedition?.temporaryLoot.pickaxe, 1);
        assert.deepEqual(await service.resolveObject(MAP, chest), { ok: true, resolved: false });
        assert.equal(profile.expedition?.temporaryLoot.pickaxe, 1);
        assert.equal(saves, 1);
    });

    test('剧情事件保存完成状态但不生成奖励', async () => {
        const profile = makeProfile(new GridCoord(1, 1));
        const service = createService(profile, async () => {});

        assert.deepEqual(
            await service.resolveObject(MAP, MAP.objects[1]!),
            { ok: true, resolved: true },
        );
        assert.equal(profile.completedMapObjects['map_01.story_01'], true);
        assert.deepEqual(profile.expedition?.temporaryLoot, {});
    });

    test('地图对象保存失败时同时回滚完成状态与奖励', async () => {
        const profile = makeProfile(new GridCoord(1, 0));
        const service = createService(profile, async () => { throw new Error('disk full'); });
        const result = await service.resolveObject(MAP, MAP.objects[0]!);

        assert.equal(result.ok, false);
        assert.equal(profile.completedMapObjects['map_01.chest_01'], undefined);
        assert.equal(profile.expedition?.temporaryLoot.pickaxe, undefined);
    });

    test('从入口安全归营并将临时战利品入库', async () => {
        const safeProfile = makeProfile(new GridCoord(0, 0), { pickaxe: 1 });
        const safeService = createService(safeProfile, async () => {});
        assert.deepEqual(await safeService.returnToCamp(MAP), { ok: true });
        assert.equal(safeProfile.inventory.pickaxe, 1);
        assert.equal(safeProfile.expedition, null);
    });

    test('断粮且没有归营符时不能从任意坐标绕过阵亡规则', async () => {
        const profile = makeProfile(new GridCoord(2, 0));
        profile.expedition!.remainingGrain = 0;
        const service = createService(profile, async () => {});

        const result = await service.returnWithTalisman(MAP, 'return_talisman');
        assert.equal(result.ok, false);
        assert.notEqual(profile.expedition, null);
    });

});

describe('断粮全队阵亡结算', () => {
    test('第四个衰竭步完成后修士阵亡、离队并返还一半可损失物', async () => {
        const profile = makeProfile(new GridCoord(2, 1));
        const heroIds = ['hero_01', 'hero_02'];
        profile.roster.push(...heroIds.map((instanceId) => ({
            instanceId,
            definitionId: instanceId,
            nameKey: instanceId,
            careerId: 'wu_xiu',
            spiritualRootId: 'mixed_root' as const,
            realmId: 'lian_qi' as const,
            level: 1,
            attributes: {
                strength: 1, magic: 1, technique: 1, speed: 1,
                constitution: 1, armor: 1, resistance: 1,
            },
            maxHp: 100,
            currentHp: 100,
            skillIds: ['a', 'b', 'c'],
            isDead: false,
            stamina: 90,
        })));
        profile.expeditionPreparation.partyPresets = [{
            presetId: 'party_01',
            name: '1队',
            slots: [...heroIds, null, null],
        }];
        profile.expeditionPreparation.activePresetId = 'party_01';
        profile.expedition = {
            ...profile.expedition!,
            partyMemberIds: heroIds,
            remainingGrain: 0,
            grainDepletionSteps: 4,
            carriedItems: { pickaxe: 1, lens: 1 },
            temporaryLoot: { pickaxe: 1, ore: 3 },
        };
        const service = createService(profile, async () => {});

        assert.deepEqual(await service.settleGrainDepletionDeath(MAP.id), { ok: true });
        assert.ok(profile.roster.every((hero) => hero.isDead && hero.currentHp === 0));
        assert.deepEqual(profile.expeditionPreparation.partyPresets[0]?.slots, [null, null, null, null]);
        assert.equal(profile.inventory.pickaxe, 1);
        assert.equal(profile.inventory.lens, undefined);
        assert.equal(profile.inventory.ore, 1);
        assert.equal(profile.expedition, null);
    });
});

describe('地图对象存档迁移', () => {
    test('v5 旧档补为空完成记录，已有记录保持不变', () => {
        assert.deepEqual(migrateProfileV5ToV6({ inventory: {} }).completedMapObjects, {});
        assert.deepEqual(
            migrateProfileV5ToV6({ completedMapObjects: { 'map_01.chest_01': true } })
                .completedMapObjects,
            { 'map_01.chest_01': true },
        );
    });

    test('v6 进行中的入山补齐休整与携带状态', () => {
        const migrated = migrateProfileV6ToV7({
            expeditionPreparation: {
                activePresetId: 'party_01',
                partyPresets: [{ presetId: 'party_01', slots: ['hero_01', null, null, null] }],
            },
            expedition: { mapId: 'map_01', remainingGrain: 7 },
        });
        assert.deepEqual(migrated.expedition, {
            mapId: 'map_01',
            remainingGrain: 7,
            partyPresetId: 'party_01',
            partyMemberIds: ['hero_01'],
            grainCapacity: 7,
            carriedItems: {},
            restUsesRemaining: 1,
            isResting: false,
            restHealingUsed: false,
        });
        assert.equal((migrated.inventory as Record<string, number>).return_talisman, 1);
    });

    test('v7 进行中的入山补齐断粮衰竭步数', () => {
        const migrated = migrateProfileV7ToV8({
            expedition: { mapId: 'map_01', remainingGrain: 0 },
        });
        assert.equal(
            (migrated.expedition as Record<string, unknown>).grainDepletionSteps,
            0,
        );
    });
});
