import { _decorator, Component, director, game, Game, Label, Node } from 'cc';
import { EventBus } from 'db://assets/scripts/services/EventBus';
import { TimeService } from 'db://assets/scripts/services/TimeService';
import { DataRegistry } from 'db://assets/scripts/services/DataRegistry';
import { GameState } from 'db://assets/scripts/services/GameState';
import { BrowserLifecycle } from 'db://assets/scripts/services/BrowserLifecycle';
import {
    CocosSceneRouter,
    fadeSceneOverlay,
} from 'db://assets/scripts/presentation/routing/CocosSceneRouter';
import type { SaveRepository } from 'db://assets/scripts/services/SaveRepository';
import { serializeProfile } from 'db://assets/scripts/services/ProfileCodec';
import { LingPuService } from 'db://assets/scripts/services/LingPuService';
import { CampHudApplicationService } from 'db://assets/scripts/services/camp/CampHudApplicationService';
import { LingPuApplicationService } from 'db://assets/scripts/services/camp/LingPuApplicationService';
import { LocalCampApiAdapter } from 'db://assets/scripts/services/camp/api/LocalCampApiAdapter';
import { MapApplicationService } from 'db://assets/scripts/services/map/MapApplicationService';
import { MapRestApplicationService } from 'db://assets/scripts/services/map/MapRestApplicationService';
import {
    LING_PU_CONFIG_ID,
    LING_PU_CONFIG_TABLE,
} from 'db://assets/scripts/domain/LingPu';
import type { LingPuConfig } from 'db://assets/scripts/domain/LingPu';
import {
    EXPEDITION_CONFIG_ID,
    EXPEDITION_CONFIG_TABLE,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { ExpeditionPreparationConfig } from 'db://assets/scripts/domain/ExpeditionPreparation';

const { ccclass, property } = _decorator;

/**
 * 持久根节点与全局生命周期（技术方案 §4.1）。
 *
 * 职责边界：只做场景切换与生命周期钩子，不存放游戏数据。
 * 业务逻辑写成无引擎依赖的普通 TS 类，由 Component 调用；
 * 避免把整个项目堆进静态单例。
 */
@ccclass('AppRoot')
export class AppRoot extends Component {
    private static _instance: AppRoot | null = null;

    readonly events = new EventBus();
    readonly time = new TimeService();
    readonly data = new DataRegistry();
    readonly state = new GameState();
    private readonly lingPuDomain = new LingPuService(this.time);
    private readonly campApi = new LocalCampApiAdapter({
        readProfile: () => this.state.require(),
        readLingPuConfig: () => this.getLingPuConfig(),
        lingPuDomain: this.lingPuDomain,
        nowUtcSeconds: () => this.time.nowUtcSeconds(),
    });
    readonly campHud = new CampHudApplicationService({
        api: this.campApi,
        state: this.state,
        events: this.events,
        save: () => this.saveCurrentProfile(),
    });
    readonly lingPu = new LingPuApplicationService({
        api: this.campApi,
        state: this.state,
        events: this.events,
        time: this.time,
        save: () => this.saveCurrentProfile(),
    });
    readonly map = new MapApplicationService({
        state: this.state,
        events: this.events,
        save: () => this.saveCurrentProfile(),
        nowUtcSeconds: () => this.time.nowUtcSeconds(),
        readGrainDepletionStepLimit: () =>
            this.getExpeditionPreparationConfig()?.field.grainDepletionStepLimit ?? 0,
    });
    readonly mapRest = new MapRestApplicationService({
        state: this.state,
        events: this.events,
        save: () => this.saveCurrentProfile(),
    });

    /** 导航加载期间覆盖全屏并拦截输入。 */
    @property(Node)
    loadingOverlay: Node | null = null;

    /** 全局轻提示，用于未开放入口和栈底返回。 */
    @property(Node)
    feedbackRoot: Node | null = null;

    @property(Label)
    feedbackLabel: Label | null = null;

    /** 浏览器异常事件（WebGL 上下文丢失、断网、页面卸载）转领域事件。 */
    private readonly lifecycle = new BrowserLifecycle(this.events);
    private _router: CocosSceneRouter | null = null;
    private saveRepository: SaveRepository | null = null;
    private saveQueue: Promise<void> = Promise.resolve();
    private productionTickInFlight = false;

    /** 唯一的全局场景路由，生命周期与持久 AppRoot 一致。 */
    get router(): CocosSceneRouter {
        if (!this._router) {
            throw new Error('SceneRouter 尚未初始化');
        }
        return this._router;
    }

    static get instance(): AppRoot {
        if (!AppRoot._instance) {
            throw new Error('AppRoot 尚未初始化，请确认启动场景挂载了 AppRoot 节点');
        }
        return AppRoot._instance;
    }

    protected override onLoad(): void {
        if (AppRoot._instance) {
            // 场景重复挂载时保留最先创建的实例，销毁多余节点
            this.node.destroy();
            return;
        }
        AppRoot._instance = this;
        director.addPersistRootNode(this.node);

        this.loadingOverlay && (this.loadingOverlay.active = false);
        this.feedbackRoot && (this.feedbackRoot.active = false);
        this._router = new CocosSceneRouter({
            onLoadingChanged: (loading) => {
                if (this.loadingOverlay) {
                    this.loadingOverlay.active = loading;
                }
                this.events.emit('router.loadingChanged', { loading });
            },
            onPageChanged: (entry) => this.events.emit('router.pageChanged', entry),
            onAtRoot: () => this.showFeedback('已在营地'),
            onFadeChanged: (opaque) => fadeSceneOverlay(this.loadingOverlay, opaque),
        });

        // 浏览器切后台时暂停渲染与战斗表现，但领域计时用可信时间补算
        // （技术方案 §3.3），因此这里只广播事件，不冻结时间。
        game.on(Game.EVENT_HIDE, this.onGameHide, this);
        game.on(Game.EVENT_SHOW, this.onGameShow, this);

        // 引擎不转发 webglcontextlost 等原生事件，需自行监听（PRD-10 §8）
        this.lifecycle.start(game.canvas ?? null);
        this.events.on('profile.loaded', () => {
            this.campHud.invalidate();
            this.lingPu.invalidate();
        });
        this.events.on('wallet.changed', () => this.campHud.invalidate());
        this.events.on('story.changed', () => this.campHud.invalidate());
        this.schedule(this.tickCampProduction, 1);
    }

    protected override onDestroy(): void {
        if (AppRoot._instance !== this) {
            return;
        }
        game.off(Game.EVENT_HIDE, this.onGameHide, this);
        game.off(Game.EVENT_SHOW, this.onGameShow, this);
        this.lifecycle.stop();
        this.unschedule(this.tickCampProduction);
        this.unschedule(this.hideFeedback);
        this.events.clear();
        this._router = null;
        this.saveRepository = null;
        AppRoot._instance = null;
    }

    /** 启动期安装一次存档仓库，后续页面全部复用它。 */
    installSaveRepository(repository: SaveRepository): void {
        if (this.saveRepository && this.saveRepository !== repository) {
            throw new Error('SaveRepository 已安装，不允许运行期替换');
        }
        this.saveRepository = repository;
    }

    /** 保存当前 GameState，供后续页面在状态变更后调用。 */
    saveCurrentProfile(): Promise<void> {
        const operation = this.saveQueue.then(() => this.persistCurrentProfile());
        this.saveQueue = operation.catch(() => undefined);
        return operation;
    }

    private async persistCurrentProfile(): Promise<void> {
        if (!this.saveRepository) {
            throw new Error('SaveRepository 尚未安装');
        }
        const envelope = await this.saveRepository.save(
            serializeProfile(this.state.require()),
        );
        this.events.emit('save.completed', { savedAtUtc: envelope.saved_at_utc });
    }

    getLingPuConfig(): LingPuConfig | null {
        if (!this.data.has(LING_PU_CONFIG_TABLE)) {
            return null;
        }
        return this.data.get<LingPuConfig>(LING_PU_CONFIG_TABLE, LING_PU_CONFIG_ID);
    }

    getExpeditionPreparationConfig(): ExpeditionPreparationConfig | null {
        if (!this.data.has(EXPEDITION_CONFIG_TABLE)) {
            return null;
        }
        return this.data.get<ExpeditionPreparationConfig>(
            EXPEDITION_CONFIG_TABLE,
            EXPEDITION_CONFIG_ID,
        );
    }

    /** 显示一条有时限的全局反馈，连续点击会刷新计时。 */
    showFeedback(message: string, durationSeconds = 2): void {
        if (this.feedbackLabel) {
            this.feedbackLabel.string = message;
        }
        if (this.feedbackRoot) {
            this.feedbackRoot.active = true;
        }
        this.unschedule(this.hideFeedback);
        this.scheduleOnce(this.hideFeedback, durationSeconds);
        this.events.emit('ui.feedback', { message });
    }

    private readonly hideFeedback = (): void => {
        if (this.feedbackRoot) {
            this.feedbackRoot.active = false;
        }
    };

    private onGameHide(): void {
        void this.settleCampProduction('app_hide');
        this.events.emit('app.hide', { atUtc: this.time.nowUtcSeconds() });
    }

    private onGameShow(): void {
        if (this.state.isLoaded) {
            void this.resumeCampProduction();
        }
        this.events.emit('app.show', { atUtc: this.time.nowUtcSeconds() });
    }

    private readonly tickCampProduction = (): void => {
        if (!this.state.isLoaded || this.productionTickInFlight) {
            return;
        }
        void this.settleDueCampProduction();
    };

    private async settleDueCampProduction(): Promise<void> {
        if (!this.state.isLoaded || this.productionTickInFlight) {
            return;
        }
        this.productionTickInFlight = true;
        try {
            await this.lingPu.settleIfDue();
        } catch (error) {
            console.error('[灵圃] 自动结算失败', error);
            this.showFeedback('生产结算失败，请稍后重试');
        } finally {
            this.productionTickInFlight = false;
        }
    }

    private async settleCampProduction(reason: 'app_hide'): Promise<void> {
        if (!this.state.isLoaded) return;
        try {
            await this.lingPu.settle(reason);
        } catch (error) {
            console.error('[灵圃] 生命周期结算失败', error);
            this.showFeedback('生产结算失败，请稍后重试');
        }
    }

    private async resumeCampProduction(): Promise<void> {
        if (!this.state.isLoaded) return;
        try {
            await this.lingPu.resumeOnlineSession();
        } catch (error) {
            console.error('[灵圃] 恢复前台失败', error);
            this.showFeedback('生产状态恢复失败，请稍后重试');
        }
    }
}
