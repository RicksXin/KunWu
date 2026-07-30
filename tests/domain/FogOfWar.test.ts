import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FogMap, visionRadiusFor, VISION_RADIUS_BY_LAMP_LEVEL } from 'db://assets/scripts/domain/FogOfWar';
import { GridCoord } from 'db://assets/scripts/domain/GridCoord';
import { BASE_VISION_RADIUS } from 'db://assets/scripts/domain/MapTypes';

describe('视野半径（PRD-05 §5）', () => {
    test('基础半径为 2', () => {
        assert.equal(visionRadiusFor(0), BASE_VISION_RADIUS);
        assert.equal(BASE_VISION_RADIUS, 2);
    });

    test('探灵灯升级为 3/4/5', () => {
        assert.equal(visionRadiusFor(1), 3);
        assert.equal(visionRadiusFor(2), 4);
        assert.equal(visionRadiusFor(3), 5);
    });

    test('超出等级取最大档而非报错', () => {
        const max = VISION_RADIUS_BY_LAMP_LEVEL[VISION_RADIUS_BY_LAMP_LEVEL.length - 1];
        assert.equal(visionRadiusFor(99), max);
    });

    test('负等级抛错', () => {
        assert.throws(() => visionRadiusFor(-1), /不能为负/);
    });
});

describe('迷雾状态机（PRD-05 §5）', () => {
    test('初始全为 UNKNOWN', () => {
        const fog = new FogMap(10, 10);
        assert.equal(fog.stateAt(new GridCoord(5, 5)), 'UNKNOWN');
        assert.equal(fog.discoveredCount, 0);
    });

    test('揭示后中心为 VISIBLE', () => {
        const fog = new FogMap(10, 10);
        fog.revealAround(new GridCoord(5, 5), 2);
        assert.equal(fog.stateAt(new GridCoord(5, 5)), 'VISIBLE');
    });

    test('离开后从 VISIBLE 退回 DISCOVERED', () => {
        const fog = new FogMap(20, 20);
        const first = new GridCoord(5, 5);
        fog.revealAround(first, 2);
        assert.equal(fog.stateAt(first), 'VISIBLE');

        // 走到远处，原位置不再可见但仍已探明
        fog.revealAround(new GridCoord(15, 15), 2);
        assert.equal(fog.stateAt(first), 'DISCOVERED');
    });

    test('已探明的格永不退回 UNKNOWN', () => {
        const fog = new FogMap(20, 20);
        const seen = new GridCoord(3, 3);
        fog.revealAround(seen, 1);
        for (let i = 0; i < 5; i += 1) {
            fog.revealAround(new GridCoord(15 + i % 3, 15), 2);
        }
        // 地形与已发现 POI 应保持可见
        assert.notEqual(fog.stateAt(seen), 'UNKNOWN');
    });
});

describe('整数圆视野', () => {
    test('半径 2 时 dx²+dy² <= 4 的格可见', () => {
        const fog = new FogMap(20, 20);
        const center = new GridCoord(10, 10);
        fog.revealAround(center, 2);

        // (2,0) → 4 <= 4，可见
        assert.equal(fog.stateAt(new GridCoord(12, 10)), 'VISIBLE');
        // (1,1) → 2 <= 4，可见
        assert.equal(fog.stateAt(new GridCoord(11, 11)), 'VISIBLE');
        // (2,2) → 8 > 4，不可见
        assert.equal(fog.stateAt(new GridCoord(12, 12)), 'UNKNOWN');
    });

    test('半径 0 只揭示自身', () => {
        const fog = new FogMap(10, 10);
        fog.revealAround(new GridCoord(5, 5), 0);
        assert.equal(fog.visibleCount, 1);
    });

    test('半径 1 揭示十字五格', () => {
        const fog = new FogMap(10, 10);
        fog.revealAround(new GridCoord(5, 5), 1);
        // 中心 + 四方向；斜向 dx²+dy²=2 > 1 故不含
        assert.equal(fog.visibleCount, 5);
    });

    test('边界处不越界，只揭示地图内的格', () => {
        const fog = new FogMap(5, 5);
        fog.revealAround(new GridCoord(0, 0), 2);
        // 角落：只有 (0,0)(1,0)(2,0)(0,1)(1,1)(0,2) 六格在圆内且在界内
        assert.equal(fog.visibleCount, 6);
    });

    test('负半径抛错', () => {
        const fog = new FogMap(10, 10);
        assert.throws(() => fog.revealAround(new GridCoord(5, 5), -1), /非负整数/);
    });

    test('非整数半径抛错', () => {
        const fog = new FogMap(10, 10);
        assert.throws(() => fog.revealAround(new GridCoord(5, 5), 2.5), /非负整数/);
    });
});

describe('存档往返', () => {
    test('导出后恢复保持已探明格', () => {
        const fog = new FogMap(20, 20);
        fog.revealAround(new GridCoord(5, 5), 2);
        fog.revealAround(new GridCoord(10, 10), 2);
        const keys = fog.toRevealedKeys();

        const restored = FogMap.fromRevealed(20, 20, keys);
        assert.equal(restored.discoveredCount, fog.discoveredCount);
        // 恢复后为 DISCOVERED——VISIBLE 是当前视野，不该持久化
        assert.equal(restored.stateAt(new GridCoord(5, 5)), 'DISCOVERED');
    });

    test('导出键已排序，保证存档内容稳定', () => {
        const fog = new FogMap(20, 20);
        fog.revealAround(new GridCoord(10, 10), 2);
        const keys = fog.toRevealedKeys();
        assert.deepEqual(keys, [...keys].sort());
    });

    test('空迷雾图导出为空数组', () => {
        assert.deepEqual(new FogMap(5, 5).toRevealedKeys(), []);
    });
});

describe('尺寸校验', () => {
    test('非正尺寸抛错', () => {
        assert.throws(() => new FogMap(0, 10), /正整数/);
        assert.throws(() => new FogMap(10, -1), /正整数/);
    });

    test('非整数尺寸抛错', () => {
        assert.throws(() => new FogMap(10.5, 10), /正整数/);
    });

    test('inBounds 正确判定边界', () => {
        const fog = new FogMap(10, 10);
        assert.equal(fog.inBounds(new GridCoord(0, 0)), true);
        assert.equal(fog.inBounds(new GridCoord(9, 9)), true);
        assert.equal(fog.inBounds(new GridCoord(10, 0)), false);
        assert.equal(fog.inBounds(new GridCoord(-1, 0)), false);
    });
});
