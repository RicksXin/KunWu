import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GameState } from 'db://assets/scripts/services/GameState';
import type { Profile } from 'db://assets/scripts/services/GameState';
import { createAttributes } from 'db://assets/scripts/domain/Attributes';

function makeProfile(): Profile {
    return {
        wallet: {
            spiritGrain: 100,
            spiritWood: 0,
            darkIron: 0,
            spiritStone: 0,
            gengJing: 0,
            soulCrystal: 0,
            immortalCoin: 0,
        },
        camp: {
            buildingLevels: {},
            workerCount: 6,
            workerAssignments: {},
            resourceStorageLevels: {
                spiritGrain: 1,
                spiritWood: 1,
                darkIron: 1,
            },
            lastSettledAtUtc: 0,
        },
        roster: [
            {
                instanceId: 'hero_1',
                definitionId: 'def_sword',
                nameKey: 'hero.test',
                careerId: 'wu_xiu',
                spiritualRootId: 'pseudo_root',
                realmId: 'lian_qi',
                level: 1,
                attributes: createAttributes({ strength: 10 }),
                maxHp: 50,
                currentHp: 50,
                skillIds: ['zhan_ji', 'tiao_xin', 'chong_zhuang'],
                isDead: false,
                stamina: 100,
            },
        ],
        inventory: {},
        storyFlags: {},
        completedMapObjects: {},
        expeditionPreparation: {
            partyPresets: [
                {
                    presetId: 'party_01',
                    name: '1队',
                    slots: ['hero_1', null, null, null],
                },
            ],
            activePresetId: 'party_01',
            loadout: { spiritGrain: 0, pickaxe: 0, lens: 0 },
            lastStaminaSettledAtUtc: 0,
        },
        expedition: null,
    };
}

describe('GameState', () => {
    test('未加载存档时 require 抛错而非返回空对象', () => {
        const state = new GameState();
        assert.equal(state.isLoaded, false);
        // 默认空对象会让流程错误在很久之后才以 NaN/undefined 形式暴露
        assert.throws(() => state.require(), /尚未加载存档/);
    });

    test('加载后可取回同一 Profile', () => {
        const state = new GameState();
        const profile = makeProfile();
        state.load(profile);
        assert.equal(state.isLoaded, true);
        assert.equal(state.require(), profile);
    });

    test('clear 后回到未加载状态', () => {
        const state = new GameState();
        state.load(makeProfile());
        state.clear();
        assert.equal(state.isLoaded, false);
        assert.throws(() => state.require());
    });
});
