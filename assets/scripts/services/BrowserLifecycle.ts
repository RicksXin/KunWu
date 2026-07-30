/**
 * 浏览器异常与生命周期事件（PRD-10 §8、任务 P0-TECH-001）。
 *
 * 职责边界：只把浏览器层事件翻译成领域事件，不含恢复策略。
 * 具体怎么恢复由各系统订阅后自行决定——存档层要提示导出，
 * 战斗表现层要暂停，两者行为不同，不该在这里判断。
 *
 * 领域事件名集中在此定义，避免各处硬编码字符串导致订阅方拼错却静默失效。
 */

/** WebGL 上下文丢失。表现层应暂停渲染并等待 restored（PRD-10 §8）。 */
export const EVENT_GL_CONTEXT_LOST = 'browser.glContextLost';
/** 上下文恢复。需要重建纹理等 GPU 资源。 */
export const EVENT_GL_CONTEXT_RESTORED = 'browser.glContextRestored';
/** 页面即将卸载。最后的存档时机。 */
export const EVENT_PAGE_HIDE = 'browser.pageHide';
/** 网络断开／恢复。已加载内容仍可运行（PRD-10 §11）。 */
export const EVENT_NETWORK_OFFLINE = 'browser.networkOffline';
export const EVENT_NETWORK_ONLINE = 'browser.networkOnline';

export interface LifecycleEmitter {
    emit<T>(event: string, payload: T): void;
}

/**
 * 监听浏览器异常事件。
 *
 * 与 AppRoot 已有的 EVENT_HIDE/EVENT_SHOW 互补：那两个来自引擎的 game 对象，
 * 这里的是引擎不转发的原生事件。
 */
export class BrowserLifecycle {
    private readonly emitter: LifecycleEmitter;
    private disposers: (() => void)[] = [];

    constructor(emitter: LifecycleEmitter) {
        this.emitter = emitter;
    }

    /** 是否运行在支持这些事件的环境。Node 单测下为 false。 */
    static isSupported(): boolean {
        return typeof document !== 'undefined' && typeof window !== 'undefined';
    }

    /**
     * 开始监听。canvas 为空时跳过 WebGL 事件，其余照常注册——
     * 拿不到画布不该导致断网检测也失效。
     */
    start(canvas: HTMLCanvasElement | null): void {
        if (!BrowserLifecycle.isSupported()) {
            return;
        }
        this.stop();

        if (canvas) {
            // 必须 preventDefault，否则浏览器不会触发后续的 restored 事件
            this.listen(canvas, 'webglcontextlost', (event) => {
                event.preventDefault();
                this.emitter.emit(EVENT_GL_CONTEXT_LOST, {});
            });
            this.listen(canvas, 'webglcontextrestored', () => {
                this.emitter.emit(EVENT_GL_CONTEXT_RESTORED, {});
            });
        }

        // pagehide 比 beforeunload 可靠：iOS Safari 不保证触发后者
        this.listen(window, 'pagehide', () => {
            this.emitter.emit(EVENT_PAGE_HIDE, { atUtc: Math.floor(Date.now() / 1000) });
        });

        this.listen(window, 'offline', () => {
            this.emitter.emit(EVENT_NETWORK_OFFLINE, {});
        });
        this.listen(window, 'online', () => {
            this.emitter.emit(EVENT_NETWORK_ONLINE, {});
        });
    }

    stop(): void {
        for (const dispose of this.disposers) {
            dispose();
        }
        this.disposers = [];
    }

    private listen(
        target: EventTarget,
        type: string,
        handler: (event: Event) => void,
    ): void {
        target.addEventListener(type, handler);
        this.disposers.push(() => target.removeEventListener(type, handler));
    }
}
