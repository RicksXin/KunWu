/**
 * 灵粮与负重判定（PRD-05 §6、PRD-09 §6、任务 P0-HALL-001）。
 *
 * 纯计算、无引擎依赖。资源栏与地图 HUD 的常驻显示都从这里取值，
 * 避免同一规则在多处各写一遍导致数字不一致。
 *
 * 整数域计算（技术方案 §7）：负重与灵粮都用整数，
 * 百分比比较用乘法而非除法，避免浮点误差让 80% 阈值时而触发时而不触发。
 */

import type { AlertLevel } from './AlertLevel';

/** 负重警告阈值，百分比分子（PRD-05 §6：负重 80% 显示警告）。 */
export const BURDEN_WARNING_NUMERATOR = 80;
export const BURDEN_WARNING_DENOMINATOR = 100;

export interface BurdenState {
    /** 当前负重。 */
    readonly current: number;
    /** 负重上限。由力道、肉身与储物法器决定（PRD-05 §6）。 */
    readonly max: number;
}

export type BurdenStatus =
    /** 低于警告阈值。 */
    | 'normal'
    /** 达到或超过 80% 但未超限。 */
    | 'nearLimit'
    /** 已超限：不能继续拾取，但可移动、丢弃和返回。 */
    | 'overloaded';

/**
 * 判定负重状态。
 *
 * 用 current * 100 >= max * 80 而非 current / max >= 0.8：
 * 后者在 max 为 0 时得 NaN，且浮点比较在边界值上不可靠。
 */
export function burdenStatus(state: BurdenState): BurdenStatus {
    if (state.max <= 0) {
        // 上限为 0 时任何负重都算超限，避免除零与「无限装载」
        return state.current > 0 ? 'overloaded' : 'normal';
    }
    if (state.current > state.max) {
        return 'overloaded';
    }
    if (state.current * BURDEN_WARNING_DENOMINATOR >= state.max * BURDEN_WARNING_NUMERATOR) {
        return 'nearLimit';
    }
    return 'normal';
}

export function burdenAlertLevel(state: BurdenState): AlertLevel | null {
    switch (burdenStatus(state)) {
        case 'overloaded':
            return 'warning';
        case 'nearLimit':
            return 'caution';
        default:
            return null;
    }
}

/** 能否继续拾取。超重后禁止拾取，但不禁止移动（PRD-05 §6）。 */
export function canPickUp(state: BurdenState, itemWeight: number): boolean {
    if (itemWeight < 0) {
        throw new Error(`物品重量不能为负，收到 ${itemWeight}`);
    }
    return state.current + itemWeight <= state.max;
}

/** 剩余可装载重量。超重时为 0 而非负数，便于直接显示。 */
export function remainingCapacity(state: BurdenState): number {
    return Math.max(0, state.max - state.current);
}

export interface GrainState {
    /** 剩余灵粮。既是补给也是步数（PRD-00 §2）。 */
    readonly remaining: number;
    /** 按最短路径返回营地所需的估算灵粮（PRD-05 §6）。 */
    readonly estimatedReturnCost: number;
}

export type ReturnSafety =
    /** 灵粮足够返回，且还有余量继续探索。 */
    | 'safe'
    /** 恰好够返回，再走一步就回不去了。 */
    | 'justEnough'
    /** 已不足以返回。 */
    | 'stranded';

/**
 * 能否安全返回（PRD-09 §5：「无法安全返回」是关键提示之一）。
 *
 * 这是本作最容易让玩家吃亏的机制——走太远回不去会全灭并遗失战利品，
 * 所以判定必须明确区分「恰好够」与「有余量」，让 UI 能提前警告。
 */
export function returnSafety(state: GrainState): ReturnSafety {
    // 返回成本为 0 表示已在营地，无需移动即安全，不该弹警告
    if (state.estimatedReturnCost === 0) {
        return 'safe';
    }
    if (state.remaining < state.estimatedReturnCost) {
        return 'stranded';
    }
    if (state.remaining === state.estimatedReturnCost) {
        return 'justEnough';
    }
    return 'safe';
}

export function returnSafetyAlertLevel(state: GrainState): AlertLevel | null {
    switch (returnSafety(state)) {
        case 'stranded':
            return 'danger';
        case 'justEnough':
            return 'warning';
        default:
            return null;
    }
}

/**
 * 有粮阶段是否足以完整支付一步地形成本。
 * 断粮衰竭移动由 Movement 统一结算，不能仅用本函数决定是否可移动。
 */
export function canAffordStep(remainingGrain: number, moveCost: number): boolean {
    if (!Number.isInteger(moveCost) || moveCost < 0) {
        throw new Error(`移动成本必须为非负整数，收到 ${moveCost}`);
    }
    return remainingGrain >= moveCost;
}

/** 扣除移动消耗。不足时抛错——静默扣成负数会让后续判定全部失真。 */
export function deductStep(remainingGrain: number, moveCost: number): number {
    if (!canAffordStep(remainingGrain, moveCost)) {
        throw new Error(`灵粮不足：剩余 ${remainingGrain}，需要 ${moveCost}`);
    }
    return remainingGrain - moveCost;
}
