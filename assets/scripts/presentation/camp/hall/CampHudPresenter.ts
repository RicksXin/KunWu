import { _decorator, Color, Component, Node, Sprite, UITransform, Widget } from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import { EntryActivationGate } from 'db://assets/scripts/domain/HallPanorama';
import {
    CAMP_RESOURCE_NODE_NAMES,
    CAMP_TOP_HUD_PATHS,
} from 'db://assets/scripts/domain/CampSceneContract';
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

const FIGMA_STATUS_BAR_HEIGHT = 126.72;

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
        this.configureVisuals();
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

    private configureVisuals(): void {
        const widget = this.node.getComponent(Widget);
        if (widget) {
            // Approved 稿的 TopHUD 从 44px 状态栏参考线下方开始：44 × 2.88。
            // 真机 SafeAreaRoot 已经扣除顶部 inset 时不重复留白。
            widget.top = hasPhysicalTopSafeInset(this.node.parent)
                ? 0
                : FIGMA_STATUS_BAR_HEIGHT;
            widget.updateAlignment();
        }
        const avatar = campNode(this.node, CAMP_TOP_HUD_PATHS.avatar);
        const avatarPortrait = avatar?.getChildByName('Label') ?? null;
        const avatarFrame = avatar?.getComponent(Sprite);
        const portrait = avatarPortrait?.getComponent(Sprite);
        avatarFrame && (avatarFrame.type = Sprite.Type.SIMPLE);
        portrait && (portrait.type = Sprite.Type.SIMPLE);

        for (const resourceName of CAMP_RESOURCE_NODE_NAMES) {
            const icon = campNode(this.node, `${CAMP_TOP_HUD_PATHS.resourceBar}/${resourceName}/Name`)
                ?.getComponent(Sprite);
            const value = campLabel(
                this.node,
                `${CAMP_TOP_HUD_PATHS.resourceBar}/${resourceName}/Value`,
            );
            icon && (icon.type = Sprite.Type.SIMPLE);
            if (value) {
                value.fontSize = 29;
                value.lineHeight = 49;
                value.isBold = true;
                value.color = new Color(232, 220, 187, 255);
            }
        }

        const mainTask = campNode(this.node, CAMP_TOP_HUD_PATHS.mainTask);
        if (mainTask) {
            const icon = mainTask.getChildByName('Icon')?.getComponent(Sprite);
            icon && (icon.type = Sprite.Type.SIMPLE);
        }
        const objective = campLabel(this.node, CAMP_TOP_HUD_PATHS.mainTaskObjective);
        if (objective) {
            objective.fontSize = 32;
            objective.lineHeight = 58;
            objective.isBold = true;
            objective.color = new Color(232, 220, 187, 255);
        }
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

function hasPhysicalTopSafeInset(safeAreaRoot: Node | null): boolean {
    const canvas = safeAreaRoot?.parent;
    const safeTransform = safeAreaRoot?.getComponent(UITransform);
    const canvasTransform = canvas?.getComponent(UITransform);
    if (!safeAreaRoot || !safeTransform || !canvasTransform) {
        return false;
    }
    const canvasTop = canvasTransform.contentSize.height * (1 - canvasTransform.anchorPoint.y);
    const safeTop = safeAreaRoot.position.y
        + safeTransform.contentSize.height * (1 - safeTransform.anchorPoint.y);
    return canvasTop - safeTop > 0.5;
}
