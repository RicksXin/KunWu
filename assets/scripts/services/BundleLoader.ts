/**
 * Bundle 加载、预载、卸载与失败重试（PRD-10 §3、§8、任务 P0-TECH-003b）。
 *
 * 职责边界：只管「何时加载哪个包、失败怎么退避、何时可卸载」，
 * 不碰具体引擎 API——那部分在 BundleHost 接口后面，故本类可在 Node 下单测。
 *
 * 与 SaveRepository/SaveBackend 同一模式：策略在领域层，引擎调用在后端。
 */

import type { BundleName } from './BundleManifest';
import {
    BOOT_BUNDLES,
    PRELOAD_RULES,
    CONDITIONAL_PRELOAD,
    MAP_BUNDLES,
} from './BundleManifest';

/** 加载失败的错误码，用于错误页展示（PRD-10 §8：显示错误码）。 */
export const ERROR_CODE_BUNDLE_LOAD = 'TECH-003-BUNDLE';

/** 重试次数上限。超过后交由调用方决定返回大厅还是重试（PRD-10 §8）。 */
export const MAX_LOAD_ATTEMPTS = 3;

/** 重试退避基数，毫秒。第 n 次重试等待 BASE * 2^(n-1)。 */
export const RETRY_BACKOFF_BASE_MS = 400;

/** 引擎侧的 Bundle 操作。由表现层用 cc.assetManager 实现。 */
export interface BundleHost {
    /** 加载并返回是否成功。抛错视为失败，由本类负责重试。 */
    load(name: BundleName): Promise<void>;
    /** 释放包内资源。已卸载的包重复调用应无害。 */
    release(name: BundleName): void;
    /** 引擎是否已持有该包。用于避免重复加载。 */
    isLoaded(name: BundleName): boolean;
}

/** 延时函数。注入以便测试不真等待。 */
export type SleepFn = (ms: number) => Promise<void>;

export class BundleLoadError extends Error {
    readonly code = ERROR_CODE_BUNDLE_LOAD;
    readonly bundleName: string;
    readonly attempts: number;

    constructor(bundleName: string, attempts: number, cause: unknown) {
        super(
            `Bundle ${bundleName} 加载失败（${ERROR_CODE_BUNDLE_LOAD}），` +
                `已尝试 ${attempts} 次：${cause instanceof Error ? cause.message : String(cause)}`,
        );
        this.name = 'BundleLoadError';
        this.bundleName = bundleName;
        this.attempts = attempts;
    }
}

export interface BundleLoaderOptions {
    readonly host: BundleHost;
    readonly sleep?: SleepFn;
    /** 日志钩子，便于把预载情况接到遥测（PRD-10 §9）。 */
    readonly onEvent?: (event: BundleLoaderEvent) => void;
}

export type BundleLoaderEvent =
    | { readonly kind: 'loadStarted'; readonly bundle: BundleName }
    | { readonly kind: 'loadSucceeded'; readonly bundle: BundleName; readonly attempts: number }
    | { readonly kind: 'loadRetrying'; readonly bundle: BundleName; readonly attempt: number }
    | { readonly kind: 'loadFailed'; readonly bundle: BundleName; readonly attempts: number }
    | { readonly kind: 'released'; readonly bundle: BundleName }
    | { readonly kind: 'preloadSkipped'; readonly bundle: BundleName; readonly reason: string };

export class BundleLoader {
    private readonly host: BundleHost;
    private readonly sleep: SleepFn;
    private readonly onEvent: (event: BundleLoaderEvent) => void;

    /** 进行中的加载。同一包并发请求复用同一 Promise，避免重复下载。 */
    private readonly inFlight = new Map<BundleName, Promise<void>>();

    constructor(options: BundleLoaderOptions) {
        this.host = options.host;
        this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
        this.onEvent = options.onEvent ?? (() => undefined);
    }

