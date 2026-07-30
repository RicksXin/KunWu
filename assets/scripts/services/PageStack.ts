/**
 * 页面堆栈与返回规则（技术方案 §12、PRD-09 §4、任务 P0-HALL-001）。
 *
 * 职责边界：只维护「当前在哪、返回去哪」，不加载场景也不做动画。
 * 场景切换由 SceneRouter 的实现调用引擎完成；本类是它的纯逻辑内核，
 * 因此「返回键先关弹窗再返回页面」这类规则可单测。
 */

import type { PageId, RouteEntry, UiLayer } from './SceneRouter';

/** 弹窗条目。与页面分开存放——返回键必须先关弹窗（PRD-09 §4）。 */
export interface ModalEntry {
    readonly modalId: string;
    readonly params?: Readonly<Record<string, unknown>>;
}

/** 返回操作的结果，供调用方决定关什么。 */
export type BackResult =
    /** 关掉了一个弹窗。 */
    | { readonly kind: 'closedModal'; readonly modal: ModalEntry }
    /** 弹出了一个页面，现在停在 to。 */
    | { readonly kind: 'poppedPage'; readonly from: RouteEntry; readonly to: RouteEntry }
    /** 已在栈底且无弹窗，调用方应提示退出或忽略。 */
    | { readonly kind: 'atRoot' };

export class PageStack {
    private readonly pages: RouteEntry[] = [];
    private readonly modals: ModalEntry[] = [];

    /** 压入新页面。 */
    push(entry: RouteEntry): void {
        this.pages.push(entry);
    }

    /**
     * 弹出当前页面。栈底页面不可弹出——大厅是根，弹掉就没有可显示的页面了。
     * 返回 null 表示已在栈底。
     */
    pop(): RouteEntry | null {
        if (this.pages.length <= 1) {
            return null;
        }
        return this.pages.pop() ?? null;
    }

    /**
     * 清栈并跳转。用于出征／回城这类不应保留历史的切换：
     * 出征后按返回不该退回营地大厅的旧实例。
     */
    replaceRoot(entry: RouteEntry): void {
        this.pages.length = 0;
        this.modals.length = 0;
        this.pages.push(entry);
    }

    openModal(modal: ModalEntry): void {
        this.modals.push(modal);
    }

    closeModal(): ModalEntry | null {
        return this.modals.pop() ?? null;
    }

    /**
     * 统一的返回入口（PRD-09 §4：返回键先关弹窗，再返回页面）。
     *
     * 键盘 Escape 与浏览器返回必须走同一逻辑（PRD-09 §9：两者一致），
     * 所以只提供这一个方法，不让调用方各自拼。
     */
    goBack(): BackResult {
        const modal = this.closeModal();
        if (modal) {
            return { kind: 'closedModal', modal };
        }

        const from = this.current();
        const popped = this.pop();
        if (!popped || !from) {
            return { kind: 'atRoot' };
        }

        const to = this.current();
        if (!to) {
            // pop 成功必然还有页面（栈底不可弹），此处仅为类型收窄
            return { kind: 'atRoot' };
        }
        return { kind: 'poppedPage', from, to };
    }

    current(): RouteEntry | null {
        return this.pages[this.pages.length - 1] ?? null;
    }

    currentModal(): ModalEntry | null {
        return this.modals[this.modals.length - 1] ?? null;
    }

    depth(): number {
        return this.pages.length;
    }

    modalDepth(): number {
        return this.modals.length;
    }

    /** 是否有弹窗遮挡。页面层此时应停止接收输入。 */
    get hasModal(): boolean {
        return this.modals.length > 0;
    }

    /**
     * 当前应接收输入的层（技术方案 §12 三层结构）。
     * 有弹窗时页面层不该响应点击，否则玩家能穿过遮罩误触。
     */
    activeLayer(): UiLayer {
        return this.modals.length > 0 ? 'modal' : 'page';
    }

    /** 页面是否已在栈中，用于避免重复压入同一页。 */
    contains(pageId: PageId): boolean {
        return this.pages.some((entry) => entry.pageId === pageId);
    }

    /** 快照，便于调试与遥测（PRD-10 §9）。 */
    snapshot(): { readonly pages: readonly PageId[]; readonly modals: readonly string[] } {
        return {
            pages: this.pages.map((entry) => entry.pageId),
            modals: this.modals.map((entry) => entry.modalId),
        };
    }
}
