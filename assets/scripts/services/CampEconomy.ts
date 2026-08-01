/**
 * 营地经济结算编排（PRD-02 §6、任务 P1-ECO-002）。
 *
 * 职责边界：把「何时结算」与「怎么算」接起来。
 * 产量公式在 domain/Production（37 测），时间窗口在 TimeService（4 测），
 * 本类只负责触发时机与顺序。
 *
 * 三个触发点（PRD-02 §6）：进入营地、修改岗位、退出页面。
 * 浏览器后台不算退出，恢复时统一结算——AppRoot 已广播 app.hide/app.show。
 *
 * **先按旧岗位结算，再应用新分配**（PRD-02 §6）。顺序反了等于让玩家
 * 用新岗位追溯领取旧时段的产出，是可被利用的刷资源手段。
 */

import type {
    ProductionJob,
    ProductionStorageCaps,
    WorkerAssignment,
    SettlementOutput,
} from '../domain/Production';
import {
    BASE_CYCLE_SECONDS,
    settleProduction,
    applyYields,
    grainUpkeepPerCycle,
} from '../domain/Production';
import type { SettlementWindow } from './TimeService';

/** P1 不结算离线（PRD-02 §6）。P2 起放开到 4 小时。 */
export const P1_OFFLINE_CAP_SECONDS = 0;

export type ResourceStock = Record<ProductionJob, number>;

export interface CampEconomyState {
    readonly stock: ResourceStock;
    readonly assignment: WorkerAssignment;
    readonly storageCaps?: ProductionStorageCaps;
    /** 上次结算的 UTC 秒。 */
    readonly lastSettledAtUtc: number;
}

export interface SettleResult {
    readonly state: CampEconomyState;
    readonly output: SettlementOutput;
    /** 时钟倒退导致本次跳过结算（PRD-02 §6：倒退超 5 分钟暂停并提示）。 */
    readonly clockRolledBack: boolean;
    /** 因超出离线上限被丢弃的秒数，用于向玩家说明。 */
    readonly discardedSeconds: number;
}

export interface CampEconomyDeps {
    /** 由 TimeService.computeSettlementWindow 提供。 */
    readonly computeWindow: (lastSettledAtUtc: number, capSeconds: number) => SettlementWindow;
    readonly nowUtcSeconds: () => number;
    /** 离线上限。P1 为 0，P2 起为 4 小时。 */
    readonly offlineCapSeconds?: number;
    /** 生产周期，可被建筑升级缩短。 */
    readonly cycleSeconds?: number;
    readonly outputBonusPercent?: number;
}

function zeroOutput(): SettlementOutput {
    return {
        yields: {
            spiritGrain: 0,
            spiritWood: 0,
            darkIron: 0,
            spiritStone: 0,
            gengJing: 0,
        },
        cycles: 0,
        shutdownJobs: [],
        grainUpkeepSpent: 0,
        netGrainChange: 0,
    };
}

export class CampEconomy {
    private readonly deps: CampEconomyDeps;

    constructor(deps: CampEconomyDeps) {
        this.deps = deps;
    }

    /**
     * 结算至当前时刻。
     *
     * 时钟倒退时返回原状态并标记——不能静默按 0 处理，
     * 玩家需要知道为何没有收益（PRD-02 §6）。
     */
    settle(state: CampEconomyState): SettleResult {
        const cap = this.deps.offlineCapSeconds ?? P1_OFFLINE_CAP_SECONDS;
        const window = this.deps.computeWindow(state.lastSettledAtUtc, cap);

        if (window.clockRolledBack) {
            return {
                state,
                output: zeroOutput(),
                clockRolledBack: true,
                discardedSeconds: 0,
            };
        }

        const output = settleProduction({
            assignment: state.assignment,
            effectiveSeconds: window.effectiveSeconds,
            grainStock: state.stock.spiritGrain,
            cycleSeconds: this.deps.cycleSeconds,
            outputBonusPercent: this.deps.outputBonusPercent,
        });

        const cycleSeconds = this.deps.cycleSeconds ?? BASE_CYCLE_SECONDS;
        const nextSettledAt =
            window.discardedSeconds > 0
                ? this.deps.nowUtcSeconds()
                : state.lastSettledAtUtc + output.cycles * cycleSeconds;

        return {
            state: {
                stock: applyYields(state.stock, output, state.storageCaps),
                assignment: state.assignment,
                storageCaps: state.storageCaps,
                // 只推进已经完成的周期，保留不足 30 秒的进度。
                // 超出离线上限的时长则整体丢弃并锚定当前时刻，避免分批领取。
                lastSettledAtUtc: nextSettledAt,
            },
            output,
            clockRolledBack: false,
            discardedSeconds: window.discardedSeconds,
        };
    }

    /**
     * 修改岗位分配（PRD-02 §6：先按旧岗位结算，再应用新分配）。
     *
     * 这个顺序是防刷的关键：若先换岗位再结算，
     * 玩家可以把人全调到庚精岗再触发结算，用 30 秒的时间领取高价资源。
     */
    reassign(state: CampEconomyState, next: WorkerAssignment): SettleResult {
        const settled = this.settle(state);
        return {
            ...settled,
            state: { ...settled.state, assignment: next },
        };
    }

    /** 当前配置下每周期的灵粮维护，供 UI 显示收支预览。 */
    upkeepPerCycle(state: CampEconomyState): number {
        return grainUpkeepPerCycle(state.assignment);
    }
}
