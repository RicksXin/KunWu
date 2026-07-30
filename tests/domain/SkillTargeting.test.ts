import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    SKILL_TARGET_TYPES,
    isEnemyTarget,
    isSingleTarget,
    isTauntable,
    resolveTauntedTarget,
} from 'db://assets/scripts/domain/SkillTargeting';
import type { TauntState } from 'db://assets/scripts/domain/SkillTargeting';

describe('目标类型清单（PRD-04 §4）', () => {
    test('九种目标类型', () => {
        assert.equal(SKILL_TARGET_TYPES.length, 9);
    });

    test('无重复', () => {
        assert.equal(new Set(SKILL_TARGET_TYPES).size, SKILL_TARGET_TYPES.length);
    });
});

describe('敌我判定', () => {
    test('ENEMY_ 前缀均为敌方', () => {
        for (const type of SKILL_TARGET_TYPES) {
            if (type.startsWith('ENEMY_')) {
                assert.equal(isEnemyTarget(type), true, `${type} 应为敌方目标`);
            }
        }
    });

    test('SELF 与 ALLY_ 均非敌方', () => {
        for (const type of SKILL_TARGET_TYPES) {
            if (type === 'SELF' || type.startsWith('ALLY_')) {
                assert.equal(isEnemyTarget(type), false, `${type} 不应为敌方目标`);
            }
        }
    });
});

describe('单体判定', () => {
    test('_ALL 与 _RANDOM_MULTI 为群体', () => {
        assert.equal(isSingleTarget('ALLY_ALL'), false);
        assert.equal(isSingleTarget('ENEMY_ALL'), false);
        assert.equal(isSingleTarget('ENEMY_RANDOM_MULTI'), false);
    });

    test('SELF 算单体', () => {
        assert.equal(isSingleTarget('SELF'), true);
    });

    test('LOWEST_HP 与 HIGHEST_STAT 算单体', () => {
        // 选择规则不同，但最终只打一个目标
        assert.equal(isSingleTarget('ENEMY_LOWEST_HP'), true);
        assert.equal(isSingleTarget('ENEMY_HIGHEST_STAT'), true);
        assert.equal(isSingleTarget('ALLY_LOWEST_HP'), true);
    });
});

describe('可嘲讽判定（技术方案 §11.1）', () => {
    test('敌方单体可被嘲讽', () => {
        assert.equal(isTauntable('ENEMY_SINGLE'), true);
        assert.equal(isTauntable('ENEMY_LOWEST_HP'), true);
        assert.equal(isTauntable('ENEMY_HIGHEST_STAT'), true);
    });

    test('群体与随机多段不受嘲讽', () => {
        // PRD-04 §6：群体、随机多段不受影响
        assert.equal(isTauntable('ENEMY_ALL'), false);
        assert.equal(isTauntable('ENEMY_RANDOM_MULTI'), false);
    });

    test('友方与自身技能与嘲讽无关', () => {
        for (const type of ['SELF', 'ALLY_SINGLE', 'ALLY_LOWEST_HP', 'ALLY_ALL'] as const) {
            assert.equal(isTauntable(type), false, `${type} 不该受嘲讽约束`);
        }
    });

    test('可嘲讽等价于「敌方且单体」', () => {
        // 由类型推导而非配置声明，从根上排除矛盾配置
        for (const type of SKILL_TARGET_TYPES) {
            assert.equal(isTauntable(type), isEnemyTarget(type) && isSingleTarget(type));
        }
    });
});

describe('嘲讽解析（PRD-04 §6）', () => {
    const taunter = (id: number, strength: number, isAlive = true): TauntState => ({
        taunterId: id,
        strength,
        isAlive,
    });

    test('无嘲讽时保持原目标', () => {
        assert.equal(resolveTauntedTarget('ENEMY_SINGLE', false, 7, []), 7);
    });

    test('单个嘲讽者强制改指向', () => {
        assert.equal(resolveTauntedTarget('ENEMY_SINGLE', false, 7, [taunter(3, 100)]), 3);
    });

    test('ignore_taunt 无视嘲讽', () => {
        assert.equal(resolveTauntedTarget('ENEMY_SINGLE', true, 7, [taunter(3, 100)]), 7);
    });

    test('群体技能不受嘲讽影响', () => {
        assert.equal(resolveTauntedTarget('ENEMY_ALL', false, 7, [taunter(3, 100)]), 7);
    });

    test('随机多段不受嘲讽影响', () => {
        assert.equal(resolveTauntedTarget('ENEMY_RANDOM_MULTI', false, 7, [taunter(3, 100)]), 7);
    });

    test('多个嘲讽者取强度最高', () => {
        const result = resolveTauntedTarget('ENEMY_SINGLE', false, 7, [
            taunter(3, 50),
            taunter(4, 200),
            taunter(5, 120),
        ]);
        assert.equal(result, 4);
    });

    test('同强度取 ID 较小者，保证可复现', () => {
        const result = resolveTauntedTarget('ENEMY_SINGLE', false, 7, [
            taunter(9, 100),
            taunter(2, 100),
        ]);
        assert.equal(result, 2);
    });

    test('嘲讽者死亡后立即失效', () => {
        // PRD-04 §6：嘲讽者死亡后立即恢复正常选目标
        const result = resolveTauntedTarget('ENEMY_SINGLE', false, 7, [taunter(3, 100, false)]);
        assert.equal(result, 7);
    });

    test('存活嘲讽者优先于已死的高强度嘲讽者', () => {
        const result = resolveTauntedTarget('ENEMY_SINGLE', false, 7, [
            taunter(3, 999, false),
            taunter(4, 10, true),
        ]);
        assert.equal(result, 4);
    });

    test('全部嘲讽者死亡时保持原目标', () => {
        const result = resolveTauntedTarget('ENEMY_SINGLE', false, 7, [
            taunter(3, 100, false),
            taunter(4, 200, false),
        ]);
        assert.equal(result, 7);
    });

    test('嘲讽者顺序不影响结果', () => {
        const taunts = [taunter(3, 50), taunter(4, 200), taunter(5, 120)];
        const forward = resolveTauntedTarget('ENEMY_SINGLE', false, 7, taunts);
        const backward = resolveTauntedTarget('ENEMY_SINGLE', false, 7, [...taunts].reverse());
        assert.equal(forward, backward);
    });
});
