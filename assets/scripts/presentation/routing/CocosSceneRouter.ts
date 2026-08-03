/**
 * SceneRouter 的引擎实现（技术方案 §12、PRD-09 §4、任务 #7b）。
 *
 * 职责边界：只做「PageStack 说去哪，就调引擎去哪」，不含返回规则。
 * 规则在 PageStack（已有 20 个单测），包括弹窗优先、栈底不可弹、replaceRoot 清栈。
 *
 * 键盘 Escape 与浏览器返回都接到同一个 goBack()——
 * PRD-09 §9 要求两者行为一致，各写一套迟早会分叉。
 */

import {
    assetManager,
    Color,
    director,
    Graphics,
    Node,
    tween,
    Tween,
    UIOpacity,
    UITransform,
} from 'cc';
import { PageStack } from 'db://assets/scripts/services/PageStack';
import type { BackResult, ModalEntry } from 'db://assets/scripts/services/PageStack';
import type { PageId, RouteEntry, SceneRouterApi } from 'db://assets/scripts/services/SceneRouter';
import { isMapBundle } from 'db://assets/scripts/services/BundleManifest';

/** 页面 ID → 场景名。场景须在对应 Bundle 内。 */
export const PAGE_SCENE_NAMES: Readonly<Record<PageId, string>> = {
    camp: 'Camp',
    building: 'Building',
    party: 'Party',
    map: 'Map',
    combat: 'Map',
};

export interface SceneRouterEvents {
    /** 页面切换完成。UI 据此刷新导航高亮。 */
    onPageChanged?: (entry: RouteEntry) => void;
    /** 已在栈底还继续返回。调用方决定提示退出还是忽略。 */
    onAtRoot?: () => void;
    /** 全局遮罩据此显示／隐藏，阻止载入期间重复点击。 */
    onLoadingChanged?: (loading: boolean) => void;
    /** 只用于需要黑屏缓动的切场流程。 */
    onFadeChanged?: (opaque: boolean) => Promise<void>;
}

export type SceneTransition = 'loading' | 'fade';

export class CocosSceneRouter implements SceneRouterApi {
    private readonly stack = new PageStack();
    private readonly events: SceneRouterEvents;
    /** 场景加载中。用于「加载期间禁止重复点击」（PRD-09 §4）。 */
    private loading = false;

    constructor(events: SceneRouterEvents = {}) {
        this.events = events;
    }

    /** 是否正在切换场景。UI 应在此期间屏蔽输入。 */
    get isLoading(): boolean {
        return this.loading;
    }

    get pageStack(): PageStack {
        return this.stack;
    }

    async push(entry: RouteEntry): Promise<void> {
        if (this.loading) {
            return;
        }
        this.stack.push(entry);
        try {
            await this.activate(entry);
        } catch (error) {
            // 页面加载失败时保留原页面，并撤销刚压入的无效路由。
            this.stack.pop();
            throw error;
        }
    }

    async pop(): Promise<void> {
        if (this.loading) {
            return;
        }
        // 栈底不可弹，pop 返回 null 时不该加载任何场景
        if (!this.stack.pop()) {
            this.events.onAtRoot?.();
            return;
        }
        const current = this.stack.current();
        if (current) {
            await this.activate(current);
        }
    }

    async replaceRoot(entry: RouteEntry, transition: SceneTransition = 'loading'): Promise<void> {
        if (this.loading) {
            return;
        }
        this.stack.replaceRoot(entry);
        await this.activate(entry, transition);
    }

    current(): RouteEntry | null {
        return this.stack.current();
    }

    depth(): number {
        return this.stack.depth();
    }

    openModal(modal: ModalEntry): void {
        this.stack.openModal(modal);
    }

