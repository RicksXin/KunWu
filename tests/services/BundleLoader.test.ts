import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    BundleLoader,
    BundleLoadError,
    MAX_LOAD_ATTEMPTS,
    ERROR_CODE_BUNDLE_LOAD,
} from 'db://assets/scripts/services/BundleLoader';
import type { BundleHost, BundleLoaderEvent } from 'db://assets/scripts/services/BundleLoader';
import type { BundleName } from 'db://assets/scripts/services/BundleManifest';

/**
 * 可编程的 BundleHost 替身。
 * 记录调用序列，以便断言「串行/并发」「是否重复下载」这类行为。
 */
class FakeHost implements BundleHost {
    readonly loadCalls: BundleName[] = [];
    readonly releaseCalls: BundleName[] = [];
    private readonly loaded = new Set<BundleName>();
    /** 包名 → 还需失败几次。用于测试重试。 */
    readonly failures = new Map<BundleName, number>();
    /** 手动控制加载完成时机，用于测试并发去重。 */
    private readonly gates = new Map<BundleName, () => void>();
    useGate = false;

    async load(name: BundleName): Promise<void> {
        this.loadCalls.push(name);

        const remaining = this.failures.get(name) ?? 0;
        if (remaining > 0) {
            this.failures.set(name, remaining - 1);
            throw new Error(`模拟网络失败 ${name}`);
        }

        if (this.useGate) {
            await new Promise<void>((resolve) => {
                this.gates.set(name, resolve);
            });
        }

        this.loaded.add(name);
    }

    release(name: BundleName): void {
        this.releaseCalls.push(name);
        this.loaded.delete(name);
    }

    isLoaded(name: BundleName): boolean {
        return this.loaded.has(name);
    }

    /** 放行被 gate 挡住的加载。 */
    openGate(name: BundleName): void {
        const resolve = this.gates.get(name);
        this.gates.delete(name);
        resolve?.();
    }

    markLoaded(...names: BundleName[]): void {
        for (const name of names) {
            this.loaded.add(name);
        }
    }

    countLoads(name: BundleName): number {
        return this.loadCalls.filter((item) => item === name).length;
    }
}

/** 不真等待的 sleep，避免测试因退避而变慢。 */
const noSleep = async (): Promise<void> => undefined;

function makeLoader(host: FakeHost, events: BundleLoaderEvent[] = []) {
    return new BundleLoader({
        host,
        sleep: noSleep,
        onEvent: (event) => events.push(event),
    });
}

describe('BundleLoader.load', () => {
    test('成功加载一次即返回', async () => {
        const host = new FakeHost();
        const loader = makeLoader(host);
        await loader.load('shared');
        assert.deepEqual(host.loadCalls, ['shared']);
    });

    test('已加载的包不重复请求', async () => {
        const host = new FakeHost();
        host.markLoaded('shared');
        const loader = makeLoader(host);
        await loader.load('shared');
        assert.equal(host.loadCalls.length, 0);
    });

    test('失败后重试，第二次成功', async () => {
        const host = new FakeHost();
        host.failures.set('map_01', 1);
        const loader = makeLoader(host);
        await loader.load('map_01');
        assert.equal(host.countLoads('map_01'), 2);
    });

    test('连续失败达上限后抛 BundleLoadError', async () => {
        const host = new FakeHost();
        host.failures.set('map_01', 99);
        const loader = makeLoader(host);

        await assert.rejects(
            () => loader.load('map_01'),
            (error: unknown) => {
                assert.ok(error instanceof BundleLoadError);
                assert.equal(error.code, ERROR_CODE_BUNDLE_LOAD);
                assert.equal(error.attempts, MAX_LOAD_ATTEMPTS);
                assert.equal(error.bundleName, 'map_01');
                return true;
            },
        );
        assert.equal(host.countLoads('map_01'), MAX_LOAD_ATTEMPTS);
    });

    test('错误信息含错误码，供错误页展示（PRD-10 §8）', async () => {
        const host = new FakeHost();
        host.failures.set('map_01', 99);
        const loader = makeLoader(host);
        await assert.rejects(() => loader.load('map_01'), new RegExp(ERROR_CODE_BUNDLE_LOAD));
    });

    test('并发请求同一包只下载一次', async () => {
        const host = new FakeHost();
        host.useGate = true;
        const loader = makeLoader(host);

        const first = loader.load('map_01');
        const second = loader.load('map_01');
        // 预载与玩家主动进入可能同时触发，各自下载会浪费流量
        assert.equal(host.countLoads('map_01'), 1);

        host.openGate('map_01');
        await Promise.all([first, second]);
        assert.equal(host.countLoads('map_01'), 1);
    });

    test('加载完成后可再次加载（inFlight 已清理）', async () => {
        const host = new FakeHost();
        const loader = makeLoader(host);
        await loader.load('map_01');
        host.release('map_01');
        await loader.load('map_01');
        assert.equal(host.countLoads('map_01'), 2);
    });

    test('失败后 inFlight 清理，可重新尝试', async () => {
        const host = new FakeHost();
        host.failures.set('map_01', 99);
        const loader = makeLoader(host);

        await assert.rejects(() => loader.load('map_01'));
        assert.equal(loader.isBusy, false);

        host.failures.set('map_01', 0);
        await loader.load('map_01');
        assert.ok(host.isLoaded('map_01'));
    });
});

