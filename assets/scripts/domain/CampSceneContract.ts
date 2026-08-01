/**
 * 营地场景的节点契约（任务 1.2.x）。
 *
 * 存在原因：拆分后有六个 Presenter 各自用相对路径找节点，校验脚本又要独立断言
 * 同一批节点。两边各写一份字符串时，改名只会在运行期打出 console.error，
 * 或者让校验器守着一份早已过时的结构。此文件是这些名字与路径的唯一事实源：
 * 表现层用 `db://` 导入，`tools/` 经 tests/resolver.mjs 导入同一份。
 *
 * 关键是 `presenterPaths` 由下面各 `CAMP_*_PATHS` 常量**推导**而来，
 * 不是另抄一遍。Presenter 只能通过这些常量取路径，
 * 于是「Presenter 实际访问的节点」与「校验器检查的节点」不可能分叉。
 *
 * 只描述「节点叫什么、在谁下面」。尺寸与坐标属于视觉，归 Cocos Creator 与
 * tools/camp-layout-config.mjs，不进本文件。
 */

import { BUILDING_IDS } from './HallBadges';
import type { BuildingId } from './HallBadges';
import { CAMP_SYSTEM_ENTRY_IDS } from './CampBottomHud';
import type { CampSystemEntryId } from './CampBottomHud';

/** 顶部五资源的节点名，顺序即从左到右的显示顺序。 */
export const CAMP_RESOURCE_NODE_NAMES = [
    'spiritGrain',
    'spiritWood',
    'darkIron',
    'spiritStone',
    'gengJing',
] as const;
export type CampResourceNodeName = (typeof CAMP_RESOURCE_NODE_NAMES)[number];

/**
 * 未开放远景锚点：只作背景，不得挂 Button，也不得有红点。
 *
 * 2026-07-31 起为空数组：竞技场、遗迹、圣迹、教会改由正式背景图直接画出远景，
 * 不再用独立灰盒节点占位（PRD-01 §77 只要求「表现为远景、封闭或未激活状态」，
 * 未规定必须是独立节点）。数组保留是为了让校验规则在将来重新加回锚点时自动生效。
 */
export const CAMP_CLOSED_ANCHOR_NAMES = [] as const satisfies readonly string[];
export type CampClosedAnchorName = (typeof CAMP_CLOSED_ANCHOR_NAMES)[number];

/** 底部系统入口 id → 节点名。顺序由 CAMP_SYSTEM_ENTRY_IDS 决定，不在此重复。 */
export const CAMP_SYSTEM_ENTRY_NODE_NAMES: Readonly<Record<CampSystemEntryId, string>> = {
    settings: 'SettingsButton',
    achievements: 'AchievementsButton',
    leaderboard: 'LeaderboardButton',
    mail: 'MailButton',
    dailyProgress: 'DailyProgressButton',
};

/** 默认隐藏的编辑器内全屏面板：漏掉 active=false 会挡住整个大厅。 */
export const CAMP_HIDDEN_PANELS = ['NpcListPanel', 'NpcDialogPanel', 'SettingsPanel'] as const;

// ── 各 Presenter 实际使用的节点路径。Presenter 必须从这里取，不得内联字符串。

/** 建筑内部节点名。表现层不得自行复制这些字符串。 */
export const CAMP_BUILDING_CHILD_NAMES = Object.freeze({
    name: 'Name',
    state: 'State',
    badge: 'Badge',
} as const);

type CampBuildingChildName =
    (typeof CAMP_BUILDING_CHILD_NAMES)[keyof typeof CAMP_BUILDING_CHILD_NAMES];

/** 建筑内部节点路径。BuildingLayer 下每座建筑一组。 */
export function campBuildingPath(buildingId: BuildingId, child?: CampBuildingChildName): string {
    return child ? `${buildingId}/${child}` : buildingId;
}

/** 底部系统入口节点路径，以 BottomHUD 为起点。 */
export function campSystemEntryPath(entryId: CampSystemEntryId): string {
    return `BottomLeftSlots/${CAMP_SYSTEM_ENTRY_NODE_NAMES[entryId]}`;
}

