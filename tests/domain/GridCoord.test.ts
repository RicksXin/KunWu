import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GridCoord } from '../../assets/scripts/domain/GridCoord.ts';

describe('GridCoord', () => {
    test('拒绝非整数坐标', () => {
        assert.throws(() => new GridCoord(1.5, 2), /只接受整数/);
        assert.throws(() => new GridCoord(1, NaN), /只接受整数/);
    });

    test('四方向相邻，斜向不算相邻', () => {
        const origin = new GridCoord(3, 3);
        assert.equal(origin.isAdjacentTo(new GridCoord(3, 4)), true);
        assert.equal(origin.isAdjacentTo(new GridCoord(4, 3)), true);
        // 技术方案 §9.1：不允许斜走
        assert.equal(origin.isAdjacentTo(new GridCoord(4, 4)), false);
        assert.equal(origin.isAdjacentTo(origin), false);
    });

    test('视野整数圆 dx² + dy² <= radius²', () => {
        const center = new GridCoord(0, 0);
        const radius = 2;
        const r2 = radius * radius;

        // 半径 2 时 (1,1) 在圆内（2 <= 4），(2,2) 在圆外（8 > 4）
        assert.equal(center.squaredDistanceTo(new GridCoord(1, 1)) <= r2, true);
        assert.equal(center.squaredDistanceTo(new GridCoord(2, 2)) <= r2, false);
        // 正轴向边界恰好落在圆上
        assert.equal(center.squaredDistanceTo(new GridCoord(2, 0)) <= r2, true);
    });

    test('key 往返转换保持相等', () => {
        const coord = new GridCoord(-7, 12);
        const restored = GridCoord.fromKey(coord.toKey());
        assert.equal(restored.equals(coord), true);
        assert.throws(() => GridCoord.fromKey('1,2,3'), /非法 GridCoord key/);
    });

    test('邻格顺序固定，保证遍历可复现', () => {
        const keys = new GridCoord(0, 0).neighbors().map((c) => c.toKey());
        assert.deepEqual(keys, ['0,1', '1,0', '0,-1', '-1,0']);
    });
});
