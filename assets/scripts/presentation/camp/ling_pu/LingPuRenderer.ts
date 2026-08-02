import type { AppRoot } from 'db://assets/scripts/AppRoot';
import {
    P1_LING_PU_JOBS,
    storageCapacity,
} from 'db://assets/scripts/domain/LingPu';
import type { LingPuConfig, P1LingPuJob } from 'db://assets/scripts/domain/LingPu';
import {
    createAssignment,
    grainUpkeepPerCycle,
    JOB_RATES,
    resolveShutdown,
    totalWorkers,
} from 'db://assets/scripts/domain/Production';
import type { Profile } from 'db://assets/scripts/services/GameState';
import {
    formatSeconds,
    RESOURCE_NAMES,
    RESOURCE_ROW_DEFINITIONS,
    setText,
} from './LingPuViewTypes';
import type { ConfirmationMode, LingPuView } from './LingPuViewTypes';

export interface LingPuRenderContext {
    readonly app: AppRoot;
    readonly profile: Profile;
    readonly config: LingPuConfig;
}

export function renderLingPuPanel(
    view: LingPuView,
    context: LingPuRenderContext,
    confirmationMode: ConfirmationMode | null,
    confirmationLocked: boolean,
): void {
    const { app, profile, config } = context;
    const assignment = createAssignment(profile.camp.workerAssignments);
    const assigned = totalWorkers(assignment);
    const idle = Math.max(0, profile.camp.workerCount - assigned);
    const grainProduced = assignment.spiritGrain * JOB_RATES.spiritGrain.outputPerWorker;
    const netGrain = grainProduced - grainUpkeepPerCycle(assignment);
    const shutdownJobs = resolveShutdown(assignment, profile.wallet.spiritGrain + grainProduced)
        .filter((job): job is P1LingPuJob => P1_LING_PU_JOBS.includes(job as P1LingPuJob));
    for (const job of P1_LING_PU_JOBS) {
        const row = view.rows.get(job);
        if (!row) continue;
        const stock = profile.wallet[job];
        const capacity = storageCapacity(profile.camp.resourceStorageLevels, job, config);
        const upgrade = app.lingPu.previewUpgrade(profile, config, job);
        row.renderActive({
            stock,
            capacity,
            workerCount: assignment[job],
            workerLimit: assignment[job] + idle,
            displayedProduction: job === 'spiritGrain'
                ? netGrain
                : assignment[job] * JOB_RATES[job].outputPerWorker,
            isFull: stock >= capacity,
            isShutdown: shutdownJobs.includes(job),
            hasIdleWorker: idle > 0,
            isMaxLevel: upgrade.isMaxLevel,
        });
    }
    for (const definition of RESOURCE_ROW_DEFINITIONS) {
        if (!definition.job) view.rows.get(definition.id)?.renderLocked();
    }
    renderLingPuTimer(view, context);
    renderLingPuConfirmation(view, context, confirmationMode, confirmationLocked);
}

export function renderLingPuTimer(view: LingPuView, context: LingPuRenderContext): void {
    const seconds = context.app.lingPu.secondsUntilNextCycle(context.profile);
    view.timerLabel.string = `距下次结算 ${formatSeconds(seconds)}`;
    view.progressFill.fillRange = context.app.lingPu.cycleProgress(context.profile);
}

export function renderLingPuConfirmation(
    view: LingPuView,
    context: LingPuRenderContext,
    mode: ConfirmationMode | null,
    locked: boolean,
): void {
    if (!view.confirmationRoot.active || !mode) return;
    const { app, profile, config } = context;
    if (mode.kind === 'recruit') {
        const cost = config.recruitSpiritGrainCost;
        const affordable = profile.wallet.spiritGrain >= cost;
        setText(view.confirmationTitle, '招募杂役');
        setText(view.confirmationMessage, `消耗灵粮 ${cost}（当前 ${profile.wallet.spiritGrain}）`);
        setText(view.confirmationDetail, `招募 ${config.workersPerRecruit} 名杂役`);
        setText(view.confirmationError, affordable ? '' : '灵粮不足，无法招募');
        view.confirmationIcon.spriteFrame = view.resourceIconFrames.get('spiritGrain') ?? null;
        view.confirmationPrimary.button.interactable = affordable && !locked;
        if (view.confirmationPrimary.label) view.confirmationPrimary.label.string = '招募';
        return;
    }
    const preview = app.lingPu.previewUpgrade(profile, config, mode.job);
    const cost = preview.spiritWoodCost ?? 0;
    setText(view.confirmationTitle, `${RESOURCE_NAMES[mode.job]}储量升级`);
    setText(view.confirmationMessage, `消耗灵木 ${cost}（当前 ${profile.wallet.spiritWood}）`);
    setText(view.confirmationDetail, preview.nextCapacity === null
        ? `当前最大储量 ${preview.currentCapacity}，已达最高等级`
        : `最大储量 ${preview.currentCapacity} → ${preview.nextCapacity}`);
    setText(view.confirmationError, preview.isMaxLevel
        ? '已达当前版本最高等级'
        : preview.canAfford ? '' : '灵木不足，无法升级');
    view.confirmationIcon.spriteFrame = view.resourceIconFrames.get('spiritWood') ?? null;
    view.confirmationPrimary.button.interactable = preview.canAfford && !preview.isMaxLevel && !locked;
    if (view.confirmationPrimary.label) view.confirmationPrimary.label.string = '升级';
}
