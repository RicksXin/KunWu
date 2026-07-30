import { _decorator, Component, Label, Node, director } from 'cc';
import { AppRoot } from '../AppRoot';
import { BundleLoader } from '../services/BundleLoader';
import { CocosBundleHost } from './CocosBundleHost';
import { runBootSequence, BOOT_STAGE_MESSAGE_KEYS } from '../services/BootSequence';
import type { BootStage, BootFailure } from '../services/BootSequence';
import { MemorySaveBackend } from '../services/MemorySaveBackend';
import { IndexedDbSaveBackend } from '../services/IndexedDbSaveBackend';
import { SaveRepository } from '../services/SaveRepository';

const { ccclass, property } = _decorator;

/**
 * 把启动流程接到引擎（任务 #16）。
 *
 * 职责边界：只做「引擎 API ↔ 领域接口」的转接与文案显示。
 * 流程本身在 BootSequence（15 个单测覆盖成功与三类失败分支）。
 *
 * 挂在启动场景的 Splash 节点上，与 AppRoot 同场景。
 */
@ccclass('GameBootstrap')
export class GameBootstrap extends Component {
    /** 状态文案，显示当前阶段。 */
    @property(Label)
    statusLabel: Label | null = null;

    /** 整个启动层，进营地后隐藏。 */
    @property(Node)
    splashRoot: Node | null = null;

    /** 营地场景名。与 CocosSceneRouter 的 PAGE_SCENE_NAMES 保持一致。 */
    private static readonly CAMP_SCENE = 'Camp';

    protected override onLoad(): void {
        // 延后一帧启动：让 AppRoot 的 onLoad 先跑完，否则 AppRoot.instance 会抛错
        this.scheduleOnce(() => void this.boot(), 0);
    }

    private async boot(): Promise<void> {
        const app = AppRoot.instance;
        const loader = new BundleLoader({
            host: new CocosBundleHost(),
            onEvent: (event) => app.events.emit(`bundle.${event.kind}`, event),
        });
        const saves = await this.createSaveRepository();

        const result = await runBootSequence({
            loadBootBundles: () => loader.loadBootBundles(),
            loadBundle: (name) => loader.load(name),
            preloadFor: (id) => loader.preloadFor(id),
            loadSave: () => saves.load(),
            enterCamp: () => this.loadScene(GameBootstrap.CAMP_SCENE),
            onStage: (stage) => this.showStage(stage),
            onSaveDiagnostics: (diagnostics) => {
                // 坏档不阻断启动，但要留痕——玩家可据此决定是否导出备份
                console.warn('[启动] 存档诊断：', diagnostics.join('；'));
                app.events.emit('save.diagnostics', { diagnostics });
            },
        });

        if (!result.ok && result.failure) {
            this.showFailure(result.failure);
            return;
        }

        // 进营地成功，撤掉启动层
        if (this.splashRoot) {
            this.splashRoot.active = false;
        }
    }

    /**
     * 存档后端。IndexedDB 不可用时降级到内存
     * （PRD-10 §8：保留内存状态并提示导出）。
     */
    private async createSaveRepository(): Promise<SaveRepository> {
        const options = {
            gameVersion: '0.1.0',
            nowUtcSeconds: () => AppRoot.instance.time.nowUtcSeconds(),
        };

        if (IndexedDbSaveBackend.isSupported()) {
            const backend = new IndexedDbSaveBackend();
            try {
                await backend.open();
                return new SaveRepository(backend, options);
            } catch (error) {
                console.warn('[启动] IndexedDB 打开失败，降级到内存存档', error);
            }
        }
        return new SaveRepository(new MemorySaveBackend(), options);
    }

    private loadScene(sceneName: string): Promise<void> {
        return new Promise((resolve, reject) => {
            director.loadScene(sceneName, (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve();
            });
        });
    }

    private showStage(stage: BootStage): void {
        // 本地化表在 shared 包里，首屏阶段可能还没加载完，
        // 故直接用内置中文兜底，不等本地化服务
        this.setStatus(FALLBACK_STAGE_TEXT[stage] ?? BOOT_STAGE_MESSAGE_KEYS[stage]);
    }

    private showFailure(failure: BootFailure): void {
        this.setStatus(FALLBACK_FAILURE_TEXT[failure.kind]);
        console.error(`[启动失败] ${failure.kind}: ${failure.message}`);
    }

    private setStatus(text: string): void {
        if (this.statusLabel) {
            this.statusLabel.string = text;
        }
    }
}

/**
 * 启动阶段的兜底文案。
 * 与 localization/zh_cn.json 的 splash.* 保持一致——
 * 本地化表随 shared 包加载，而启动画面必须在那之前就能显示。
 */
const FALLBACK_STAGE_TEXT: Readonly<Record<BootStage, string>> = {
    loadingBoot: '正在载入天地',
    loadingSave: '正在唤醒记忆',
    loadingCamp: '正在搭建营地',
    enteringCamp: '正在推开山门',
    done: '已就绪',
};

const FALLBACK_FAILURE_TEXT: Readonly<Record<BootFailure['kind'], string>> = {
    bootBundleFailed: '核心资源加载失败，请检查网络后刷新页面',
    campBundleFailed: '营地资源加载失败，请刷新页面重试',
    sceneFailed: '场景载入失败，请刷新页面重试',
};
