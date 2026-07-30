import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    BrowserLifecycle,
    EVENT_GL_CONTEXT_LOST,
    EVENT_GL_CONTEXT_RESTORED,
    EVENT_PAGE_HIDE,
    EVENT_NETWORK_OFFLINE,
    EVENT_NETWORK_ONLINE,
} from 'db://assets/scripts/services/BrowserLifecycle';
import { EventBus } from 'db://assets/scripts/services/EventBus';

/**
 * 最小 EventTarget 替身。
 * Node 有内置 EventTarget，但需要能断言「监听器确实被移除」，
 * 故自己记账而非依赖内置实现。
 */
class FakeTarget implements EventTarget {
    readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

    addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
        if (!listener) {
            return;
        }
        let set = this.listeners.get(type);
        if (!set) {
            set = new Set();
            this.listeners.set(type, set);
        }
        set.add(listener);
    }

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
        if (!listener) {
            return;
        }
        this.listeners.get(type)?.delete(listener);
    }

    dispatchEvent(event: Event): boolean {
        for (const listener of this.listeners.get(event.type) ?? []) {
            if (typeof listener === 'function') {
                listener(event);
            } else {
                listener.handleEvent(event);
            }
        }
        return true;
    }

    /** 当前注册的监听器总数，用于验证 stop() 清理干净。 */
    get totalListeners(): number {
        let count = 0;
        for (const set of this.listeners.values()) {
            count += set.size;
        }
        return count;
    }
}

/** 记录 preventDefault 是否被调用——决定浏览器是否发送 restored 事件。 */
class FakeEvent {
    readonly type: string;
    defaultPrevented = false;

    constructor(type: string) {
        this.type = type;
    }

    preventDefault(): void {
        this.defaultPrevented = true;
    }
}

/**
 * BrowserLifecycle.start 会读全局 document/window 做支持性检测，
 * Node 下没有，故临时注入替身。
 */
function withFakeGlobals<T>(windowTarget: FakeTarget, run: () => T): T {
    const globals = globalThis as Record<string, unknown>;
    const hadDocument = 'document' in globals;
    const hadWindow = 'window' in globals;
    const prevDocument = globals.document;
    const prevWindow = globals.window;

    globals.document = {};
    globals.window = windowTarget;
    try {
        return run();
    } finally {
        if (hadDocument) {
            globals.document = prevDocument;
        } else {
            delete globals.document;
        }
        if (hadWindow) {
            globals.window = prevWindow;
        } else {
            delete globals.window;
        }
    }
}

