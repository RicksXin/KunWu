/**
 * SceneRouter 的引擎实现（技术方案 §12、PRD-09 §4、任务 #7b）。
 *
 * 职责边界：只做「PageStack 说去哪，就调引擎去哪」，不含返回规则。
 * 规则在 PageStack（已有 20 个单测），包括弹窗优先、栈底不可弹、replaceRoot 清栈。
 *
 * 键盘 Escape 与浏览器返回都接到同一个 goBack()——
 * PRD-09 §9 要求两者行为一致，各写一套迟早会分叉。
 */

import { director } from 'cc';
import { PageStack } from '../services/PageStack';
import type { BackResult, ModalEntry } from '../services/PageStack';
import type { PageId, RouteEntry, SceneRouterApi } from '../services/SceneRouter';

/** 页面 ID → 场景名。场景须在对应 Bundle 内。 */
export const PAGE_SCENE_NAMES: Readonly<Record<PageId, string>> = {
    camp: 'Camp',
    building: 'Building',
    party: 'Party',
    map: 'Map',
    combat: 'Combat',
};

export interface SceneRouterEvents {
    /** 页面切换完成。UI 据此刷新导航高亮。 */
    onPageChanged?: (entry: RouteEntry) => void;
    /** 已在栈底还继续返回。调用方决定提示退出还是忽略。 */
    onAtRoot?: () => void;
}

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
        await this.activate(entry);
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

    async replaceRoot(entry: RouteEntry): Promise<void> {
        if (this.loading) {
            return;
        }
        this.stack.replaceRoot(entry);
        await this.activate(entry);
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

    private async activate(entry: RouteEntry): Promise<void> {
        const sceneName = PAGE_SCENE_NAMES[entry.pageId];
        this.loading = true;
        try {
            await new Promise<void>((resolve, reject) => {
                director.loadScene(sceneName, (error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
            this.events.onPageChanged?.(entry);
        } finally {
            // 必须在 finally 里复位：加载失败后若停在 true，
            // 之后所有导航都会被静默忽略
            this.loading = false;
        }
    }
}
