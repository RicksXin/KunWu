import { _decorator, Component, director, game, Game } from 'cc';
import { EventBus } from './services/EventBus';
import { TimeService } from './services/TimeService';
import { DataRegistry } from './services/DataRegistry';
import { GameState } from './services/GameState';
import { BrowserLifecycle } from './services/BrowserLifecycle';

const { ccclass } = _decorator;

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

    /** 浏览器异常事件（WebGL 上下文丢失、断网、页面卸载）转领域事件。 */
    private readonly lifecycle = new BrowserLifecycle(this.events);

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
        this.events.clear();
        AppRoot._instance = null;
    }

    private onGameHide(): void {
        this.events.emit('app.hide', { atUtc: this.time.nowUtcSeconds() });
    }

    private onGameShow(): void {
        this.events.emit('app.show', { atUtc: this.time.nowUtcSeconds() });
    }
}
