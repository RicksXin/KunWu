import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    TimeService,
    OFFLINE_CAP_SECONDS_DEMO,
    CLOCK_ROLLBACK_TOLERANCE_SECONDS,
} from '../../assets/scripts/services/TimeService.ts';

describe('TimeService.computeSettlementWindow', () => {
    const service = new TimeService();
    const cap = OFFLINE_CAP_SECONDS_DEMO;

    test('正常经过时间按实际秒数结算', () => {
        const window = service.computeSettlementWindow(1000, cap, 1000 + 600);
        assert.equal(window.effectiveSeconds, 600);
        assert.equal(window.clockRolledBack, false);
        assert.equal(window.discardedSeconds, 0);
    });

    test('超过离线上限的部分被截断并记录', () => {
        const elapsed = cap + 3600;
        const window = service.computeSettlementWindow(0, cap, elapsed);
        assert.equal(window.effectiveSeconds, cap);
        assert.equal(window.discardedSeconds, 3600);
    });

    test('时间倒退超过容差时暂停收益', () => {
        const now = 1000;
        const lastSettled = now + CLOCK_ROLLBACK_TOLERANCE_SECONDS + 1;
        const window = service.computeSettlementWindow(lastSettled, cap, now);
        // 技术方案 §7：防止改系统时间无限刷资源
        assert.equal(window.clockRolledBack, true);
        assert.equal(window.effectiveSeconds, 0);
    });

    test('容差内的小幅倒退按 0 处理而非报错', () => {
        const now = 1000;
        const window = service.computeSettlementWindow(now + 60, cap, now);
        // NTP 校正、休眠唤醒等正常抖动不应触发作弊提示
        assert.equal(window.clockRolledBack, false);
        assert.equal(window.effectiveSeconds, 0);
    });
});
