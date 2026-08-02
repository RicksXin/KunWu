import { _decorator, Component, EventKeyboard, input, Input, KeyCode, Node } from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import type { LingPuConfig, P1LingPuJob } from 'db://assets/scripts/domain/LingPu';
import type { Profile } from 'db://assets/scripts/services/GameState';
import {
    disposeCampBindings,
    fitCampPageRoot,
} from '../shared/CampViewUtils';
import { renderLingPuConfirmation, renderLingPuPanel, renderLingPuTimer } from './LingPuRenderer';
import type { LingPuRenderContext } from './LingPuRenderer';
import { bindLingPuView, syncLingPuViewSize } from './LingPuViewBinder';
import type { LingPuView } from './LingPuViewTypes';
import { failureMessage, RESOURCE_NAMES } from './LingPuViewTypes';
import type { ConfirmationMode } from './LingPuViewTypes';
import { loadAndApplyLingPuVisuals } from './LingPuVisualAssets';

const { ccclass } = _decorator;

/** 灵圃页面协调器：只管理生命周期、领域操作和确认流程。 */
@ccclass('CampLingPuPresenter')
export class CampLingPuPresenter extends Component {
    private readonly disposers: (() => void)[] = [];
    private view: LingPuView | null = null;
    private confirmationMode: ConfirmationMode | null = null;
    private confirmationLocked = false;
    private operationQueue: Promise<void> = Promise.resolve();
    private destroyed = false;

