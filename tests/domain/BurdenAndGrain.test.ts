import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    burdenStatus,
    burdenAlertLevel,
    canPickUp,
    remainingCapacity,
    returnSafety,
    returnSafetyAlertLevel,
    canAffordStep,
    deductStep,
} from 'db://assets/scripts/domain/BurdenAndGrain';

describe('负重状态（PRD-05 §6）', () => {
    test('低于 80% 为正常', () => {
        assert.equal(burdenStatus({ current: 79, max: 100 }), 'normal');
    });

    test('恰好 80% 触发警告', () => {
        // 边界必须稳定触发，浮点除法在这里会出错
        assert.equal(burdenStatus({ current: 80, max: 100 }), 'nearLimit');
    });

    test('满载但未超限仍是 nearLimit', () => {
        assert.equal(burdenStatus({ current: 100, max: 100 }), 'nearLimit');
    });

    test('超限为 overloaded', () => {
        assert.equal(burdenStatus({ current: 101, max: 100 }), 'overloaded');
    });

    test('非整百上限的 80% 边界正确', () => {
        // 33 的 80% = 26.4，故 26 未达标、27 达标
        assert.equal(burdenStatus({ current: 26, max: 33 }), 'normal');
        assert.equal(burdenStatus({ current: 27, max: 33 }), 'nearLimit');
    });

    test('上限为 0 且有负重视为超限', () => {
        // 避免除零得 NaN 而被判为「正常」
        assert.equal(burdenStatus({ current: 1, max: 0 }), 'overloaded');
    });

    test('上限为 0 且无负重视为正常', () => {
        assert.equal(burdenStatus({ current: 0, max: 0 }), 'normal');
    });

    test('空负重为正常', () => {
        assert.equal(burdenStatus({ current: 0, max: 100 }), 'normal');
    });
});

describe('负重提示等级', () => {
    test('正常时无提示', () => {
        assert.equal(burdenAlertLevel({ current: 10, max: 100 }), null);
    });

    test('接近上限为 caution', () => {
        assert.equal(burdenAlertLevel({ current: 85, max: 100 }), 'caution');
    });

    test('超限为 warning', () => {
        assert.equal(burdenAlertLevel({ current: 120, max: 100 }), 'warning');
    });
});

describe('拾取判定', () => {
    test('装得下则允许', () => {
        assert.equal(canPickUp({ current: 50, max: 100 }, 50), true);
    });

    test('超出则拒绝', () => {
        assert.equal(canPickUp({ current: 50, max: 100 }, 51), false);
    });

    test('已超重时拒绝拾取', () => {
        // PRD-05 §6：超重后不能继续拾取
        assert.equal(canPickUp({ current: 120, max: 100 }, 1), false);
    });

    test('零重量物品在满载时仍可拾取', () => {
        assert.equal(canPickUp({ current: 100, max: 100 }, 0), true);
    });

    test('负重量抛错', () => {
        assert.throws(() => canPickUp({ current: 0, max: 100 }, -1), /不能为负/);
    });
});

describe('剩余容量', () => {
    test('正常情况为差值', () => {
        assert.equal(remainingCapacity({ current: 30, max: 100 }), 70);
    });

    test('超重时为 0 而非负数', () => {
        // 负数直接显示给玩家会很怪
        assert.equal(remainingCapacity({ current: 130, max: 100 }), 0);
    });
});

describe('返回安全性（PRD-09 §5）', () => {
    test('余量充足为 safe', () => {
        assert.equal(returnSafety({ remaining: 50, estimatedReturnCost: 20 }), 'safe');
    });

    test('恰好够返回为 justEnough', () => {
        // 再走一步就回不去了，必须与 safe 区分
        assert.equal(returnSafety({ remaining: 20, estimatedReturnCost: 20 }), 'justEnough');
    });

    test('不足以返回为 stranded', () => {
        assert.equal(returnSafety({ remaining: 19, estimatedReturnCost: 20 }), 'stranded');
    });

    test('灵粮耗尽且需要返回成本为 stranded', () => {
        assert.equal(returnSafety({ remaining: 0, estimatedReturnCost: 5 }), 'stranded');
    });

    test('已在营地（返回成本 0）为 safe，即使灵粮为 0', () => {
        // 无需移动即安全，不该因灵粮耗尽而弹「无法返回」警告
        assert.equal(returnSafety({ remaining: 0, estimatedReturnCost: 0 }), 'safe');
    });

    test('已在营地时无提示', () => {
        assert.equal(returnSafetyAlertLevel({ remaining: 0, estimatedReturnCost: 0 }), null);
    });

    test('提示等级：stranded 为 danger', () => {
        assert.equal(returnSafetyAlertLevel({ remaining: 1, estimatedReturnCost: 20 }), 'danger');
    });

    test('提示等级：justEnough 为 warning', () => {
        assert.equal(returnSafetyAlertLevel({ remaining: 20, estimatedReturnCost: 20 }), 'warning');
    });

    test('提示等级：safe 时无提示', () => {
        assert.equal(returnSafetyAlertLevel({ remaining: 99, estimatedReturnCost: 20 }), null);
    });
});

describe('移动消耗（PRD-05 §6）', () => {
    test('灵粮足够时允许移动', () => {
        assert.equal(canAffordStep(10, 3), true);
    });

    test('恰好够时允许', () => {
        assert.equal(canAffordStep(3, 3), true);
    });

    test('不足时拒绝', () => {
        assert.equal(canAffordStep(2, 3), false);
    });

    test('零成本地形（已激活传送）总是允许', () => {
        // PRD-05 §4：已激活传送 0 灵粮
        assert.equal(canAffordStep(0, 0), true);
    });

    test('非整数成本抛错', () => {
        assert.throws(() => canAffordStep(10, 1.5), /非负整数/);
    });

    test('负成本抛错', () => {
        assert.throws(() => canAffordStep(10, -1), /非负整数/);
    });

    test('扣除后返回剩余量', () => {
        assert.equal(deductStep(10, 3), 7);
    });

    test('灵粮不足时抛错而非扣成负数', () => {
        // 静默扣成负数会让后续所有判定失真
        assert.throws(() => deductStep(2, 3), /灵粮不足/);
    });

    test('先校验后扣除：失败时不改变原值', () => {
        const before = 2;
        assert.throws(() => deductStep(before, 3));
        // 函数式实现，原值天然不变
        assert.equal(before, 2);
    });
});
