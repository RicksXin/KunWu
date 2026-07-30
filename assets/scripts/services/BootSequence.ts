/**
 * 启动流程编排（PRD-10 §3、§4、任务 #16）。
 *
 * 职责边界：只决定「先做什么、失败怎么办」，不碰引擎 API。
 * Bundle 加载、场景切换、存档读写都通过注入的接口完成，
 * 因此整条流程可在 Node 下单测——启动失败的分支尤其需要测，
 * 那是玩家最容易遇到又最难手动复现的路径。
 *
 * 流程（PRD-10 §3、§4）：
 *   加载首屏包 → 读存档（失败回退备份）→ 加载营地包 → 进营地 → 预载 map_01
 */

import type { BundleName } from './BundleManifest';
import type { SaveLoadResult } from './SaveRepository';

/** 启动各阶段，用于向玩家展示进度（PRD-10 §8：异步操作显示处理中状态）。 */
export const BOOT_STAGES = [
    'loadingBoot',
    'loadingSave',
    'loadingCamp',
    'enteringCamp',
    'done',
] as const;
export type BootStage = (typeof BOOT_STAGES)[number];

/** 各阶段的状态文案 Key（见 assets/data/localization/zh_cn.json）。 */
export const BOOT_STAGE_MESSAGE_KEYS: Readonly<Record<BootStage, string>> = {
    loadingBoot: 'splash.loading_bundle',
    loadingSave: 'splash.loading_save',
    loadingCamp: 'splash.loading_camp',
    enteringCamp: 'splash.entering_camp',
    done: 'splash.done',
};

export type BootFailure =
    /** 首屏包加载失败，无法继续（PRD-10 §8）。 */
    | { readonly kind: 'bootBundleFailed'; readonly message: string }
    /** 营地包加载失败。 */
    | { readonly kind: 'campBundleFailed'; readonly message: string }
    /** 场景切换失败。 */
    | { readonly kind: 'sceneFailed'; readonly message: string };

export interface BootResult {
    readonly ok: boolean;
    /** 存档加载结果。新档时 status 为 empty。 */
    readonly save: SaveLoadResult | null;
    readonly failure: BootFailure | null;
    /** 已完成的阶段，便于测试断言顺序。 */
    readonly stagesCompleted: readonly BootStage[];
}

export interface BootDeps {
    /** 加载首屏包（start-scene 与 shared）。 */
    readonly loadBootBundles: () => Promise<void>;
    readonly loadBundle: (name: BundleName) => Promise<void>;
    /** 后台预载，不等待结果。 */
    readonly preloadFor: (triggerId: string) => void;
    readonly loadSave: () => Promise<SaveLoadResult>;
    /** 切换到营地场景。 */
    readonly enterCamp: () => Promise<void>;
    /** 阶段变化回调，用于更新启动画面文案。 */
    readonly onStage?: (stage: BootStage) => void;
    /** 存档回退或损坏时的提示，交由 UI 决定怎么显示。 */
    readonly onSaveDiagnostics?: (diagnostics: readonly string[]) => void;
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * 执行启动流程。
 *
 * 返回结果对象而非抛错：启动失败要在界面上显示错误码给玩家看
 * （PRD-10 §8），抛错会让调用方必须 try/catch 才能拿到失败原因。
 */
export async function runBootSequence(deps: BootDeps): Promise<BootResult> {
    const stagesCompleted: BootStage[] = [];

    const enter = (stage: BootStage): void => {
        deps.onStage?.(stage);
    };
    const complete = (stage: BootStage): void => {
        stagesCompleted.push(stage);
    };

    enter('loadingBoot');
    try {
        await deps.loadBootBundles();
    } catch (error) {
        // 首屏失败必须让玩家知道：此时界面上什么都没有，静默会变成永久黑屏
        return {
            ok: false,
            save: null,
            failure: { kind: 'bootBundleFailed', message: messageOf(error) },
            stagesCompleted,
        };
    }
    complete('loadingBoot');

    enter('loadingSave');
    const save = await deps.loadSave();
    if (save.diagnostics.length > 0) {
        // 存档回退不阻断启动，但必须告知玩家——否则他会以为进度凭空丢了
        deps.onSaveDiagnostics?.(save.diagnostics);
    }
    complete('loadingSave');

    enter('loadingCamp');
    try {
        await deps.loadBundle('camp');
    } catch (error) {
        return {
            ok: false,
            save,
            failure: { kind: 'campBundleFailed', message: messageOf(error) },
            stagesCompleted,
        };
    }
    complete('loadingCamp');

    enter('enteringCamp');
    try {
        await deps.enterCamp();
    } catch (error) {
        return {
            ok: false,
            save,
            failure: { kind: 'sceneFailed', message: messageOf(error) },
            stagesCompleted,
        };
    }
    complete('enteringCamp');

    // 进营地后预载 map_01（PRD-10 §3），不等待——玩家此时已能操作
    deps.preloadFor('camp');

    enter('done');
    complete('done');

    return { ok: true, save, failure: null, stagesCompleted };
}
