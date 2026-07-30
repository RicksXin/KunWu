/**
 * 跨场景领域事件（技术方案 §4.1）。
 *
 * 职责边界：只广播领域事件，不承担高频逐帧广播。
 * 战斗内每 tick 的表现事件走 CombatEvent 队列，不经过这里。
 */
export type EventHandler<T = unknown> = (payload: T) => void;

export class EventBus {
    private readonly handlers = new Map<string, Set<EventHandler<never>>>();

    on<T>(event: string, handler: EventHandler<T>): () => void {
        let set = this.handlers.get(event);
        if (!set) {
            set = new Set();
            this.handlers.set(event, set);
        }
        set.add(handler as EventHandler<never>);
        return () => this.off(event, handler);
    }

    once<T>(event: string, handler: EventHandler<T>): () => void {
        const dispose = this.on<T>(event, (payload) => {
            dispose();
            handler(payload);
        });
        return dispose;
    }

    off<T>(event: string, handler: EventHandler<T>): void {
        const set = this.handlers.get(event);
        if (!set) {
            return;
        }
        set.delete(handler as EventHandler<never>);
        if (set.size === 0) {
            this.handlers.delete(event);
        }
    }

    emit<T>(event: string, payload: T): void {
        const set = this.handlers.get(event);
        if (!set) {
            return;
        }
        // 复制一份再遍历：处理器内部可能注销自己或注册新处理器
        for (const handler of Array.from(set)) {
            try {
                (handler as EventHandler<T>)(payload);
            } catch (error) {
                console.error(`[EventBus] 处理 ${event} 时出错`, error);
            }
        }
    }

    /** 场景切换时清理，防止已销毁节点的处理器泄漏。 */
    clear(event?: string): void {
        if (event) {
            this.handlers.delete(event);
        } else {
            this.handlers.clear();
        }
    }
}
