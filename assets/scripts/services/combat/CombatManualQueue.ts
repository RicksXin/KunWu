import type { CombatSnapshot } from 'db://assets/scripts/domain/CombatState';

export interface CombatManualQueueState {
    readonly snapshot: CombatSnapshot;
    readonly autoUnitIds: ReadonlySet<number>;
    readonly manualReadyQueue: number[];
}

/**
 * 同一 tick 新就绪的修士按稳定 unitId 入队；跨 tick 严格保留先来后到顺序。
 * 已死亡、已切自动或已经完成行动的成员会从等待队列中移除。
 */
export function syncManualReadyQueue(state: CombatManualQueueState): void {
    const units = new Map(state.snapshot.units.map((unit) => [unit.unitId, unit]));
    const retained = state.manualReadyQueue.filter((unitId) => {
        const unit = units.get(unitId);
        return unit?.side === 'ally'
            && !unit.isDead
            && unit.actionTimer === 0
            && !state.autoUnitIds.has(unitId);
    });
    const queued = new Set(retained);
    const newlyReady = state.snapshot.units
        .filter((unit) => unit.side === 'ally' && !unit.isDead && unit.actionTimer === 0)
        .filter((unit) => !state.autoUnitIds.has(unit.unitId) && !queued.has(unit.unitId))
        .map((unit) => unit.unitId)
        .sort((left, right) => left - right);
    state.manualReadyQueue.splice(0, state.manualReadyQueue.length, ...retained, ...newlyReady);
}

export function readyManualAllyId(state: CombatManualQueueState): number | null {
    const unitId = state.manualReadyQueue[0];
    return unitId === undefined || state.autoUnitIds.has(unitId) ? null : unitId;
}

export function removeManualReadyUnit(state: CombatManualQueueState, unitId: number): void {
    const index = state.manualReadyQueue.indexOf(unitId);
    if (index >= 0) state.manualReadyQueue.splice(index, 1);
}
