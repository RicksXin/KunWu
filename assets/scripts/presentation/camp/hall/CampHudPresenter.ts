import { _decorator, Component } from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import { EntryActivationGate } from 'db://assets/scripts/domain/HallPanorama';
import { CAMP_TOP_HUD_PATHS } from 'db://assets/scripts/domain/CampSceneContract';
import { CampApplicationError } from 'db://assets/scripts/services/camp/CampApplicationError';
import type { CampHudViewModel } from 'db://assets/scripts/services/camp/CampApplicationModels';
import { MainTaskSummary } from 'db://assets/scripts/presentation/core/MainTaskSummary';
import { ResourceBar } from './ResourceBar';
import {
    bindCampButton,
    campLabel,
    campNode,
    disposeCampBindings,
    warnCampTouchTarget,
} from 'db://assets/scripts/presentation/camp/shared/CampViewUtils';

const { ccclass } = _decorator;

/** 顶部 HUD：头像、五资源和主线提示。只依赖 TopHUD Prefab 内部节点。 */
@ccclass('CampHudPresenter')
export class CampHudPresenter extends Component {
    private readonly disposers: (() => void)[] = [];
    private readonly activationGate = new EntryActivationGate();
    private mainTaskSummary: MainTaskSummary | null = null;

    protected override onLoad(): void {
        const app = AppRoot.instance;
        this.disposers.push(
            app.events.on<CampHudViewModel>('camp.hudChanged', (model) => this.renderAll(model)),
            app.events.on('wallet.changed', () => this.requestRefresh()),
            app.events.on('profile.loaded', () => this.requestRefresh()),
            app.events.on('story.changed', () => this.requestRefresh()),
            app.events.on<{ pageId: string }>('router.pageChanged', ({ pageId }) => {
                if (pageId === 'camp') {
                    this.requestRefresh();
                }
            }),
            app.events.on('expedition.settlementClosed', () => this.requestRefresh()),
        );

        const avatar = campNode(this.node, CAMP_TOP_HUD_PATHS.avatar);
        const mainTask = campNode(this.node, CAMP_TOP_HUD_PATHS.mainTask);
        const objective = campLabel(this.node, CAMP_TOP_HUD_PATHS.mainTaskObjective);
        if (mainTask && objective) {
            this.mainTaskSummary = mainTask.getComponent(MainTaskSummary)
                ?? mainTask.addComponent(MainTaskSummary);
            this.mainTaskSummary.bind(objective);
        }
        bindCampButton(
            this,
            avatar,
            () => this.showPlaceholder('avatar'),
            this.disposers,
        );
        bindCampButton(
            this,
            mainTask,
            () => this.showPlaceholder('main_task'),
            this.disposers,
        );
        warnCampTouchTarget(avatar, '玩家头像');
        warnCampTouchTarget(mainTask, '主线提示');
    }

    protected override start(): void {
        this.renderAll(AppRoot.instance.campHud.current);
        this.requestRefresh();
    }

    protected override onDestroy(): void {
        disposeCampBindings(this.disposers);
    }

    private renderAll(model: CampHudViewModel | null): void {
        this.renderWallet(model);
        this.renderMainTask(model);
    }

    private showPlaceholder(entryId: string): void {
        if (this.activationGate.tryActivate(entryId, Date.now())) {
            AppRoot.instance.showFeedback('功能待定');
        }
    }

    private renderWallet(model: CampHudViewModel | null): void {
        const bar =
            campNode(this.node, CAMP_TOP_HUD_PATHS.resourceBar)?.getComponent(ResourceBar) ?? null;
        if (!model) {
            bar?.renderPlaceholder();
            return;
        }
        bar?.render(model.resources);
    }

    private renderMainTask(model: CampHudViewModel | null): void {
        this.mainTaskSummary?.render(model?.mainTaskObjective);
    }

    private requestRefresh(): void {
        void AppRoot.instance.campHud.refresh()
            .then((model) => {
                if (this.node.isValid) this.renderAll(model);
            })
            .catch((error) => {
                console.error('[顶部 HUD] 数据刷新失败', error);
                const message = error instanceof CampApplicationError
                    ? error.message
                    : '顶部信息加载失败，请稍后重试';
                AppRoot.instance.showFeedback(message);
            });
    }
}
