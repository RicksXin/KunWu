import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    moveCostFor,
    tryMove,
    isInBounds,
    pathGrainCost,
    findPath,
    TERRAIN_MOVE_COST,
    DEFAULT_MOVE_COST,
} from 'db://assets/scripts/domain/Movement';
import { GridCoord } from 'db://assets/scripts/domain/GridCoord';
import type { TileDefinition } from 'db://assets/scripts/domain/MapTypes';

const BOUNDS = { width: 10, height: 10 };

function tile(overrides: Partial<TileDefinition> = {}): TileDefinition {
    return {
        terrain: 'stone_path',
        walkable: true,
        moveCost: 1,
        visionBlock: false,
        danger: 0,
        height: 0,
        tags: [],
        ...overrides,
    };
}

describe('地形成本（PRD-05 §4）', () => {
    test('石道与玉砖为 1', () => {
        assert.equal(moveCostFor('stone_path'), 1);
        assert.equal(moveCostFor('jade_floor'), 1);
    });

    test('林地、碎石、魔雾为 2', () => {
        for (const terrain of ['forest', 'rubble', 'demon_mist']) {
            assert.equal(moveCostFor(terrain), 2, `${terrain} 成本应为 2`);
        }
    });

    test('水潭与泥地为 3', () => {
        assert.equal(moveCostFor('water_pool'), 3);
        assert.equal(moveCostFor('mud'), 3);
    });

    test('已激活传送为 0', () => {
        assert.equal(moveCostFor('active_teleporter'), 0);
    });

    test('未知地形取默认 1，不是 0', () => {
        // 0 会让未配置地形变成免费通道
        assert.equal(moveCostFor('unconfigured_terrain'), DEFAULT_MOVE_COST);
        assert.equal(DEFAULT_MOVE_COST, 1);
    });

    test('成本表内全为非负整数', () => {
        for (const [terrain, cost] of Object.entries(TERRAIN_MOVE_COST)) {
            assert.ok(Number.isInteger(cost) && cost >= 0, `${terrain} 成本非法`);
        }
    });
});

describe('逐格移动（PRD-05 §2、§6）', () => {
    test('四方向移动成功并扣粮', () => {
        const result = tryMove({
            from: new GridCoord(5, 5),
            to: new GridCoord(5, 6),
            bounds: BOUNDS,
            tile: tile({ moveCost: 2 }),
            remainingGrain: 10,
        });
        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.grainSpent, 2);
            assert.equal(result.remainingGrain, 8);
        }
    });

    test('斜走被拒绝', () => {
        // PRD-05 §2：每次只移动上下左右一格
        const result = tryMove({
            from: new GridCoord(5, 5),
            to: new GridCoord(6, 6),
            bounds: BOUNDS,
            tile: tile(),
            remainingGrain: 10,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.reason, 'not_adjacent');
        }
    });

    test('跨越两格被拒绝', () => {
        const result = tryMove({
            from: new GridCoord(5, 5),
            to: new GridCoord(5, 7),
            bounds: BOUNDS,
            tile: tile(),
            remainingGrain: 10,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.reason, 'not_adjacent');
        }
    });

    test('原地不动被视为不相邻', () => {
        const result = tryMove({
            from: new GridCoord(5, 5),
            to: new GridCoord(5, 5),
            bounds: BOUNDS,
            tile: tile(),
            remainingGrain: 10,
        });
        assert.equal(result.ok, false);
    });

    test('越界被拒绝', () => {
        const result = tryMove({
            from: new GridCoord(0, 0),
            to: new GridCoord(-1, 0),
            bounds: BOUNDS,
            tile: tile(),
            remainingGrain: 10,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.reason, 'out_of_bounds');
        }
    });

    test('不可通行格被拒绝', () => {
        const result = tryMove({
            from: new GridCoord(5, 5),
            to: new GridCoord(5, 6),
            bounds: BOUNDS,
            tile: tile({ walkable: false }),
            remainingGrain: 10,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.reason, 'not_walkable');
        }
    });

    test('灵粮不足被拒绝且不扣粮', () => {
        const result = tryMove({
            from: new GridCoord(5, 5),
            to: new GridCoord(5, 6),
            bounds: BOUNDS,
            tile: tile({ moveCost: 3 }),
            remainingGrain: 2,
        });
        // 先校验后扣除：不该出现扣成负数才发现走不了
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.reason, 'insufficient_grain');
        }
    });

    test('灵粮恰好够时允许移动', () => {
        const result = tryMove({
            from: new GridCoord(5, 5),
            to: new GridCoord(5, 6),
            bounds: BOUNDS,
            tile: tile({ moveCost: 3 }),
            remainingGrain: 3,
        });
        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.remainingGrain, 0);
        }
    });

    test('零成本传送在灵粮耗尽时仍可用', () => {
        const result = tryMove({
            from: new GridCoord(5, 5),
            to: new GridCoord(5, 6),
            bounds: BOUNDS,
            tile: tile({ terrain: 'active_teleporter', moveCost: 0 }),
            remainingGrain: 0,
        });
        assert.equal(result.ok, true);
    });

    test('不可通行优先于灵粮不足', () => {
        // 两个问题同时存在时，报更根本的那个
        const result = tryMove({
            from: new GridCoord(5, 5),
            to: new GridCoord(5, 6),
            bounds: BOUNDS,
            tile: tile({ walkable: false, moveCost: 99 }),
            remainingGrain: 0,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.reason, 'not_walkable');
        }
    });
});

