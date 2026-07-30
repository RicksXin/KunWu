import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    solveViewport,
    toDesignInsets,
    contentRect,
    meetsTouchTarget,
    gridToPixelOffset,
    DESIGN_WIDTH,
    DESIGN_HEIGHT,
    PIXEL_REFERENCE_WIDTH,
    TILE_SOURCE_PIXELS,
    TILE_SCREEN_PIXELS,
    MIN_TOUCH_TARGET_DP,
    ZERO_INSETS,
} from 'db://assets/scripts/domain/ViewportLayout';

describe('设计画布常量自洽', () => {
    test('设计画布是像素参考画布的整数 3 倍（CLAUDE.md）', () => {
        assert.equal(DESIGN_WIDTH / PIXEL_REFERENCE_WIDTH, 3);
        assert.equal(DESIGN_HEIGHT / 640, 3);
    });

    test('Tile 屏幕尺寸等于源像素的 3 倍', () => {
        assert.equal(TILE_SOURCE_PIXELS * 3, TILE_SCREEN_PIXELS);
    });

    test('设计画布为 9:16 竖屏', () => {
        assert.equal(DESIGN_WIDTH / DESIGN_HEIGHT, 9 / 16);
    });
});

describe('solveViewport', () => {
    test('设计分辨率本身缩放为 1，像素倍数为 3', () => {
        const solution = solveViewport(DESIGN_WIDTH, DESIGN_HEIGHT);
        assert.equal(solution.designScale, 1);
        assert.equal(solution.pixelScale, 3);
        assert.equal(solution.tileScreenSize, TILE_SCREEN_PIXELS);
        assert.equal(solution.isBelowMinimum, false);
    });

    test('720×1280 在支持范围内，像素倍数为 2', () => {
        const solution = solveViewport(720, 1280);
        // 720/360 = 2，恰好整数倍
        assert.equal(solution.pixelScale, 2);
        assert.equal(solution.tileScreenSize, 32);
        assert.equal(solution.isBelowMinimum, false);
    });

    test('低于支持下界时标记出来', () => {
        assert.equal(solveViewport(540, 960).isBelowMinimum, true);
    });

    test('更瘦长的屏幕按宽度适配', () => {
        // 9:19.5 比 9:16 更瘦长
        const solution = solveViewport(1080, 2340);
        assert.equal(solution.fitMode, 'fitWidth');
        assert.equal(solution.designScale, 1);
    });

    test('更宽扁的屏幕按高度适配，避免左右被裁', () => {
        const solution = solveViewport(1200, 1920);
        assert.equal(solution.fitMode, 'fitHeight');
        assert.equal(solution.designScale, 1);
    });

    test('像素倍数始终为整数', () => {
        // 非整数倍分辨率也不得产生小数缩放，否则像素图会抖动
        for (const [width, height] of [
            [800, 1400],
            [900, 1500],
            [1000, 1777],
            [1125, 2436],
        ] as const) {
            const solution = solveViewport(width, height);
            assert.ok(
                Number.isInteger(solution.pixelScale),
                `${width}×${height} 得到非整数倍 ${solution.pixelScale}`,
            );
        }
    });

    test('像素倍数不小于 1', () => {
        // 极小视口宁可溢出也不做小于 1 的缩放
        assert.equal(solveViewport(100, 200).pixelScale, 1);
    });

    test('像素倍数向下取整而非四舍五入', () => {
        // 1070 宽 → 1070/360 = 2.97，必须取 2 而非 3，否则内容溢出
        const solution = solveViewport(1070, 1903);
        assert.equal(solution.pixelScale, 2);
    });

    test('非正尺寸抛错', () => {
        assert.throws(() => solveViewport(0, 100), /必须为正数/);
        assert.throws(() => solveViewport(100, -1), /必须为正数/);
    });
});

describe('安全区换算', () => {
    test('物理像素按 designScale 折算到设计画布', () => {
        const solution = solveViewport(540, 960);
        // designScale = 0.5，故 44 物理像素 = 88 设计像素
        const insets = toDesignInsets({ top: 44, bottom: 20, left: 0, right: 0 }, solution);
        assert.equal(insets.top, 88);
        assert.equal(insets.bottom, 40);
    });

    test('设计分辨率下换算为恒等', () => {
        const solution = solveViewport(DESIGN_WIDTH, DESIGN_HEIGHT);
        const physical = { top: 88, bottom: 40, left: 10, right: 10 };
        assert.deepEqual(toDesignInsets(physical, solution), physical);
    });
});

describe('contentRect', () => {
    test('无安全区时等于整个设计画布', () => {
        assert.deepEqual(contentRect(ZERO_INSETS), {
            x: 0,
            y: 0,
            width: DESIGN_WIDTH,
            height: DESIGN_HEIGHT,
        });
    });

    test('扣除刘海与底部横条', () => {
        const rect = contentRect({ top: 88, bottom: 40, left: 0, right: 0 });
        assert.equal(rect.y, 40);
        assert.equal(rect.height, DESIGN_HEIGHT - 128);
        assert.equal(rect.width, DESIGN_WIDTH);
    });

    test('原点在左下，左边距推进 x', () => {
        const rect = contentRect({ top: 0, bottom: 0, left: 30, right: 20 });
        assert.equal(rect.x, 30);
        assert.equal(rect.width, DESIGN_WIDTH - 50);
    });

    test('内边距过大时抛错而非返回负尺寸', () => {
        assert.throws(
            () => contentRect({ top: 1000, bottom: 1000, left: 0, right: 0 }),
            /内边距过大/,
        );
    });
});

describe('触控目标', () => {
    test('恰好 48×48 合规（PRD-09 §4）', () => {
        assert.equal(meetsTouchTarget(MIN_TOUCH_TARGET_DP, MIN_TOUCH_TARGET_DP), true);
    });

    test('任一边小于 48 即不合规', () => {
        assert.equal(meetsTouchTarget(47, 60), false);
        assert.equal(meetsTouchTarget(60, 47), false);
    });
});

describe('格子 → 像素', () => {
    test('默认按 48 像素换算', () => {
        assert.deepEqual(gridToPixelOffset(2, 3), { x: 96, y: 144 });
    });

    test('原点格偏移为零', () => {
        assert.deepEqual(gridToPixelOffset(0, 0), { x: 0, y: 0 });
    });

    test('可按当前视口的 tileScreenSize 换算', () => {
        const solution = solveViewport(720, 1280);
        assert.deepEqual(gridToPixelOffset(2, 1, solution.tileScreenSize), { x: 64, y: 32 });
    });

    test('非整数格子坐标抛错（技术方案 §9.1）', () => {
        // 像素坐标误传进格子 API 是此处要拦住的错误
        assert.throws(() => gridToPixelOffset(1.5, 0), /必须为整数/);
    });
});
