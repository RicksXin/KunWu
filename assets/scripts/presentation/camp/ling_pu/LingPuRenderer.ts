import { P1_LING_PU_JOBS } from 'db://assets/scripts/domain/LingPu';
import type {
    LingPuTimerViewModel,
    LingPuViewModel,
} from 'db://assets/scripts/services/camp/CampApplicationModels';
import {
    formatSeconds,
    RESOURCE_NAMES,
    RESOURCE_ROW_DEFINITIONS,
    setText,
} from './LingPuViewTypes';
import type { ConfirmationMode, LingPuView } from './LingPuViewTypes';

export function renderLingPuPanel(
    view: LingPuView,
    model: LingPuViewModel,
    confirmationMode: ConfirmationMode | null,
    confirmationLocked: boolean,
): void {
    view.titleLabel.string = '灵源院';
    view.idleWorkerLabel.string = `闲置杂役： ${model.workerIdle}`;
    for (const job of P1_LING_PU_JOBS) {
        const row = view.rows.get(job);
        const resource = model.resources[job];
        if (!row) continue;
        row.renderActive({
            stock: resource.stock,
            capacity: resource.capacity,
            workerCount: resource.workerCount,
            workerLimit: resource.workerLimit,
            displayedProduction: resource.displayedProduction,
            isFull: resource.isFull,
            isShutdown: resource.isShutdown,
            hasIdleWorker: model.workerIdle > 0,
            isMaxLevel: resource.upgrade.isMaxLevel,
        });
    }
    for (const definition of RESOURCE_ROW_DEFINITIONS) {
        if (!definition.job) view.rows.get(definition.id)?.renderLocked();
    }
    renderLingPuConfirmation(
        view,
        model,
        confirmationMode,
        confirmationLocked,
    );
}

export function renderLingPuTimer(
    view: LingPuView,
    timer: LingPuTimerViewModel,
): void {
    view.timerLabel.string = `距下次结算 ${formatSeconds(timer.secondsUntilNextCycle)}`;
    view.progressFill.fillRange = timer.cycleProgress;
}

export function renderLingPuConfirmation(
    view: LingPuView,
    model: LingPuViewModel,
    mode: ConfirmationMode | null,
    locked: boolean,
): void {
    if (!view.confirmationRoot.active || !mode) return;
    if (mode.kind === 'recruit') {
        const recruit = model.recruit;
        setText(view.confirmationTitle, '招募杂役');
        setText(
            view.confirmationMessage,
            `消耗灵粮 ${recruit.spiritGrainCost}（当前 ${model.resources.spiritGrain.stock}）`,
        );
        setText(view.confirmationDetail, `招募 ${recruit.workersGranted} 名杂役`);
        setText(view.confirmationError, recruit.canAfford ? '' : '灵粮不足，无法招募');
        view.confirmationIcon.spriteFrame = view.resourceIconFrames.get('spiritGrain') ?? null;
        view.confirmationPrimary.button.interactable = recruit.canAfford && !locked;
        if (view.confirmationPrimary.label) view.confirmationPrimary.label.string = '招募';
        return;
    }
    const resource = model.resources[mode.job];
    const preview = resource.upgrade;
    const cost = preview.spiritWoodCost ?? 0;
    setText(view.confirmationTitle, `${RESOURCE_NAMES[mode.job]}储量升级`);
    setText(
        view.confirmationMessage,
        `消耗灵木 ${cost}（当前 ${model.resources.spiritWood.stock}）`,
    );
    setText(
        view.confirmationDetail,
        preview.nextCapacity === null
            ? `当前最大储量 ${preview.currentCapacity}，已达最高等级`
            : `最大储量 ${preview.currentCapacity} → ${preview.nextCapacity}`,
    );
    setText(
        view.confirmationError,
        preview.isMaxLevel
            ? '已达当前版本最高等级'
            : preview.canAfford ? '' : '灵木不足，无法升级',
    );
    view.confirmationIcon.spriteFrame = view.resourceIconFrames.get('spiritWood') ?? null;
    view.confirmationPrimary.button.interactable =
        preview.canAfford && !preview.isMaxLevel && !locked;
    if (view.confirmationPrimary.label) view.confirmationPrimary.label.string = '升级';
}