describe('边界判定', () => {
    test('四角在界内', () => {
        for (const [x, y] of [[0, 0], [9, 0], [0, 9], [9, 9]] as const) {
            assert.equal(isInBounds(new GridCoord(x, y), BOUNDS), true);
        }
    });

    test('越界返回 false', () => {
        assert.equal(isInBounds(new GridCoord(10, 5), BOUNDS), false);
        assert.equal(isInBounds(new GridCoord(5, 10), BOUNDS), false);
        assert.equal(isInBounds(new GridCoord(-1, 5), BOUNDS), false);
    });
});

describe('路径成本（PRD-05 §6）', () => {
    test('累加各格成本', () => {
        const path = [new GridCoord(1, 0), new GridCoord(2, 0), new GridCoord(3, 0)];
        assert.equal(pathGrainCost(path, () => 2), 6);
    });

    test('空路径成本为 0', () => {
        assert.equal(pathGrainCost([], () => 5), 0);
    });

    test('按格取不同成本', () => {
        const path = [new GridCoord(1, 0), new GridCoord(2, 0)];
        assert.equal(pathGrainCost(path, (c) => (c.x === 1 ? 3 : 1)), 4);
    });

    test('非法成本抛错', () => {
        assert.throws(() => pathGrainCost([new GridCoord(1, 0)], () => -1), /成本非法/);
        assert.throws(() => pathGrainCost([new GridCoord(1, 0)], () => 1.5), /成本非法/);
    });
});

describe('最短路径', () => {
    /** 全通行、成本均为 1 的地图。 */
    const flat = () => (() => 1) as (coord: GridCoord) => number | null;

    test('起点即终点返回空路径', () => {
        const path = findPath({
            start: new GridCoord(5, 5),
            goal: new GridCoord(5, 5),
            bounds: BOUNDS,
            costAt: flat(),
        });
        assert.deepEqual(path, []);
    });

    test('直线路径长度正确', () => {
        const path = findPath({
            start: new GridCoord(0, 0),
            goal: new GridCoord(3, 0),
            bounds: BOUNDS,
            costAt: flat(),
        });
        assert.equal(path?.length, 3);
        assert.equal(path?.[2]?.toKey(), '3,0');
    });

    test('拐角路径为曼哈顿距离', () => {
        const path = findPath({
            start: new GridCoord(0, 0),
            goal: new GridCoord(2, 3),
            bounds: BOUNDS,
            costAt: flat(),
        });
        // 不允许斜走，故步数等于曼哈顿距离
        assert.equal(path?.length, 5);
    });

    test('绕开不可通行格', () => {
        // 在 x=1 竖起一道墙，只在 y=0 留缺口
        const costAt = (coord: GridCoord): number | null =>
            coord.x === 1 && coord.y > 0 ? null : 1;

        const path = findPath({
            start: new GridCoord(0, 3),
            goal: new GridCoord(2, 3),
            bounds: BOUNDS,
            costAt,
        });
        assert.ok(path, '应能绕行');
        // 直达需 2 步，绕行必然更长
        assert.ok((path?.length ?? 0) > 2);
        for (const step of path ?? []) {
            assert.ok(!(step.x === 1 && step.y > 0), '路径穿过了墙');
        }
    });

    test('完全封闭时返回 null', () => {
        const costAt = (coord: GridCoord): number | null =>
            coord.equals(new GridCoord(0, 0)) ? 1 : null;
        const path = findPath({
            start: new GridCoord(0, 0),
            goal: new GridCoord(5, 5),
            bounds: BOUNDS,
            costAt,
        });
        assert.equal(path, null);
    });

    test('优先选择低成本路径而非最短步数', () => {
        // y=0 一行成本 10，y=1 一行成本 1
        const costAt = (coord: GridCoord): number | null => (coord.y === 0 ? 10 : 1);
        const path = findPath({
            start: new GridCoord(0, 0),
            goal: new GridCoord(4, 0),
            bounds: BOUNDS,
            costAt,
        });
        assert.ok(path);
        // 绕到 y=1 走再回来更省，故路径应比 4 步长
        assert.ok((path?.length ?? 0) > 4, '未选择低成本绕行');
        assert.ok(pathGrainCost(path!, (c) => (c.y === 0 ? 10 : 1)) < 40);
    });

    test('同成本时路径可复现', () => {
        const params = {
            start: new GridCoord(0, 0),
            goal: new GridCoord(3, 3),
            bounds: BOUNDS,
            costAt: flat(),
        };
        const first = findPath(params)?.map((c) => c.toKey());
        const second = findPath(params)?.map((c) => c.toKey());
        // neighbors() 顺序固定，保证结果稳定
        assert.deepEqual(first, second);
    });

    test('起点或终点越界返回 null', () => {
        assert.equal(
            findPath({
                start: new GridCoord(-1, 0),
                goal: new GridCoord(3, 3),
                bounds: BOUNDS,
                costAt: flat(),
            }),
            null,
        );
        assert.equal(
            findPath({
                start: new GridCoord(0, 0),
                goal: new GridCoord(99, 0),
                bounds: BOUNDS,
                costAt: flat(),
            }),
            null,
        );
    });

    test('路径不含起点，含终点', () => {
        const path = findPath({
            start: new GridCoord(0, 0),
            goal: new GridCoord(2, 0),
            bounds: BOUNDS,
            costAt: flat(),
        });
        assert.equal(path?.[0]?.toKey(), '1,0');
        assert.equal(path?.[path.length - 1]?.toKey(), '2,0');
    });

    test('零成本地形被优先利用', () => {
        // y=2 整行为已激活传送（成本 0）
        const costAt = (coord: GridCoord): number | null => (coord.y === 2 ? 0 : 5);
        const path = findPath({
            start: new GridCoord(0, 2),
            goal: new GridCoord(8, 2),
            bounds: BOUNDS,
            costAt,
        });
        assert.equal(pathGrainCost(path!, costAt as (c: GridCoord) => number), 0);
    });
});
