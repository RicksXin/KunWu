import { Button } from 'cc';
import type { CombatOutcome } from 'db://assets/scripts/domain/CombatState';
import type {
    CombatLootPanelView,
    CombatSettlementResult,
} from 'db://assets/scripts/services/combat/CombatApplicationModels';
import type { CombatApplicationService } from 'db://assets/scripts/services/combat/CombatApplicationService';
import type { CombatSceneNodes } from './CombatSceneView';
import {
    renderCombatLootPanel,
    setCombatLootBusy,
} from './CombatLootView';
import { renderCombatOutcome } from './CombatRenderer';
import { setCombatButtonEnabled } from './CombatUiPrimitives';

export interface CombatOutcomeFlowDeps {
    readonly service: CombatApplicationService;
    readonly nodes: CombatSceneNodes;
    readonly feedback: (message: string) => void;
    readonly navigate: (result: CombatSettlementResult) => Promise<void>;
}

export class CombatOutcomeFlow {
    private readonly deps: CombatOutcomeFlowDeps;
    private readonly backpackHandlers: Array<() => void> = [];
    private outcome: CombatOutcome | null = null;
    private settlement: CombatSettlementResult | null = null;
    private lootView: CombatLootPanelView | null = null;
    private processing = false;

    constructor(deps: CombatOutcomeFlowDeps) {
        this.deps = deps;
        deps.nodes.lootTakeAllButton.on(Button.EventType.CLICK, this.takeAll, this);
        deps.nodes.lootLeaveButton.on(Button.EventType.CLICK, this.leave, this);
        deps.nodes.lootBackpackButtons.forEach((button, index) => {
            const handler = (): void => { void this.dropBackpackItem(index); };
            this.backpackHandlers.push(handler);
            button.on(Button.EventType.CLICK, handler, this);
        });
    }

    get busy(): boolean {
        return this.processing;
    }

    dispose(): void {
        const nodes = this.deps.nodes;
        nodes.lootTakeAllButton.off(Button.EventType.CLICK, this.takeAll, this);
        nodes.lootLeaveButton.off(Button.EventType.CLICK, this.leave, this);
        nodes.lootBackpackButtons.forEach((button, index) => {
            const handler = this.backpackHandlers[index];
            if (handler) button.off(Button.EventType.CLICK, handler, this);
        });
    }

    show(outcome: CombatOutcome): void {
        this.outcome = outcome;
        if (outcome === 'ally_win') {
            this.deps.nodes.resultRoot.active = false;
            this.lootView = this.deps.service.lootPanel();
            renderCombatLootPanel(this.deps.nodes, this.lootView);
            setCombatLootBusy(this.deps.nodes, true, this.lootView);
            void this.prepareVictory();
            return;
        }
        void this.settleStandardOutcome(outcome);
    }

    confirmResult(): void {
        if (this.processing) return;
        if (this.settlement) void this.deps.navigate(this.settlement);
        else if (this.outcome && this.outcome !== 'ally_win') {
            void this.settleStandardOutcome(this.outcome);
        }
    }

    private async settleStandardOutcome(outcome: CombatOutcome): Promise<void> {
        if (this.processing) return;
        this.processing = true;
        renderCombatOutcome(this.deps.nodes, outcome);
        this.deps.nodes.resultMessage.string = '战斗结束，正在保存结果……';
        setCombatButtonEnabled(this.deps.nodes.resultButton, false);
        const result = await this.deps.service.settleOutcome();
        this.processing = false;
        this.settlement = result.ok ? result : null;
        this.deps.nodes.resultMessage.string = result.ok
            ? result.message
            : `${result.message}\n点击下方按钮重试`;
        setCombatButtonEnabled(this.deps.nodes.resultButton, true);
    }

    private readonly takeAll = (): void => { void this.finishVictory(true); };
    private readonly leave = (): void => { void this.finishVictory(false); };

    private async prepareVictory(): Promise<void> {
        const view = this.lootView;
        if (!view || this.processing) return;
        this.processing = true;
        const result = await this.deps.service.prepareVictory();
        this.processing = false;
        this.lootView = this.deps.service.lootPanel();
        renderCombatLootPanel(this.deps.nodes, this.lootView);
        setCombatLootBusy(this.deps.nodes, false, this.lootView);
        if (!result.ok) this.deps.feedback(`${result.message}，处理战利品时将重试`);
    }

    private async finishVictory(takeLoot: boolean): Promise<void> {
        if (this.processing || this.settlement) return;
        if (!this.lootView) return;
        this.processing = true;
        setCombatLootBusy(this.deps.nodes, true, this.lootView);
        const result = await this.deps.service.settleVictory(takeLoot);
        this.processing = false;
        if (!result.ok) {
            this.lootView = this.deps.service.lootPanel();
            renderCombatLootPanel(this.deps.nodes, this.lootView);
            setCombatLootBusy(this.deps.nodes, false, this.lootView);
            this.deps.feedback(result.message);
            return;
        }
        this.settlement = result;
        this.deps.nodes.lootRoot.active = false;
        await this.deps.navigate(result);
    }

    private async dropBackpackItem(index: number): Promise<void> {
        const view = this.lootView;
        const item = view?.backpack[index];
        if (!item || this.processing || this.settlement) return;
        this.processing = true;
        setCombatLootBusy(this.deps.nodes, true, view);
        const result = await this.deps.service.dropBackpackItem(item.itemId);
        this.processing = false;
        this.lootView = result.view;
        renderCombatLootPanel(this.deps.nodes, result.view);
        setCombatLootBusy(this.deps.nodes, false, result.view);
        this.deps.feedback(result.message);
    }
}