describe('BundleLoader 首屏', () => {
    test('按 BOOT_BUNDLES 顺序串行加载', async () => {
        const host = new FakeHost();
        const loader = makeLoader(host);
        await loader.loadBootBundles();
        // 启动场景随主包发布，首屏只拉 shared
        assert.deepEqual(host.loadCalls, ['shared']);
    });

    test('首屏包加载失败会抛出，不静默', async () => {
        const host = new FakeHost();
        host.failures.set('shared', 99);
        const loader = makeLoader(host);
        // 首屏失败必须让调用方知道，否则玩家看到永久黑屏
        await assert.rejects(() => loader.loadBootBundles(), BundleLoadError);
    });
});

describe('BundleLoader 预载', () => {
    test('营地触发预载 map_01（PRD-10 §3）', async () => {
        const host = new FakeHost();
        const loader = makeLoader(host);
        loader.preloadFor('camp');
        await Promise.resolve();
        assert.ok(host.loadCalls.includes('map_01'));
    });

    test('预载失败不抛错', async () => {
        const host = new FakeHost();
        host.failures.set('map_01', 99);
        const loader = makeLoader(host);

        // 预载失败不该打断当前玩法
        loader.preloadFor('camp');
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(loader.isBusy, false);
    });

    test('条件未满足时不预载 map_04，并记录原因', async () => {
        const host = new FakeHost();
        const events: BundleLoaderEvent[] = [];
        const loader = makeLoader(host, events);

        loader.preloadFor('map_02');
        await Promise.resolve();

        // 未满足条件不该消耗流量，也不该让玩家从网络请求发现隐藏内容
        assert.equal(host.loadCalls.includes('map_04'), false);
        const skipped = events.find((event) => event.kind === 'preloadSkipped');
        assert.ok(skipped, '应记录跳过原因');
    });

    test('条件满足后预载 map_04', async () => {
        const host = new FakeHost();
        const loader = makeLoader(host);
        loader.preloadFor('map_02', ['map_04']);
        await Promise.resolve();
        assert.ok(host.loadCalls.includes('map_04'));
    });

    test('map_02 的常规预载 map_03 不受条件影响', async () => {
        const host = new FakeHost();
        const loader = makeLoader(host);
        loader.preloadFor('map_02');
        await Promise.resolve();
        assert.ok(host.loadCalls.includes('map_03'));
    });

    test('map_03 无条件预载 map_04（常规出口，PRD-05 §3）', async () => {
        const host = new FakeHost();
        const loader = makeLoader(host);
        loader.preloadFor('map_03');
        await Promise.resolve();
        assert.ok(host.loadCalls.includes('map_04'));
    });

    test('未知触发点不加载任何包', async () => {
        const host = new FakeHost();
        const loader = makeLoader(host);
        loader.preloadFor('nonexistent_scene');
        await Promise.resolve();
        assert.deepEqual(host.loadCalls, []);
    });
});