/** CampPanoramaController 使用的路径。 */
export const CAMP_PANORAMA_PATHS = Object.freeze({
    content: 'PanoramaContent',
});

/** CampBuildingPresenter 使用的路径中，与建筑无关的那些。 */
export const CAMP_BUILDING_PATHS = Object.freeze({
    expedition: 'ExpeditionEntry',
});

/** CampHudPresenter 使用的路径。 */
export const CAMP_TOP_HUD_PATHS = Object.freeze({
    avatar: 'AvatarButton',
    resourceBar: 'ResourceBar',
    mainTask: 'MainTaskButton',
    mainTaskObjective: 'MainTaskButton/Objective',
});

/** CampBottomHudPresenter 使用的路径中，与系统入口无关的那些。 */
export const CAMP_BOTTOM_HUD_PATHS = Object.freeze({
    immortalCoinValue: 'BottomRightCurrency/ImmortalCoinValue',
});

/** CampNpcPresenter 使用的路径。 */
export const CAMP_NPC_PATHS = Object.freeze({
    listPanel: 'NpcListPanel',
    listBack: 'NpcListPanel/NpcListBackButton',
    cenShouyi: 'NpcListPanel/CenShouyiButton',
    cenShouyiName: 'NpcListPanel/CenShouyiButton/NpcName',
    cenShouyiRole: 'NpcListPanel/CenShouyiButton/NpcRole',
    cenShouyiStatus: 'NpcListPanel/CenShouyiButton/NpcStatus',
    dialogPanel: 'NpcDialogPanel',
    dialogBack: 'NpcDialogPanel/NpcDialogBackButton',
    dialogNext: 'NpcDialogPanel/NpcDialogNextButton',
    dialogNextLabel: 'NpcDialogPanel/NpcDialogNextButton/Label',
    dialogText: 'NpcDialogPanel/DialogueBox/DialogueText',
});

/** CampSettingsPresenter 使用的路径。 */
export const CAMP_SETTINGS_PATHS = Object.freeze({
    panel: 'SettingsPanel',
    back: 'SettingsPanel/SettingsBackButton',
});

/** 灵圃面板固定展示的五种资源；P1 后两行保留为 P2 锁定态。 */
export const CAMP_LING_PU_RESOURCE_ROW_IDS = [
    'spiritGrain',
    'spiritWood',
    'darkIron',
    'spiritCrystal',
    'gengJing',
] as const;
export type CampLingPuResourceRowId =
    (typeof CAMP_LING_PU_RESOURCE_ROW_IDS)[number];

export const CAMP_LING_PU_ROW_CHILD_PATHS = Object.freeze({
    background: 'Background',
    warningOutline: 'WarningOutline',
    icon: 'ResourceIcon',
    name: 'ResourceName',
    stock: 'Stock',
    rate: 'Rate',
    workers: 'Workers',
    status: 'Status',
    minus: 'MinusButton',
    minusVisual: 'MinusButton/Visual',
    plus: 'PlusButton',
    plusVisual: 'PlusButton/Visual',
    upgrade: 'UpgradeButton',
    upgradeVisual: 'UpgradeButton/Visual',
    upgradeLabel: 'UpgradeButton/Visual/Label',
});
export type CampLingPuRowChild = keyof typeof CAMP_LING_PU_ROW_CHILD_PATHS;

const CAMP_LING_PU_PANEL_ROOT = 'ContentMount/LingPuPanel';
const CAMP_LING_PU_MAIN_PANEL = `${CAMP_LING_PU_PANEL_ROOT}/MainPanel`;
const CAMP_LING_PU_CONFIRM_OVERLAY = `${CAMP_LING_PU_PANEL_ROOT}/ConfirmOverlay`;

