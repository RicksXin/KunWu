import { _decorator, assetManager, Component, JsonAsset, Label, Node } from 'cc';
import { AppRoot } from '../AppRoot';
import { BundleLoader } from '../services/BundleLoader';
import { CocosBundleHost } from './CocosBundleHost';
import { runBootSequence, BOOT_STAGE_MESSAGE_KEYS } from '../services/BootSequence';
import type { BootStage, BootFailure } from '../services/BootSequence';
import { MemorySaveBackend } from '../services/MemorySaveBackend';
import { IndexedDbSaveBackend } from '../services/IndexedDbSaveBackend';
import { SaveRepository } from '../services/SaveRepository';
import type { SaveLoadResult } from '../services/SaveRepository';
import {
    createDefaultProfile,
    deserializeProfile,
    migrateProfileV1ToV2,
    migrateProfileV2ToV3,
    migrateProfileV3ToV4,
    serializeProfile,
} from '../services/ProfileCodec';
import {
    LING_PU_CONFIG_ID,
    LING_PU_CONFIG_TABLE,
    parseLingPuConfig,
} from '../domain/LingPu';
import type { LingPuConfig } from '../domain/LingPu';
import {
    EXPEDITION_CONFIG_ID,
    EXPEDITION_CONFIG_TABLE,
    parseExpeditionPreparationConfig,
} from '../domain/ExpeditionPreparation';
import type { ExpeditionPreparationConfig } from '../domain/ExpeditionPreparation';

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
        app.installSaveRepository(saves);

        const result = await runBootSequence({
            loadBootBundles: () => loader.loadBootBundles(),
            loadBundle: (name) => loader.load(name),
            preloadFor: (id) => loader.preloadFor(id),
            loadSave: () => this.loadAndPrepareProfile(saves),
            enterCamp: () => app.router.replaceRoot({ pageId: 'camp' }),
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
            migrations: new Map([
                [1, migrateProfileV1ToV2],
                [2, migrateProfileV2ToV3],
                [3, migrateProfileV3ToV4],
            ]),
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

    /**
     * 在切入 Camp 之前就把 Profile 放进 GameState。
     * 营地各 Presenter 的 onLoad 因此能立即读到真实 Wallet，
     * 不会闪过场景默认的 0。
     */
    private async loadAndPrepareProfile(saves: SaveRepository): Promise<SaveLoadResult> {
        const app = AppRoot.instance;
        await this.loadLingPuConfig();
        await this.loadExpeditionPreparationConfig();
        const loaded = await saves.load();

        let profile;
        if (loaded.envelope) {
            profile = deserializeProfile(loaded.envelope.payload);
        } else {
            const seed = await this.loadDefaultProfileSeed();
            profile = createDefaultProfile(seed, app.time.nowUtcSeconds());
        }

        // P1 不结算浏览器关闭或后台期间的收益；加载后从当前时刻重新计在线周期。
        profile.camp.lastSettledAtUtc = app.time.nowUtcSeconds();
        const envelope = await saves.save(serializeProfile(profile));
        const result: SaveLoadResult = {
            status: loaded.envelope ? loaded.status : 'ok',
            envelope,
            // “主档不存在”对首次启动是正常情况，不当作坏档诊断。
            diagnostics: loaded.diagnostics.filter((line) => line !== '主档不存在'),
        };

        app.state.load(profile);
        app.events.emit('profile.loaded', { source: loaded.status });
        app.events.emit('wallet.changed', { wallet: profile.wallet });
        return result;
    }

    /** shared Bundle 内的数据种子是新档数值的唯一来源。 */
    private loadDefaultProfileSeed(): Promise<unknown> {
        return this.loadSharedJson('default_profile');
    }

    /** 灵圃数值表在读取/迁移 Profile 前完成注册，Presenter 不持有硬编码费用。 */
    private async loadLingPuConfig(): Promise<void> {
        const app = AppRoot.instance;
        if (app.data.has(LING_PU_CONFIG_TABLE)) {
            return;
        }
        const raw = (await this.loadSharedJson('ling_pu_config')) as {
            ling_pu?: unknown;
        };
        app.data.registerTable<LingPuConfig>(
            {
                tableName: LING_PU_CONFIG_TABLE,
                validate: (value) => parseLingPuConfig(value),
            },
            { [LING_PU_CONFIG_ID]: raw.ling_pu },
        );
    }

    /** 出征、精力、队伍解锁与地图门槛统一从 shared 数据表读取。 */
    private async loadExpeditionPreparationConfig(): Promise<void> {
        const app = AppRoot.instance;
        if (app.data.has(EXPEDITION_CONFIG_TABLE)) {
            return;
        }
        const raw = (await this.loadSharedJson('expedition_preparation')) as {
            expedition_preparation?: unknown;
        };
        app.data.registerTable<ExpeditionPreparationConfig>(
            {
                tableName: EXPEDITION_CONFIG_TABLE,
                validate: (value) => parseExpeditionPreparationConfig(value),
            },
            { [EXPEDITION_CONFIG_ID]: raw.expedition_preparation },
        );
    }

    private loadSharedJson(assetPath: string): Promise<unknown> {
        const bundle = assetManager.getBundle('shared');
        if (!bundle) {
            return Promise.reject(new Error('shared Bundle 尚未加载'));
        }

        return new Promise((resolve, reject) => {
            bundle.load(assetPath, JsonAsset, (error, asset) => {
                if (error) {
                    reject(error);
                    return;
                }
                if (!asset?.json) {
                    reject(new Error(`shared JSON ${assetPath} 为空`));
                    return;
                }
                resolve(asset.json);
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
    saveFailed: '存档准备失败，请刷新页面重试',
    sceneFailed: '场景载入失败，请刷新页面重试',
};
