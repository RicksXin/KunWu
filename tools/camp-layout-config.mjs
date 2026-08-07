/**
 * 营地灰盒布局的共享视觉配置。
 *
 * 正式视觉以 Cocos Creator 保存的 Camp.scene / Prefab 为唯一事实源；
 * 这里只统一历史生成器与结构校验共用的尺寸、坐标和显示名。
 *
 * 分工（改动前先看清，否则又会出现两份 id 各自漂移）：
 *   - 逻辑 id、节点名、节点路径 → assets/scripts/domain/CampSceneContract.ts
 *   - 尺寸、坐标、中文显示名     → 本文件
 * 本文件按 id 建表而不自带 id 列表，
 * 由 validate-scene.mjs 交叉核对两边的键完全一致。
 *
 * 本文件不导入领域层 TS，以便 `node tools/gen-camp-scene.mjs` 无需
 * --experimental-strip-types 即可运行。
 */

import { DESIGN_HEIGHT, DESIGN_WIDTH } from './scene-builder.mjs';

export const CAMP_LAYOUT = Object.freeze({
    design: Object.freeze({ width: DESIGN_WIDTH, height: DESIGN_HEIGHT }),
    constraints: Object.freeze({
        panoramaScreens: 2.8,
    }),
    sizes: Object.freeze({
        topHud: Object.freeze({ width: DESIGN_WIDTH, height: 380.16 }),
        resourceBar: Object.freeze({ width: 1033.92, height: 141.12 }),
        bottomHud: Object.freeze({ width: DESIGN_WIDTH, height: 138.24 }),
        bottomLeftSlots: Object.freeze({ width: 633.6, height: 138.24 }),
        bottomRightCurrency: Object.freeze({ width: 204.48, height: 69.12 }),
        systemEntry: Object.freeze({ width: 120.96, height: 92.16 }),
        panoramaContent: Object.freeze({ width: DESIGN_WIDTH * 2.8, height: 2353 }),
        panoramaArtwork: Object.freeze({ width: 3318, height: 2580 }),
        // Figma 375×817 按宽度换算到 Cocos：1 逻辑像素 = 2.88 Cocos 单位。
        // 各建筑的准确尺寸记录在 CAMP_BUILDING_LAYOUT；这里保留开放建筑默认值。
        building: Object.freeze({ width: 711.36, height: 475.2 }),
        expedition: Object.freeze({ width: 593.28, height: 400.32 }),
        page: Object.freeze({ width: DESIGN_WIDTH, height: DESIGN_HEIGHT }),
        immortalCoinIcon: Object.freeze({ width: 69.12, height: 69.12 }),
        immortalCoinValue: Object.freeze({ width: 120.96, height: 69.12 }),
        settingsBack: Object.freeze({ width: 160, height: 72 }),
    }),
    positions: Object.freeze({
        topHudTopInset: 126.72,
        expedition: Object.freeze({ x: -1.44, y: -564.48 }),
        immortalCoinIcon: Object.freeze({ x: -67.68, y: 0 }),
        immortalCoinValue: Object.freeze({ x: 41.76, y: 0 }),
        settingsBack: Object.freeze({ x: -420, y: 780 }),
    }),
});

/** 七座建筑的灰盒落点与显示名，键为 HallBadges.BUILDING_IDS。 */
export const CAMP_BUILDING_LAYOUT = Object.freeze({
    yi_shi_dian: Object.freeze({ label: '议事殿', position: Object.freeze({ x: 72, y: 495.36 }), size: Object.freeze({ width: 711.36, height: 475.2 }) }),
    ling_pu: Object.freeze({ label: '灵源院', position: Object.freeze({ x: 930.24, y: -544.32 }), size: Object.freeze({ width: 712.8, height: 475.2 }) }),
    zhao_xian_tai: Object.freeze({ label: '招贤馆', position: Object.freeze({ x: -432, y: -92.16 }), size: Object.freeze({ width: 711.36, height: 475.2 }) }),
    bai_bao_ku: Object.freeze({ label: '百宝库', position: Object.freeze({ x: -1009.44, y: 161.28 }), size: Object.freeze({ width: 593.28, height: 394.56 }) }),
    lian_qi_fang: Object.freeze({ label: '炼器坊', position: Object.freeze({ x: 489.6, y: -37.44 }), size: Object.freeze({ width: 711.36, height: 475.2 }) }),
    jiao_yi_hang: Object.freeze({ label: '交易行', position: Object.freeze({ x: 937.44, y: 198.72 }), size: Object.freeze({ width: 593.28, height: 394.56 }) }),
    huan_hun_tan: Object.freeze({ label: '还魂殿', position: Object.freeze({ x: -1104.48, y: -357.12 }), size: Object.freeze({ width: 593.28, height: 394.56 }) }),
});

/**
 * 未开放远景锚点，键为 CampSceneContract.CAMP_CLOSED_ANCHOR_NAMES。
 *
 * 2026-07-31 起为空：四个远景改由正式背景图画出，不再用灰盒节点占位。
 */
export const CAMP_CLOSED_ANCHOR_LAYOUT = Object.freeze({});

/** 顶部五资源显示名，键为 CampSceneContract.CAMP_RESOURCE_NODE_NAMES。 */
export const CAMP_RESOURCE_LABELS = Object.freeze({
    spiritGrain: '灵粮',
    spiritWood: '灵木',
    darkIron: '玄铁',
    spiritStone: '灵晶',
    gengJing: '庚精',
});

/**
 * 底部系统入口的灰盒 x 坐标，键为 CampBottomHud.CAMP_SYSTEM_ENTRY_IDS。
 * 中文显示名不在此重复——它已在 CAMP_SYSTEM_ENTRY_NAMES。
 */
export const CAMP_SYSTEM_ENTRY_LAYOUT = Object.freeze({
    settings: Object.freeze({ position: Object.freeze({ x: -253.44, y: 0 }) }),
    achievements: Object.freeze({ position: Object.freeze({ x: -126.72, y: 0 }) }),
    leaderboard: Object.freeze({ position: Object.freeze({ x: 0, y: 0 }) }),
    mail: Object.freeze({ position: Object.freeze({ x: 126.72, y: 0 }) }),
    dailyProgress: Object.freeze({ position: Object.freeze({ x: 253.44, y: 0 }) }),
});
