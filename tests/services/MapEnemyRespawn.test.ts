import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Profile } from 'db://assets/scripts/services/GameState';
import {
    clearNormalEnemyProgress,
    restoreMapProgress,
} from 'db://assets/scripts/services/map/MapApplicationUtils';

const MAP = {
    id: 'map_01',
    objects: [
        { id: 'enemy_01', kind: 'enemy_group' },
        { id: 'boss_01', kind: 'boss_main' },
        { id: 'chest_01', kind: 'treasure_chest' },
    ],
} as const;

function profileWithCompletedObjects(): Pick<Profile, 'completedMapObjects'> {
    return {
        completedMapObjects: {
            'map_01.enemy_01': true,
            'map_01.boss_01': true,
            'map_01.chest_01': true,
        },
    };
}

describe('普通野外敌人刷新', () => {
    test('新一次入山只清除普通敌人，保留宝箱与 Boss', () => {
        const profile = profileWithCompletedObjects();
        const snapshot = clearNormalEnemyProgress(profile, MAP);

        assert.equal(profile.completedMapObjects['map_01.enemy_01'], undefined);
        assert.equal(profile.completedMapObjects['map_01.boss_01'], true);
        assert.equal(profile.completedMapObjects['map_01.chest_01'], true);

        restoreMapProgress(profile, snapshot);
        assert.equal(profile.completedMapObjects['map_01.enemy_01'], true);
    });
});