    /**
     * 加载单个包，失败按指数退避重试。
     *
     * 并发调用同一包时复用同一 Promise——预载与玩家主动进入可能同时触发，
     * 各自独立下载会浪费流量并可能导致引擎内重复注册。
     */
    async load(name: BundleName): Promise<void> {
        if (this.host.isLoaded(name)) {
            return;
        }

        const existing = this.inFlight.get(name);
        if (existing) {
            return existing;
        }

        const task = this.loadWithRetry(name).finally(() => {
            this.inFlight.delete(name);
        });
        this.inFlight.set(name, task);
        return task;
    }

    private async loadWithRetry(name: BundleName): Promise<void> {
        this.onEvent({ kind: 'loadStarted', bundle: name });

        let lastError: unknown;
        for (let attempt = 1; attempt <= MAX_LOAD_ATTEMPTS; attempt += 1) {
            try {
                await this.host.load(name);
                this.onEvent({ kind: 'loadSucceeded', bundle: name, attempts: attempt });
                return;
            } catch (error) {
                lastError = error;
                if (attempt < MAX_LOAD_ATTEMPTS) {
                    this.onEvent({ kind: 'loadRetrying', bundle: name, attempt });
                    // 指数退避：弱网下立即重试大概率同样失败，反而拖长总耗时
                    await this.sleep(RETRY_BACKOFF_BASE_MS * 2 ** (attempt - 1));
                }
            }
        }

        this.onEvent({ kind: 'loadFailed', bundle: name, attempts: MAX_LOAD_ATTEMPTS });
        throw new BundleLoadError(name, MAX_LOAD_ATTEMPTS, lastError);
    }

    /**
     * 加载首屏包（PRD-10 §3）。
     * 串行而非并行：首屏带宽有限，并行会让两个包都变慢，
     * 而 start-scene 先到就能先显示加载界面。
     */
    async loadBootBundles(): Promise<void> {
        for (const name of BOOT_BUNDLES) {
            await this.load(name);
        }
    }

    /**
     * 按预载规则在后台加载。
     *
     * 不 await 结果也不抛错：预载失败不该打断当前玩法，
     * 玩家真正进入该地图时会走 load() 重试并在那时报错。
     */
    preloadFor(triggerId: string, unlockedConditionalBundles: readonly string[] = []): void {
        for (const target of PRELOAD_RULES[triggerId] ?? []) {
            void this.load(target).catch(() => {
                // 预载失败静默：真正需要时 load() 会重试并报错
            });
        }

        for (const rule of CONDITIONAL_PRELOAD) {
            if (rule.fromMapId !== triggerId) {
                continue;
            }
            if (!unlockedConditionalBundles.includes(rule.bundle)) {
                // 未满足条件不预载：既省流量，也避免玩家从网络请求发现隐藏内容
                this.onEvent({
                    kind: 'preloadSkipped',
                    bundle: rule.bundle,
                    reason: rule.reason,
                });
                continue;
            }
            void this.load(rule.bundle).catch(() => undefined);
        }
    }

    /**
     * 卸载除保留项外的所有地图包（PRD-10 §11：五图切换无持续内存增长）。
     *
     * 只动地图包：shared/camp 等常驻包卸载后马上又要重新加载，
     * 反而增加卡顿。
     */
    releaseMapBundlesExcept(keep: readonly BundleName[]): void {
        for (const name of MAP_BUNDLES) {
            if (keep.includes(name) || !this.host.isLoaded(name)) {
                continue;
            }
            this.host.release(name);
            this.onEvent({ kind: 'released', bundle: name });
        }
    }

    /** 当前是否有加载在进行，用于「加载期间禁止重复点击」（PRD-09 §4）。 */
    get isBusy(): boolean {
        return this.inFlight.size > 0;
    }

    /** 进行中的包名，便于 UI 展示加载进度。 */
    get pendingBundles(): readonly BundleName[] {
        return Array.from(this.inFlight.keys());
    }
}