describe('BrowserLifecycle', () => {
    let active: BrowserLifecycle | null = null;

    afterEach(() => {
        active?.stop();
        active = null;
    });

    test('Node 环境下 isSupported 为 false', () => {
        // 没有 document/window 时不应尝试注册监听
        assert.equal(BrowserLifecycle.isSupported(), false);
    });

    test('不支持的环境下 start 静默返回', () => {
        const bus = new EventBus();
        const lifecycle = new BrowserLifecycle(bus);
        // 不抛错即为通过
        lifecycle.start(null);
    });

    test('WebGL 上下文丢失转成领域事件，且阻止默认行为', () => {
        const canvas = new FakeTarget();
        const win = new FakeTarget();
        const bus = new EventBus();
        let fired = 0;
        bus.on(EVENT_GL_CONTEXT_LOST, () => {
            fired += 1;
        });

        withFakeGlobals(win, () => {
            const lifecycle = new BrowserLifecycle(bus);
            active = lifecycle;
            lifecycle.start(canvas as unknown as HTMLCanvasElement);

            const event = new FakeEvent('webglcontextlost');
            canvas.dispatchEvent(event as unknown as Event);

            assert.equal(fired, 1);
            // 不 preventDefault 浏览器就不会触发 restored，恢复逻辑永远等不到
            assert.equal(event.defaultPrevented, true);
        });
    });

    test('上下文恢复转成领域事件', () => {
        const canvas = new FakeTarget();
        const win = new FakeTarget();
        const bus = new EventBus();
        let fired = 0;
        bus.on(EVENT_GL_CONTEXT_RESTORED, () => {
            fired += 1;
        });

        withFakeGlobals(win, () => {
            const lifecycle = new BrowserLifecycle(bus);
            active = lifecycle;
            lifecycle.start(canvas as unknown as HTMLCanvasElement);
            canvas.dispatchEvent(new FakeEvent('webglcontextrestored') as unknown as Event);
            assert.equal(fired, 1);
        });
    });

    test('canvas 为空时仍注册 window 事件', () => {
        const win = new FakeTarget();
        const bus = new EventBus();
        let offline = 0;
        bus.on(EVENT_NETWORK_OFFLINE, () => {
            offline += 1;
        });

        withFakeGlobals(win, () => {
            const lifecycle = new BrowserLifecycle(bus);
            active = lifecycle;
            lifecycle.start(null);
            win.dispatchEvent(new FakeEvent('offline') as unknown as Event);
            // 拿不到画布不该导致断网检测也失效
            assert.equal(offline, 1);
        });
    });

    test('断网与恢复分别广播', () => {
        const win = new FakeTarget();
        const bus = new EventBus();
        const seen: string[] = [];
        bus.on(EVENT_NETWORK_OFFLINE, () => seen.push('offline'));
        bus.on(EVENT_NETWORK_ONLINE, () => seen.push('online'));

        withFakeGlobals(win, () => {
            const lifecycle = new BrowserLifecycle(bus);
            active = lifecycle;
            lifecycle.start(null);
            win.dispatchEvent(new FakeEvent('offline') as unknown as Event);
            win.dispatchEvent(new FakeEvent('online') as unknown as Event);
            assert.deepEqual(seen, ['offline', 'online']);
        });
    });

    test('pagehide 携带时间戳，供最后存档使用', () => {
        const win = new FakeTarget();
        const bus = new EventBus();
        // 用数组收集而非可空变量：TS 的控制流分析看不到回调里的赋值，
        // 会把变量收窄成 never
        const received: { atUtc: number }[] = [];
        bus.on<{ atUtc: number }>(EVENT_PAGE_HIDE, (value) => {
            received.push(value);
        });

        withFakeGlobals(win, () => {
            const lifecycle = new BrowserLifecycle(bus);
            active = lifecycle;
            lifecycle.start(null);
            win.dispatchEvent(new FakeEvent('pagehide') as unknown as Event);
        });

        assert.equal(received.length, 1);
        assert.equal(typeof received[0]?.atUtc, 'number');
    });

    test('stop 移除全部监听，避免场景切换后泄漏', () => {
        const canvas = new FakeTarget();
        const win = new FakeTarget();
        const bus = new EventBus();

        withFakeGlobals(win, () => {
            const lifecycle = new BrowserLifecycle(bus);
            lifecycle.start(canvas as unknown as HTMLCanvasElement);
            assert.ok(canvas.totalListeners > 0);
            assert.ok(win.totalListeners > 0);

            lifecycle.stop();
            assert.equal(canvas.totalListeners, 0);
            assert.equal(win.totalListeners, 0);
        });
    });

    test('重复 start 不叠加监听', () => {
        const canvas = new FakeTarget();
        const win = new FakeTarget();
        const bus = new EventBus();

        withFakeGlobals(win, () => {
            const lifecycle = new BrowserLifecycle(bus);
            active = lifecycle;
            lifecycle.start(canvas as unknown as HTMLCanvasElement);
            const afterFirst = canvas.totalListeners + win.totalListeners;

            lifecycle.start(canvas as unknown as HTMLCanvasElement);
            const afterSecond = canvas.totalListeners + win.totalListeners;

            // start 内部先 stop，故总数不变
            assert.equal(afterSecond, afterFirst);
        });
    });

    test('stop 后事件不再触发', () => {
        const canvas = new FakeTarget();
        const win = new FakeTarget();
        const bus = new EventBus();
        let fired = 0;
        bus.on(EVENT_GL_CONTEXT_LOST, () => {
            fired += 1;
        });

        withFakeGlobals(win, () => {
            const lifecycle = new BrowserLifecycle(bus);
            lifecycle.start(canvas as unknown as HTMLCanvasElement);
            lifecycle.stop();
            canvas.dispatchEvent(new FakeEvent('webglcontextlost') as unknown as Event);
            assert.equal(fired, 0);
        });
    });
});
