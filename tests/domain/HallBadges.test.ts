import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    BUILDING_IDS,
    BOTTOM_NAV_ITEMS,
    MAX_PRIMARY_BADGES,
    isBuildingInteractive,
    isBuildingUsable,
    resolveBuildingStates,
    computeBadges,
    requiresRevivalBadge,
} from 'db://assets/scripts/domain/HallBadges';
import type { PendingAction, BuildingId } from 'db://assets/scripts/domain/HallBadges';

function action(
    buildingId: BuildingId,
    overrides: Partial<PendingAction> = {},
): PendingAction {
    return {
        buildingId,
        actionId: `${buildingId}_action`,
        isActionable: true,
        priority: 1,
        ...overrides,
    };
}

describe('营地结构（PRD-01 §2）', () => {
    test('七座建筑', () => {
        assert.equal(BUILDING_IDS.length, 7);
    });

    test('底部导航五项，顺序为营地/修士/背包/任务/入山', () => {
        assert.deepEqual(
            [...BOTTOM_NAV_ITEMS],
            ['camp', 'heroes', 'inventory', 'quests', 'expedition'],
        );
    });

    test('建筑 ID 无重复', () => {
        assert.equal(new Set(BUILDING_IDS).size, BUILDING_IDS.length);
    });
});

describe('建筑可交互性（PRD-01 §5）', () => {
    test('LOCKED 与 DISABLED 不可点', () => {
        assert.equal(isBuildingInteractive('LOCKED'), false);
        assert.equal(isBuildingInteractive('DISABLED'), false);
    });

    test('AVAILABLE 可点以触发解锁', () => {
        // 满足剧情后可点击解锁，不能当成不可交互
        assert.equal(isBuildingInteractive('AVAILABLE'), true);
    });

    test('UNLOCKED 与 UPGRADABLE 可点', () => {
        assert.equal(isBuildingInteractive('UNLOCKED'), true);
        assert.equal(isBuildingInteractive('UPGRADABLE'), true);
    });

    test('AVAILABLE 尚不可正常使用', () => {
        // 可点击解锁 ≠ 可使用功能
        assert.equal(isBuildingUsable('AVAILABLE'), false);
    });

    test('UNLOCKED/UPGRADABLE/MAX_LEVEL 可使用', () => {
        for (const state of ['UNLOCKED', 'UPGRADABLE', 'MAX_LEVEL'] as const) {
            assert.equal(isBuildingUsable(state), true, `${state} 应可使用`);
        }
    });
});

describe('新手建筑状态解析', () => {
    test('新档三座初始建筑已解锁，其余锁定', () => {
        const states = resolveBuildingStates(
            {
                yi_shi_dian: 1,
                ling_pu: 1,
                zhao_xian_tai: 0,
                bai_bao_ku: 1,
                lian_qi_fang: 0,
                jiao_yi_hang: 0,
                huan_hun_tan: 0,
            },
            {},
        );
        assert.equal(states.yi_shi_dian, 'UNLOCKED');
        assert.equal(states.ling_pu, 'UNLOCKED');
        assert.equal(states.bai_bao_ku, 'UNLOCKED');
        assert.equal(states.zhao_xian_tai, 'LOCKED');
        assert.equal(states.lian_qi_fang, 'LOCKED');
        assert.equal(states.jiao_yi_hang, 'LOCKED');
        assert.equal(states.huan_hun_tan, 'LOCKED');
    });

    test('剧情 Flag 满足但尚未建造时为 AVAILABLE', () => {
        const states = resolveBuildingStates(
            { zhao_xian_tai: 0 },
            { unlock_zhao_xian_tai: true },
        );
        assert.equal(states.zhao_xian_tai, 'AVAILABLE');
    });

    test('建筑等级优先于解锁 Flag', () => {
        const states = resolveBuildingStates(
            { lian_qi_fang: 1 },
            { unlock_lian_qi_fang: false },
        );
        assert.equal(states.lian_qi_fang, 'UNLOCKED');
    });
});