    /**
     * 统一返回入口。Escape 键与浏览器 popstate 都应调用这里。
     *
     * 返回 BackResult 而非 void：关弹窗不需要加载场景，
     * 调用方要知道到底发生了什么才能正确关闭 UI 节点。
     */
    async goBack(): Promise<BackResult> {
        if (this.loading) {
            return { kind: 'atRoot' };
        }

        const result = this.stack.goBack();
        switch (result.kind) {
            case 'closedModal':
                // 弹窗由 UI 层自己销毁节点，路由不碰场景
                break;
            case 'poppedPage':
                await this.activate(result.to);
                break;
            case 'atRoot':
                this.events.onAtRoot?.();
                break;
        }
        return result;
    }

    private async activate(entry: RouteEntry, transition: SceneTransition = 'loading'): Promise<void> {
        const sceneName = PAGE_SCENE_NAMES[entry.pageId];
        this.loading = true;
        this.events.onLoadingChanged?.(true);
        try {
            if (transition === 'fade') await this.events.onFadeChanged?.(true);
            await this.ensurePageBundle(entry);
            await new Promise<void>((resolve, reject) => {
                const accepted = director.loadScene(sceneName, (error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
                if (!accepted) {
                    reject(new Error(`场景 ${sceneName} 未注册或已有场景正在加载`));
                }
            });
            this.events.onPageChanged?.(entry);
        } finally {
            if (transition === 'fade') await this.events.onFadeChanged?.(false);
            // 必须在 finally 里复位：加载失败后若停在 true，
            // 之后所有导航都会被静默忽略
            this.loading = false;
            this.events.onLoadingChanged?.(false);
        }
    }

    /** Map 与 D0 Combat 共用地图 Bundle；主动进入时不能只依赖后台预载是否完成。 */
    private async ensurePageBundle(entry: RouteEntry): Promise<void> {
        if (entry.pageId !== 'map' && entry.pageId !== 'combat') return;
        const mapId = entry.params?.mapId;
        if (typeof mapId !== 'string' || !isMapBundle(mapId)) {
            throw new Error(`无效的地图 Bundle：${String(mapId)}`);
        }
        if (assetManager.getBundle(mapId)) return;
        await new Promise<void>((resolve, reject) => {
            assetManager.loadBundle(mapId, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }
}

const SCENE_FADE_NODE = 'SceneFadeOverlay';

/** 使用持久 AppRoot 遮罩跨场景保持纯黑，避免场景销毁时过渡中断。 */
export function fadeSceneOverlay(overlay: Node | null, opaque: boolean): Promise<void> {
    if (!overlay) return Promise.resolve();
    const loadingText = overlay.getChildByName('LoadingText');
    if (opaque) {
        if (loadingText) loadingText.active = false;
        const fade = overlay.getChildByName(SCENE_FADE_NODE) ?? createFadeNode(overlay);
        const opacity = fade.getComponent(UIOpacity)!;
        opacity.opacity = 0;
        return tweenOpacity(opacity, 255, 0.28);
    }
    const fade = overlay.getChildByName(SCENE_FADE_NODE);
    if (!fade) {
        if (loadingText) loadingText.active = true;
        return Promise.resolve();
    }
    const opacity = fade.getComponent(UIOpacity)!;
    return tweenOpacity(opacity, 0, 0.36).then(() => {
        fade.destroy();
        if (loadingText?.isValid) loadingText.active = true;
    });
}

function createFadeNode(overlay: Node): Node {
    const fade = new Node(SCENE_FADE_NODE);
    fade.layer = overlay.layer;
    overlay.addChild(fade);
    const parentSize = overlay.getComponent(UITransform)?.contentSize;
    const width = parentSize?.width ?? 1080;
    const height = parentSize?.height ?? 1920;
    fade.addComponent(UITransform).setContentSize(width, height);
    const graphics = fade.addComponent(Graphics);
    graphics.fillColor = new Color(0, 0, 0, 255);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
    fade.addComponent(UIOpacity);
    return fade;
}

function tweenOpacity(opacity: UIOpacity, target: number, duration: number): Promise<void> {
    Tween.stopAllByTarget(opacity);
    return new Promise((resolve) => {
        tween(opacity)
            .to(duration, { opacity: target }, { easing: 'sineInOut' })
            .call(resolve)
            .start();
    });
}
