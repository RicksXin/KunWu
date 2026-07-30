import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    EntryActivationGate,
    PANORAMA_CLICK_DEBOUNCE_MS,
    PanoramaPositionMemory,
    advanceDragGesture,
    clampPanoramaX,
    initialPanoramaX,
    panoramaBounds,
    stepPanoramaInertia,
} from 'db://assets/scripts/domain/HallPanorama';

describe('营地全景边界与默认位置', () => {
    test('2.8 屏内容默认停在中部', () => {
        const bounds = panoramaBounds(1080, 3024);
        assert.deepEqual(bounds, { minX: -972, maxX: 972, scrollable: true });
        assert.equal(initialPanoramaX(null, bounds), 0);
    });

    test('从子页面返回时恢复离开前位置', () => {
        const bounds = panoramaBounds(1080, 3024);
        const memory = new PanoramaPositionMemory();
        memory.remember(-620, bounds);
        memory.requestRestore();
        assert.equal(memory.takeInitialX(bounds), -620);
        // 恢复请求只消费一次，下次普通进入回中部。
        assert.equal(memory.takeInitialX(bounds), 0);
        memory.reset();
        assert.equal(memory.takeInitialX(bounds), 0);
    });

    test('视口改变后恢复值会被新边界夹取', () => {
        const oldBounds = panoramaBounds(720, 3024);
        const memory = new PanoramaPositionMemory();
        memory.remember(1260, oldBounds);
        memory.requestRestore();
        assert.equal(memory.takeInitialX(panoramaBounds(1080, 2160)), 540);
    });

    test('内容不足一屏时居中并禁止横滑', () => {
        const bounds = panoramaBounds(1080, 900);
        assert.deepEqual(bounds, { minX: 0, maxX: 0, scrollable: false });
        assert.equal(clampPanoramaX(500, bounds), 0);
    });
});

describe('12dp 点击取消阈值', () => {
    test('累计位移恰好 12dp 仍是点击', () => {
        const gesture = advanceDragGesture(
            advanceDragGesture({ distanceDp: 0, isDragging: false }, 7),
            -5,
        );
        assert.equal(gesture.distanceDp, 12);
        assert.equal(gesture.isDragging, false);
    });

    test('累计位移超过 12dp 后取消点击', () => {
        const gesture = advanceDragGesture(
            advanceDragGesture({ distanceDp: 0, isDragging: false }, 8),
            -5,
        );
        assert.equal(gesture.distanceDp, 13);
        assert.equal(gesture.isDragging, true);
    });
});

describe('连续惯性与边界', () => {
    test('惯性不做分页吸附', () => {
        const bounds = panoramaBounds(1080, 3024);
        const step = stepPanoramaInertia(-217, -600, 1 / 60, bounds);
        assert.ok(step.x < -217);
        assert.notEqual(step.x, -972);
        assert.ok(Math.abs(step.velocity) < 600);
    });

    test('到边界后停止，不露空白', () => {
        const bounds = panoramaBounds(1080, 3024);
        assert.deepEqual(stepPanoramaInertia(-962, -1200, 1 / 60, bounds), {
            x: -972,
            velocity: 0,
        });
    });
});

describe('快速重复点击保护', () => {
    test('同一入口在冷却期内只响应一次', () => {
        const gate = new EntryActivationGate();
        assert.equal(gate.tryActivate('yi_shi_dian', 1000), true);
        assert.equal(gate.tryActivate('yi_shi_dian', 1001), false);
        assert.equal(
            gate.tryActivate('yi_shi_dian', 1000 + PANORAMA_CLICK_DEBOUNCE_MS),
            true,
        );
    });

    test('不同入口不共用冷却', () => {
        const gate = new EntryActivationGate();
        assert.equal(gate.tryActivate('yi_shi_dian', 1000), true);
        assert.equal(gate.tryActivate('ling_pu', 1001), true);
    });
});
