import { _decorator, Component, director, game, Game, Label, Node } from 'cc';
import { EventBus } from './services/EventBus';
import { TimeService } from './services/TimeService';
import { DataRegistry } from './services/DataRegistry';
import { GameState } from './services/GameState';
import { BrowserLifecycle } from './services/BrowserLifecycle';
import { CocosSceneRouter } from './presentation/CocosSceneRouter';
import { SaveRepository } from './services/SaveRepository';
import { serializeProfile } from './services/ProfileCodec';

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
        });

        // 浏览器切后台时暂停渲染与战斗表现，但领域计时用可信时间补算
        // （技术方案 §3.3），因此这里只广播事件，不冻结时间。
        game.on(Game.EVENT_HIDE, this.onGameHide, this);
        game.on(Game.EVENT_SHOW, this.onGameShow, this);

        // 引擎不转发 webglcontextlost 等原生事件，需自行监听（PRD-10 §8）
        this.lifecycle.start(game.canvas ?? null);
    }

    protected override onDestroy(): void {
        if (AppRoot._instance !== this) {
            return;
        }
        game.off(Game.EVENT_HIDE, this.onGameHide, this);
        game.off(Game.EVENT_SHOW, this.onGameShow, this);
        this.lifecycle.stop();
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
    async saveCurrentProfile(): Promise<void> {
        if (!this.saveRepository) {
            throw new Error('SaveRepository 尚未安装');
        }
        const envelope = await this.saveRepository.save(
            serializeProfile(this.state.require()),
        );
        this.events.emit('save.completed', { savedAtUtc: envelope.saved_at_utc });
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
        this.events.emit('app.hide', { atUtc: this.time.nowUtcSeconds() });
    }

    private onGameShow(): void {
        this.events.emit('app.show', { atUtc: this.time.nowUtcSeconds() });
    }
}
