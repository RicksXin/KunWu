/**
 * 页面堆栈、过渡与返回规则（技术方案 §4.1、§12）。
 *
 * 职责边界：只管页面导航，不持有业务状态。
 */

/** UI 三层结构（技术方案 §12）。 */
export type UiLayer = 'page' | 'modal' | 'global';

/** 页面层清单。 */
export type PageId = 'camp' | 'building' | 'party' | 'map' | 'combat';

export interface RouteEntry {
    readonly pageId: PageId;
    readonly params?: Readonly<Record<string, unknown>>;
}

export interface SceneRouterApi {
    push(entry: RouteEntry): Promise<void>;
    /** 返回上一页。栈底页面不可弹出。 */
    pop(): Promise<void>;
    /** 清栈并跳转，用于出征/回城这类不应保留历史的切换。 */
    replaceRoot(entry: RouteEntry): Promise<void>;
    current(): RouteEntry | null;
    depth(): number;
}
