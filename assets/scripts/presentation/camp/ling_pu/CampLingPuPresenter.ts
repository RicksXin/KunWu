import { _decorator, Component, EventKeyboard, input, Input, KeyCode, Node } from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import type { P1LingPuJob } from 'db://assets/scripts/domain/LingPu';
import { CampApplicationError } from 'db://assets/scripts/services/camp/CampApplicationError';
import type { LingPuViewModel } from 'db://assets/scripts/services/camp/CampApplicationModels';
import {
    disposeCampBindings,
    fitCampPageRoot,
} from 'db://assets/scripts/presentation/camp/shared/CampViewUtils';
import {
    renderLingPuConfirmation,
    renderLingPuPanel,
    renderLingPuTimer,
} from './LingPuRenderer';
import { bindLingPuView } from './LingPuViewBinder';
import type { LingPuView } from './LingPuViewTypes';
import { RESOURCE_NAMES } from './LingPuViewTypes';
import type { ConfirmationMode } from './LingPuViewTypes';
import {
    loadAndApplyLingPuVisuals,
    syncLingPuViewSize,
} from './LingPuVisualAssets';

const { ccclass } = _decorator;

/** 灵源院页面协调器：只管理生命周期、Application Service 调用和确认流程。 */
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
            app.events.on<LingPuViewModel>('camp.lingPuStateChanged', (model) => {
                this.render(model);
            }),
            app.events.on<{ message: string }>('camp.lingPuNotice', ({ message }) => {
                app.showFeedback(message);
            }),
            app.events.on('profile.loaded', () => {
                if (this.view?.panelRoot.active) {
                    this.enqueueOperation(() => app.lingPu.refresh().then(() => undefined));
                }
            }),
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
        if (!this.view?.panelRoot.active) return;
        const timer = AppRoot.instance.lingPu.timer();
        if (timer) renderLingPuTimer(this.view, timer);
    }

    private readonly syncSize = (): void => {
        if (this.view) syncLingPuViewSize(this.node, this.view);
    };

    private open(): void {
        if (!this.view) return;
        this.cancelConfirmation();
        this.view.panelRoot.active = true;
        if (this.view.modalFrame) this.view.modalFrame.node.active = true;
        this.render();
        this.enqueueOperation(() => AppRoot.instance.lingPu.settle('panel_open').then(() => undefined));
    }

    private close(): void {
        if (!this.view?.panelRoot.active) return;
        if (this.view.confirmationRoot.active) {
            this.cancelConfirmation();
            return;
        }
        this.view.panelRoot.active = false;
        if (this.view.modalFrame) this.view.modalFrame.node.active = false;
        this.enqueueOperation(() => AppRoot.instance.lingPu.settle('panel_close').then(() => undefined));
    }

    private openRecruitConfirmation(): void {
        if (!this.view || !AppRoot.instance.lingPu.current) {
            AppRoot.instance.showFeedback('灵源院数据尚未加载');
            return;
        }
        this.confirmationMode = { kind: 'recruit' };
        this.confirmationLocked = false;
        this.view.confirmationRoot.active = true;
        this.renderConfirmation();
    }

    private openUpgradeConfirmation(job: P1LingPuJob): void {
        const model = AppRoot.instance.lingPu.current;
        if (!model || !this.view) {
            AppRoot.instance.showFeedback('灵源院数据尚未加载');
            return;
        }
        if (model.resources[job].upgrade.isMaxLevel) {
            AppRoot.instance.showFeedback(`${RESOURCE_NAMES[job]}储量已满级`);
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
        this.enqueueOperation(async () => {
            if (mode.kind === 'recruit') await AppRoot.instance.lingPu.recruit();
            else await AppRoot.instance.lingPu.upgradeStorage(mode.job);
            this.cancelConfirmation();
            this.render();
        });
    }

    private enqueueReassignment(job: P1LingPuJob, delta: -1 | 1): void {
        this.enqueueOperation(async () => {
            await AppRoot.instance.lingPu.reassign(job, delta);
            this.render();
        });
    }

    private enqueueOperation(operation: () => Promise<void>): void {
        this.operationQueue = this.operationQueue.then(operation).catch((error) => {
            console.error('[灵源院] 操作失败', error);
            const message = error instanceof CampApplicationError
                ? error.message
                : '灵源院操作失败，请稍后重试';
            AppRoot.instance.showFeedback(message);
            if (error instanceof CampApplicationError && error.code === 'save_failed') {
                this.cancelConfirmation();
            } else {
                this.unlockConfirmation();
            }
        });
    }

    private unlockConfirmation(): void {
        this.confirmationLocked = false;
        this.renderConfirmation();
    }

    private render(model: LingPuViewModel | null = AppRoot.instance.lingPu.current): void {
        if (!this.view || !model) return;
        renderLingPuPanel(this.view, model, this.confirmationMode, this.confirmationLocked);
        const timer = AppRoot.instance.lingPu.timer();
        if (timer) renderLingPuTimer(this.view, timer);
    }

    private renderConfirmation(): void {
        const model = AppRoot.instance.lingPu.current;
        if (this.view && model) {
            renderLingPuConfirmation(
                this.view,
                model,
                this.confirmationMode,
                this.confirmationLocked,
            );
        }
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
            console.error('[灵源院] 美术素材加载失败', error);
            AppRoot.instance.showFeedback('灵源院素材加载失败');
        }
    }
}