    protected override onLoad(): void {
        fitCampPageRoot(this, this.disposers);
        this.view = bindLingPuView(this, this.disposers, {
            recruit: () => this.openRecruitConfirmation(),
            close: () => this.close(),
            confirm: () => this.confirmConfirmation(),
            cancel: () => this.cancelConfirmation(),
            reassign: (job, delta) => this.enqueueReassignment(job, delta),
            upgrade: (job) => this.openUpgradeConfirmation(job),
        });
        if (!this.view) return;
        this.syncSize();
        this.node.on(Node.EventType.SIZE_CHANGED, this.syncSize, this);
        this.disposers.push(() => this.node.off(Node.EventType.SIZE_CHANGED, this.syncSize, this));
        const app = AppRoot.instance;
        this.disposers.push(
            app.events.on('camp.lingPuRequested', () => this.open()),
            app.events.on('camp.productionChanged', () => this.render()),
            app.events.on('profile.loaded', () => this.render()),
            app.events.on<{ pageId: string }>('router.pageChanged', ({ pageId }) => {
                if (pageId !== 'camp' && this.view?.panelRoot.active) this.close();
            }),
        );
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        this.disposers.push(() => input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this));
        void this.loadVisuals();
    }

    protected override onDestroy(): void {
        this.destroyed = true;
        disposeCampBindings(this.disposers);
    }

    protected override update(_deltaTime: number): void {
        const context = this.context(false);
        if (this.view?.panelRoot.active && context) renderLingPuTimer(this.view, context);
    }

    private readonly syncSize = (): void => {
        if (this.view) syncLingPuViewSize(this.node, this.view);
    };

    private open(): void {
        const context = this.context(true);
        if (!context || !this.view) return;
        this.cancelConfirmation();
        this.view.panelRoot.active = true;
        this.render();
        this.enqueueOperation(() => this.settleAndSave());
    }

    private close(): void {
        if (!this.view?.panelRoot.active) return;
        if (this.view.confirmationRoot.active) {
            this.cancelConfirmation();
            return;
        }
        this.view.panelRoot.active = false;
        this.enqueueOperation(() => this.settleAndSave());
    }

    private openRecruitConfirmation(): void {
        if (!this.view) return;
        this.confirmationMode = { kind: 'recruit' };
        this.confirmationLocked = false;
        this.view.confirmationRoot.active = true;
        this.renderConfirmation();
    }

    private openUpgradeConfirmation(job: P1LingPuJob): void {
        const context = this.context(false);
        if (!context || !this.view) return;
        if (context.app.lingPu.previewUpgrade(context.profile, context.config, job).isMaxLevel) {
            context.app.showFeedback(`${RESOURCE_NAMES[job]}储量已满级`);
            return;
        }
        this.confirmationMode = { kind: 'upgrade', job };
        this.confirmationLocked = false;
        this.view.confirmationRoot.active = true;
        this.renderConfirmation();
    }

    private cancelConfirmation(): void {
        this.confirmationMode = null;
        this.confirmationLocked = false;
        if (this.view) this.view.confirmationRoot.active = false;
    }

    private confirmConfirmation(): void {
        if (!this.confirmationMode || this.confirmationLocked || !this.view) return;
        this.confirmationLocked = true;
        this.view.confirmationPrimary.button.interactable = false;
        const mode = this.confirmationMode;
        this.enqueueOperation(() => mode.kind === 'recruit' ? this.recruit() : this.upgradeStorage(mode.job));
    }

    private enqueueReassignment(job: P1LingPuJob, delta: -1 | 1): void {
        this.enqueueOperation(async () => {
            const context = this.context(true);
            if (!context) return;
            const result = context.app.lingPu.reassign(context.profile, context.config, job, delta);
            this.handleClockRollback(result.clockRolledBack);
            context.app.notifyLingPuChanged();
            this.render();
            if (!result.ok) context.app.showFeedback(failureMessage(result.failure));
            await this.saveWithFeedback();
        });
    }

    private async recruit(): Promise<void> {
        const context = this.context(true);
        if (!context) return this.unlockConfirmation();
        const result = context.app.lingPu.recruit(context.profile, context.config);
        this.handleClockRollback(result.clockRolledBack);
        context.app.notifyLingPuChanged();
        if (result.ok) this.cancelConfirmation();
        else {
            context.app.showFeedback(failureMessage(result.failure));
            this.unlockConfirmation();
        }
        this.render();
        await this.saveWithFeedback();
    }

    private async upgradeStorage(job: P1LingPuJob): Promise<void> {
        const context = this.context(true);
        if (!context) return this.unlockConfirmation();
        const result = context.app.lingPu.upgradeStorage(context.profile, context.config, job);
        this.handleClockRollback(result.clockRolledBack);
        context.app.notifyLingPuChanged();
        if (result.ok) this.cancelConfirmation();
        else {
            context.app.showFeedback(failureMessage(result.failure));
            this.unlockConfirmation();
        }
        this.render();
        await this.saveWithFeedback();
    }

    private async settleAndSave(): Promise<void> {
        const context = this.context(true);
        if (!context) return;
        const result = context.app.lingPu.settleOnline(context.profile, context.config);
        this.handleClockRollback(result.clockRolledBack);
        context.app.notifyLingPuChanged();
        this.render();
        await this.saveWithFeedback();
    }

    private context(showFeedback: boolean): LingPuRenderContext | null {
        const app = AppRoot.instance;
        const config = app.getLingPuConfig();
        if (!app.state.isLoaded || !config) {
            if (showFeedback) app.showFeedback('灵圃数据尚未加载');
            return null;
        }
        return { app, profile: app.state.require() as Profile, config: config as LingPuConfig };
    }

    private enqueueOperation(operation: () => Promise<void>): void {
        this.operationQueue = this.operationQueue.then(operation).catch((error) => {
            console.error('[灵圃] 操作失败', error);
            AppRoot.instance.showFeedback('灵圃操作失败，请稍后重试');
            this.unlockConfirmation();
        });
    }

    private async saveWithFeedback(): Promise<void> {
        try {
            await AppRoot.instance.saveCurrentProfile();
        } catch (error) {
            console.error('[灵圃] 保存失败', error);
            AppRoot.instance.showFeedback('存档失败，请稍后重试');
        }
    }

    private handleClockRollback(rolledBack: boolean): void {
        if (rolledBack) AppRoot.instance.showFeedback('系统时间异常，生产已暂停');
    }

    private unlockConfirmation(): void {
        this.confirmationLocked = false;
        this.renderConfirmation();
    }

    private render(): void {
        const context = this.context(false);
        if (this.view && context) renderLingPuPanel(this.view, context, this.confirmationMode, this.confirmationLocked);
    }

    private renderConfirmation(): void {
        const context = this.context(false);
        if (this.view && context) renderLingPuConfirmation(this.view, context, this.confirmationMode, this.confirmationLocked);
    }

    private readonly onKeyDown = (event: EventKeyboard): void => {
        if (!this.view?.panelRoot.active
            || (event.keyCode !== KeyCode.ESCAPE && event.keyCode !== KeyCode.BACKSPACE)) return;
        if (this.view.confirmationRoot.active) this.cancelConfirmation();
        else this.close();
    };

    private async loadVisuals(): Promise<void> {
        if (!this.view) return;
        try {
            await loadAndApplyLingPuVisuals(this.view, () => this.destroyed);
            this.render();
        } catch (error) {
            console.error('[灵圃] 美术素材加载失败', error);
            AppRoot.instance.showFeedback('灵圃素材加载失败');
        }
    }
}
