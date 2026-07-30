/**
 * 可信时间与离线结算（技术方案 §4.1、§7）。
 *
 * 职责边界：只提供时间和有效秒数，不直接发奖励。
 * 产量计算由 CampState 的结算逻辑负责。
 */

/** 系统时间倒退超过此阈值即暂停离线收益（技术方案 §7）。 */
export const CLOCK_ROLLBACK_TOLERANCE_SECONDS = 5 * 60;

/** Demo 4 小时，建筑升级后 8 小时（策划案 §5.4、PRD-02）。 */
export const OFFLINE_CAP_SECONDS_DEMO = 4 * 60 * 60;
export const OFFLINE_CAP_SECONDS_UPGRADED = 8 * 60 * 60;

export interface SettlementWindow {
    /** 参与结算的有效秒数，已按离线上限截断。 */
    readonly effectiveSeconds: number;
    /** 检测到时间倒退时为 true，此时 effectiveSeconds 为 0。 */
    readonly clockRolledBack: boolean;
    /** 因超出上限而被丢弃的秒数，用于向玩家说明。 */
    readonly discardedSeconds: number;
}

export class TimeService {
    /** 单调递增的本地时钟读数，单位秒。Demo 阶段使用本地 UTC。 */
    nowUtcSeconds(): number {
        return Math.floor(Date.now() / 1000);
    }

    /**
     * 计算结算窗口（技术方案 §7）：
     *   有效秒数 = clamp(当前可信时间 - 上次结算时间, 0, 离线上限)
     *
     * 时间倒退超过容差时返回 clockRolledBack，调用方应暂停收益并提示玩家，
     * 避免改系统时间无限刷资源。
     */
    computeSettlementWindow(
        lastSettledAtUtc: number,
        capSeconds: number,
        nowUtc: number = this.nowUtcSeconds(),
    ): SettlementWindow {
        const rawDelta = nowUtc - lastSettledAtUtc;

        if (rawDelta < -CLOCK_ROLLBACK_TOLERANCE_SECONDS) {
            return { effectiveSeconds: 0, clockRolledBack: true, discardedSeconds: 0 };
        }

        // 小幅倒退按 0 处理，不视为作弊（NTP 校正、休眠唤醒等正常抖动）
        const delta = Math.max(0, rawDelta);
        const effectiveSeconds = Math.min(delta, capSeconds);

        return {
            effectiveSeconds,
            clockRolledBack: false,
            discardedSeconds: delta - effectiveSeconds,
        };
    }
}
