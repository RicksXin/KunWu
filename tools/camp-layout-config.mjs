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
        topHud: Object.freeze({ width: DESIGN_WIDTH, height: 300 }),
        resourceBar: Object.freeze({ width: 840, height: 148 }),
        bottomHud: Object.freeze({ width: DESIGN_WIDTH, height: 120 }),
        bottomLeftSlots: Object.freeze({ width: 640, height: 120 }),
        bottomRightCurrency: Object.freeze({ width: 320, height: 120 }),
        systemEntry: Object.freeze({ width: 112, height: 96 }),
        panoramaContent: Object.freeze({ width: DESIGN_WIDTH * 2.8, height: 2353 }),
        panoramaArtwork: Object.freeze({ width: 3318, height: 2580 }),
        // 源图 1536×1024（比例 1.5），显示尺寸按同比例，否则建筑被压扁。
        // 现有落点最密处是 jiao_yi_hang(350,0)↔lian_qi_fang(552,-250)，
        // 仅隔 202px，因此在不动落点的前提下宽度上限只有 244。
        // 要让建筑显著变大必须先重排落点，见 Docs/08 §1.2.9。
        building: Object.freeze({ width: 240, height: 160 }),
        expedition: Object.freeze({ width: 240, height: 160 }),
        page: Object.freeze({ width: DESIGN_WIDTH, height: DESIGN_HEIGHT }),
        immortalCoinIcon: Object.freeze({ width: 64, height: 64 }),
        immortalCoinValue: Object.freeze({ width: 180, height: 48 }),
        settingsBack: Object.freeze({ width: 160, height: 72 }),
    }),
    positions: Object.freeze({
        expedition: Object.freeze({ x: 0, y: -330 }),
        immortalCoinIcon: Object.freeze({ x: -90, y: 0 }),
        immortalCoinValue: Object.freeze({ x: 45, y: 0 }),
        settingsBack: Object.freeze({ x: -420, y: 780 }),
    }),
});

/** 七座建筑的灰盒落点与显示名，键为 HallBadges.BUILDING_IDS。 */
export const CAMP_BUILDING_LAYOUT = Object.freeze({
    yi_shi_dian: Object.freeze({ label: '议事殿', position: Object.freeze({ x: 0, y: 300 }) }),
    ling_pu: Object.freeze({ label: '灵源院', position: Object.freeze({ x: 1050, y: 80 }) }),
    zhao_xian_tai: Object.freeze({ label: '招贤馆', position: Object.freeze({ x: -350, y: 0 }) }),
    bai_bao_ku: Object.freeze({ label: '百宝库', position: Object.freeze({ x: -1050, y: 260 }) }),
    lian_qi_fang: Object.freeze({ label: '炼器坊', position: Object.freeze({ x: 552, y: -250 }) }),
    jiao_yi_hang: Object.freeze({ label: '交易行', position: Object.freeze({ x: 350, y: 0 }) }),
    huan_hun_tan: Object.freeze({ label: '还魂殿', position: Object.freeze({ x: -1050, y: -220 }) }),
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
    settings: Object.freeze({ position: Object.freeze({ x: -260, y: 0 }) }),
    achievements: Object.freeze({ position: Object.freeze({ x: -130, y: 0 }) }),
    leaderboard: Object.freeze({ position: Object.freeze({ x: 0, y: 0 }) }),
    mail: Object.freeze({ position: Object.freeze({ x: 130, y: 0 }) }),
    dailyProgress: Object.freeze({ position: Object.freeze({ x: 260, y: 0 }) }),
});