describe('BundleLoader 卸载', () => {
    test('卸载除保留项外的地图包（PRD-10 §11）', () => {
        const host = new FakeHost();
        host.markLoaded('map_01', 'map_02', 'map_03', 'shared', 'camp');
        const loader = makeLoader(host);

        loader.releaseMapBundlesExcept(['map_03']);

        assert.ok(host.releaseCalls.includes('map_01'));
        assert.ok(host.releaseCalls.includes('map_02'));
        assert.equal(host.releaseCalls.includes('map_03'), false);
    });

    test('不卸载 shared 与 camp 等常驻包', () => {
        const host = new FakeHost();
        host.markLoaded('shared', 'camp', 'career_base', 'career_tier_1', 'map_01');
        const loader = makeLoader(host);

        loader.releaseMapBundlesExcept([]);

        // 常驻包卸载后马上又要加载，反而增加卡顿
        for (const resident of ['shared', 'camp', 'career_base', 'career_tier_1']) {
            assert.equal(
                host.releaseCalls.includes(resident as BundleName),
                false,
                `${resident} 不该被卸载`,
            );
        }
        assert.ok(host.releaseCalls.includes('map_01'));
    });

    test('未加载的包不调用 release', () => {
        const host = new FakeHost();
        host.markLoaded('map_01');
        const loader = makeLoader(host);

        loader.releaseMapBundlesExcept([]);
        assert.deepEqual(host.releaseCalls, ['map_01']);
    });

    test('反复卸载不重复调用', () => {
        const host = new FakeHost();
        host.markLoaded('map_01');
        const loader = makeLoader(host);

        loader.releaseMapBundlesExcept([]);
        loader.releaseMapBundlesExcept([]);
        assert.equal(host.releaseCalls.length, 1);
    });
});

describe('BundleLoader 忙碌状态', () => {
    test('加载中 isBusy 为 true，完成后为 false', async () => {
        const host = new FakeHost();
        host.useGate = true;
        const loader = makeLoader(host);

        const task = loader.load('map_01');
        // 「加载期间禁止重复点击」依赖此状态（PRD-09 §4）
        assert.equal(loader.isBusy, true);
        assert.deepEqual([...loader.pendingBundles], ['map_01']);

        host.openGate('map_01');
        await task;
        assert.equal(loader.isBusy, false);
        assert.deepEqual([...loader.pendingBundles], []);
    });

    test('空闲时 isBusy 为 false', () => {
        const loader = makeLoader(new FakeHost());
        assert.equal(loader.isBusy, false);
    });
});

describe('BundleLoader 事件', () => {
    test('成功路径广播 started 与 succeeded', async () => {
        const host = new FakeHost();
        const events: BundleLoaderEvent[] = [];
        const loader = makeLoader(host, events);

        await loader.load('shared');
        assert.deepEqual(
            events.map((event) => event.kind),
            ['loadStarted', 'loadSucceeded'],
        );
    });

    test('重试路径广播 retrying', async () => {
        const host = new FakeHost();
        host.failures.set('map_01', 1);
        const events: BundleLoaderEvent[] = [];
        const loader = makeLoader(host, events);

        await loader.load('map_01');
        assert.ok(events.some((event) => event.kind === 'loadRetrying'));
    });

    test('失败路径广播 failed 并带尝试次数', async () => {
        const host = new FakeHost();
        host.failures.set('map_01', 99);
        const events: BundleLoaderEvent[] = [];
        const loader = makeLoader(host, events);

        await assert.rejects(() => loader.load('map_01'));
        const failed = events.find((event) => event.kind === 'loadFailed');
        assert.ok(failed);
        assert.equal(
            failed.kind === 'loadFailed' ? failed.attempts : 0,
            MAX_LOAD_ATTEMPTS,
        );
    });
});