/** CampLingPuPresenter 使用的静态 Prefab 节点。 */
export const CAMP_LING_PU_PATHS = Object.freeze({
    mount: 'ContentMount',
    panel: CAMP_LING_PU_PANEL_ROOT,
    backdrop: `${CAMP_LING_PU_PANEL_ROOT}/Backdrop`,
    mainPanel: CAMP_LING_PU_MAIN_PANEL,
    panelFrame: `${CAMP_LING_PU_MAIN_PANEL}/PanelFrame`,
    title: `${CAMP_LING_PU_MAIN_PANEL}/Title`,
    resourceRows: `${CAMP_LING_PU_MAIN_PANEL}/ResourceRows`,
    timerLabel: `${CAMP_LING_PU_MAIN_PANEL}/TimerLabel`,
    progressTrack: `${CAMP_LING_PU_MAIN_PANEL}/ProgressTrack`,
    progressFill: `${CAMP_LING_PU_MAIN_PANEL}/ProgressTrack/ProgressFill`,
    recruitButton: `${CAMP_LING_PU_MAIN_PANEL}/RecruitButton`,
    recruitVisual: `${CAMP_LING_PU_MAIN_PANEL}/RecruitButton/Visual`,
    recruitLabel: `${CAMP_LING_PU_MAIN_PANEL}/RecruitButton/Visual/Label`,
    closeButton: `${CAMP_LING_PU_MAIN_PANEL}/CloseButton`,
    closeVisual: `${CAMP_LING_PU_MAIN_PANEL}/CloseButton/Visual`,
    closeLabel: `${CAMP_LING_PU_MAIN_PANEL}/CloseButton/Visual/Label`,
    confirmation: CAMP_LING_PU_CONFIRM_OVERLAY,
    confirmationBackdrop: `${CAMP_LING_PU_CONFIRM_OVERLAY}/ConfirmBackdrop`,
    confirmationPanel: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel`,
    confirmationFrame: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/DialogFrame`,
    confirmationTitle: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/DialogTitle`,
    confirmationIcon: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/CostIcon`,
    confirmationMessage: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/Message`,
    confirmationDetail: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/Detail`,
    confirmationError: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/Error`,
    confirmationPrimary: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/PrimaryButton`,
    confirmationPrimaryVisual:
        `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/PrimaryButton/Visual`,
    confirmationPrimaryLabel:
        `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/PrimaryButton/Visual/Label`,
    confirmationCancel: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/CancelButton`,
    confirmationCancelVisual:
        `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/CancelButton/Visual`,
    confirmationCancelLabel:
        `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/CancelButton/Visual/Label`,
});

export function campLingPuResourceRowPath(
    resourceId: CampLingPuResourceRowId,
    child?: CampLingPuRowChild,
): string {
    const row = `${CAMP_LING_PU_PATHS.resourceRows}/${resourceId}Row`;
    return child ? `${row}/${CAMP_LING_PU_ROW_CHILD_PATHS[child]}` : row;
}

/**
 * 一个营地模块：拆出的 Prefab 根、挂载的 Presenter，以及 Presenter 要用到的
 * Prefab 内部相对路径。
 *
 * `presenterPaths` 全部由上面的常量推导，校验器据此断言节点存在。
 * 写在这里的路径若与场景不符，`pnpm validate:scene` 会在打开编辑器前就报出来，
 * 而不是等运行时 console.error。
 */
export interface CampModuleContract {
    /** 模块 id，用于错误信息与查表。 */
    readonly id: string;
    /** Prefab 文件路径，相对仓库根。 */
    readonly prefabPath: string;
    /** Prefab 根节点名，同时是它在 Camp.scene 里的节点名。 */
    readonly rootNode: string;
    /** 根节点在 Camp.scene 中的父节点。 */
    readonly sceneParent: string;
    /** 挂在根节点上的 Presenter 源文件，相对仓库根。 */
    readonly presenter: string;
    /** Presenter 会按相对路径访问的节点，全部以 rootNode 为起点。 */
    readonly presenterPaths: readonly string[];
}

/** 七个营地模块。顺序即 Camp.scene 中期望的层级顺序。 */
export const CAMP_MODULES: readonly CampModuleContract[] = [
    {
        id: 'panorama',
        prefabPath: 'assets/bundles/camp/prefabs/CampPanorama.prefab',
        rootNode: 'WorldViewport',
        sceneParent: 'Canvas',
        presenter: 'assets/scripts/presentation/CampPanoramaController.ts',
        presenterPaths: Object.values(CAMP_PANORAMA_PATHS),
    },
    {
        id: 'buildings',
        prefabPath: 'assets/bundles/camp/prefabs/CampPanorama.prefab',
        rootNode: 'BuildingLayer',
        sceneParent: 'PanoramaContent',
        presenter: 'assets/scripts/presentation/CampBuildingPresenter.ts',
        presenterPaths: [
            ...BUILDING_IDS.flatMap((buildingId) => [
                campBuildingPath(buildingId),
                campBuildingPath(buildingId, 'State'),
                campBuildingPath(buildingId, 'Badge'),
            ]),
            ...Object.values(CAMP_BUILDING_PATHS),
        ],
    },
    {
        id: 'topHud',
        prefabPath: 'assets/bundles/camp/prefabs/CampTopHud.prefab',
        rootNode: 'TopHUD',
        sceneParent: 'SafeAreaRoot',
        presenter: 'assets/scripts/presentation/CampHudPresenter.ts',
        presenterPaths: [
            ...Object.values(CAMP_TOP_HUD_PATHS),
            ...CAMP_RESOURCE_NODE_NAMES.flatMap((name) => [
                `${CAMP_TOP_HUD_PATHS.resourceBar}/${name}/Name`,
                `${CAMP_TOP_HUD_PATHS.resourceBar}/${name}/Value`,
            ]),
        ],
    },
    {
        id: 'bottomHud',
        prefabPath: 'assets/bundles/camp/prefabs/CampBottomHud.prefab',
        rootNode: 'BottomHUD',
        sceneParent: 'SafeAreaRoot',
        presenter: 'assets/scripts/presentation/CampBottomHudPresenter.ts',
        presenterPaths: [
            ...CAMP_SYSTEM_ENTRY_IDS.map((entryId) => campSystemEntryPath(entryId)),
            ...Object.values(CAMP_BOTTOM_HUD_PATHS),
        ],
    },
    {
        id: 'npcPage',
        prefabPath: 'assets/bundles/camp/prefabs/CampNpcPage.prefab',
        rootNode: 'NpcPage',
        sceneParent: 'SafeAreaRoot',
        presenter: 'assets/scripts/presentation/CampNpcPresenter.ts',
        presenterPaths: Object.values(CAMP_NPC_PATHS),
    },
    {
        id: 'settingsPage',
        prefabPath: 'assets/bundles/camp/prefabs/CampSettingsPage.prefab',
        rootNode: 'SettingsPage',
        sceneParent: 'SafeAreaRoot',
        presenter: 'assets/scripts/presentation/CampSettingsPresenter.ts',
        presenterPaths: Object.values(CAMP_SETTINGS_PATHS),
    },
    {
        id: 'lingPuPage',
        prefabPath: 'assets/bundles/camp/prefabs/CampLingPuPage.prefab',
        rootNode: 'CampLingPuPage',
        sceneParent: 'SafeAreaRoot',
        presenter: 'assets/scripts/presentation/CampLingPuPresenter.ts',
        presenterPaths: [
            ...Object.values(CAMP_LING_PU_PATHS),
            ...CAMP_LING_PU_RESOURCE_ROW_IDS.flatMap((resourceId) => [
                campLingPuResourceRowPath(resourceId),
                ...Object.keys(CAMP_LING_PU_ROW_CHILD_PATHS).map((child) =>
                    campLingPuResourceRowPath(
                        resourceId,
                        child as CampLingPuRowChild,
                    ),
                ),
            ]),
        ],
    },
];

export function campModule(id: string): CampModuleContract {
    const found = CAMP_MODULES.find((module) => module.id === id);
    if (!found) {
        throw new Error(`未知营地模块 ${id}`);
    }
    return found;
}

/** 去重后的 Prefab 路径；WorldViewport 与 BuildingLayer 同属一个 Prefab。 */
export const CAMP_PREFAB_PATHS: readonly string[] = Array.from(
    new Set(CAMP_MODULES.map((module) => module.prefabPath)),
);
