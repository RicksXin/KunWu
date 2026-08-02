import { _decorator, Component } from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import { EntryActivationGate } from 'db://assets/scripts/domain/HallPanorama';
import { CAMP_TOP_HUD_PATHS } from 'db://assets/scripts/domain/CampSceneContract';
import { ResourceBar } from './ResourceBar';
import {
    bindCampButton,
    campLabel,
    campNode,
    disposeCampBindings,
    warnCampTouchTarget,
} from '../shared/CampViewUtils';

const { ccclass } = _decorator;

/** 顶部 HUD：头像、五资源和主线提示。只依赖 TopHUD Prefab 内部节点。 */
@ccclass('CampHudPresenter')
export class CampHudPresenter extends Component {
    private readonly disposers: (() => void)[] = [];
    private readonly activationGate = new EntryActivationGate();

    protected override onLoad(): void {
        const app = AppRoot.instance;
        this.disposers.push(
            app.events.on('wallet.changed', () => this.renderWallet()),
            app.events.on('profile.loaded', () => this.renderAll()),
            app.events.on('story.changed', () => this.renderMainTask()),
            app.events.on<{ pageId: string }>('router.pageChanged', ({ pageId }) => {
                if (pageId === 'camp') {
                    this.renderAll();
                }
            }),
            app.events.on('expedition.settlementClosed', () => this.renderAll()),
        );

        const avatar = campNode(this.node, CAMP_TOP_HUD_PATHS.avatar);
        const mainTask = campNode(this.node, CAMP_TOP_HUD_PATHS.mainTask);
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
        this.renderAll();
    }

    protected override onDestroy(): void {
        disposeCampBindings(this.disposers);
    }

    private renderAll(): void {
        this.renderWallet();
        this.renderMainTask();
    }

    private showPlaceholder(entryId: string): void {
        if (this.activationGate.tryActivate(entryId, Date.now())) {
            AppRoot.instance.showFeedback('功能待定');
        }
    }

    private renderWallet(): void {
        const app = AppRoot.instance;
        const bar =
            campNode(this.node, CAMP_TOP_HUD_PATHS.resourceBar)?.getComponent(ResourceBar) ?? null;
        if (!app.state.isLoaded) {
            bar?.renderPlaceholder();
            return;
        }
        bar?.render(app.state.require().wallet);
    }

    private renderMainTask(): void {
        const label = campLabel(this.node, CAMP_TOP_HUD_PATHS.mainTaskObjective);
        if (!label) {
            return;
        }
        const app = AppRoot.instance;
        if (!app.state.isLoaded) {
            label.string = '主线：--';
            return;
        }
        const objective = currentMainTaskObjective(app.state.require().storyFlags);
        label.string = objective ? `主线：${truncateLine(objective)}` : '暂无主线任务';
    }
}

function currentMainTaskObjective(storyFlags: Readonly<Record<string, boolean>>): string | null {
    if (storyFlags.main_story_complete === true) {
        return null;
    }
    if (storyFlags.met_cen_shou_yi === true) {
        return '整备营地，准备首次入山';
    }
    return '前往议事殿，与岑守一交谈';
}

function truncateLine(text: string, maxCharacters = 24): string {
    return text.length > maxCharacters ? `${text.slice(0, maxCharacters - 1)}…` : text;
}