describe('红点规则（PRD-01 §7）', () => {
    test('无动作时无红点', () => {
        const badges = computeBadges([]);
        assert.deepEqual(badges.primaryBadges, []);
        assert.deepEqual(badges.collapsedBadges, []);
    });

    test('不可执行的动作不产生红点', () => {
        // 资源不足、未满足条件不产生红点
        const badges = computeBadges([action('ling_pu', { isActionable: false })]);
        assert.deepEqual(badges.primaryBadges, []);
    });

    test('同一建筑多个动作只显示一个红点', () => {
        const badges = computeBadges([
            action('ling_pu', { actionId: 'harvest' }),
            action('ling_pu', { actionId: 'assign' }),
            action('ling_pu', { actionId: 'upgrade' }),
        ]);
        assert.deepEqual(badges.primaryBadges, ['ling_pu']);
    });

    test('同屏最多三个一级红点，其余收纳', () => {
        const badges = computeBadges([
            action('ling_pu'),
            action('zhao_xian_tai'),
            action('bai_bao_ku'),
            action('lian_qi_fang'),
            action('jiao_yi_hang'),
        ]);
        assert.equal(badges.primaryBadges.length, MAX_PRIMARY_BADGES);
        assert.equal(badges.collapsedBadges.length, 2);
    });

    test('高优先级动作占用一级名额', () => {
        const badges = computeBadges([
            action('ling_pu', { priority: 1 }),
            action('zhao_xian_tai', { priority: 1 }),
            action('bai_bao_ku', { priority: 1 }),
            action('huan_hun_tan', { priority: 99 }),
        ]);
        assert.ok(badges.primaryBadges.includes('huan_hun_tan'));
        assert.equal(badges.primaryBadges.length, MAX_PRIMARY_BADGES);
    });

    test('同优先级按建筑声明顺序，结果可复现', () => {
        const input = [
            action('jiao_yi_hang'),
            action('ling_pu'),
            action('bai_bao_ku'),
            action('yi_shi_dian'),
        ];
        const first = computeBadges(input);
        // 打乱输入顺序后结果应相同
        const second = computeBadges([...input].reverse());
        assert.deepEqual(first.primaryBadges, second.primaryBadges);
        // 声明顺序：yi_shi_dian < ling_pu < bai_bao_ku < jiao_yi_hang
        assert.deepEqual(first.primaryBadges, ['yi_shi_dian', 'ling_pu', 'bai_bao_ku']);
    });

    test('已提醒过的批次不再产生红点', () => {
        // 招贤台高品级候选同一批只提醒一次
        const candidates = action('zhao_xian_tai', { batchId: 'batch_001' });
        assert.deepEqual(computeBadges([candidates]).primaryBadges, ['zhao_xian_tai']);
        assert.deepEqual(computeBadges([candidates], ['batch_001']).primaryBadges, []);
    });

    test('未提醒过的新批次仍产生红点', () => {
        const badges = computeBadges(
            [action('zhao_xian_tai', { batchId: 'batch_002' })],
            ['batch_001'],
        );
        assert.deepEqual(badges.primaryBadges, ['zhao_xian_tai']);
    });

    test('无批次 ID 的动作不受已提醒列表影响', () => {
        const badges = computeBadges([action('ling_pu')], ['batch_001']);
        assert.deepEqual(badges.primaryBadges, ['ling_pu']);
    });

    test('可执行与不可执行混合时只算可执行的', () => {
        const badges = computeBadges([
            action('ling_pu', { isActionable: false }),
            action('zhao_xian_tai', { isActionable: true }),
        ]);
        assert.deepEqual(badges.primaryBadges, ['zhao_xian_tai']);
    });
});

describe('还魂坛强制提示（PRD-01 §7）', () => {
    test('有未处理死亡修士时必须提示', () => {
        assert.equal(requiresRevivalBadge(1), true);
    });

    test('无死亡修士时不提示', () => {
        assert.equal(requiresRevivalBadge(0), false);
    });
});
