/**
 * 营地灰盒布局的共享配置。
 *
 * 正式视觉仍以 Cocos Creator 保存的 Camp.scene / Prefab 为唯一事实源；
 * 这里只统一历史生成器、一次性补丁和结构校验共用的尺寸、节点名与顺序，
 * 不作为第二份编辑器布局。
 */

import { DESIGN_HEIGHT, DESIGN_WIDTH } from './scene-builder.mjs';

export const CAMP_LAYOUT = Object.freeze({
    design: Object.freeze({ width: DESIGN_WIDTH, height: DESIGN_HEIGHT }),
    constraints: Object.freeze({
        panoramaScreens: 2.8,
        minTouchTarget: 48,
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
        building: Object.freeze({ width: 240, height: 180 }),
        expedition: Object.freeze({ width: 280, height: 150 }),
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

export const CAMP_BUILDINGS = Object.freeze([
    Object.freeze({ id: 'yi_shi_dian', label: '议事殿', position: Object.freeze({ x: 0, y: 300 }) }),
    Object.freeze({ id: 'ling_pu', label: '灵圃', position: Object.freeze({ x: 1050, y: 80 }) }),
    Object.freeze({ id: 'zhao_xian_tai', label: '招贤馆', position: Object.freeze({ x: -350, y: 0 }) }),
    Object.freeze({ id: 'bai_bao_ku', label: '百宝库', position: Object.freeze({ x: -1050, y: 260 }) }),
    Object.freeze({ id: 'lian_qi_fang', label: '炼器坊', position: Object.freeze({ x: 552, y: -250 }) }),
    Object.freeze({ id: 'jiao_yi_hang', label: '交易行', position: Object.freeze({ x: 350, y: 0 }) }),
    Object.freeze({ id: 'huan_hun_tan', label: '还魂殿', position: Object.freeze({ x: -1050, y: -220 }) }),
]);

export const CAMP_CLOSED_ANCHORS = Object.freeze([
    Object.freeze({ name: 'ArenaAnchor', label: '竞技场', position: Object.freeze({ x: 552, y: 300 }) }),
    Object.freeze({ name: 'RelicAnchor', label: '遗迹', position: Object.freeze({ x: 1390, y: -220 }) }),
    Object.freeze({ name: 'SacredSiteAnchor', label: '圣迹', position: Object.freeze({ x: -1390, y: 260 }) }),
    Object.freeze({ name: 'ChurchAnchor', label: '教会', position: Object.freeze({ x: -1390, y: -220 }) }),
]);

export const CAMP_TOP_RESOURCES = Object.freeze([
    Object.freeze({ id: 'spiritGrain', label: '灵粮' }),
    Object.freeze({ id: 'spiritWood', label: '灵木' }),
    Object.freeze({ id: 'darkIron', label: '玄铁' }),
    Object.freeze({ id: 'spiritStone', label: '灵晶' }),
    Object.freeze({ id: 'gengJing', label: '庚精' }),
]);

export const CAMP_SYSTEM_ENTRIES = Object.freeze([
    Object.freeze({ id: 'settings', nodeName: 'SettingsButton', label: '设置', position: Object.freeze({ x: -260, y: 0 }) }),
    Object.freeze({ id: 'achievements', nodeName: 'AchievementsButton', label: '成就', position: Object.freeze({ x: -130, y: 0 }) }),
    Object.freeze({ id: 'leaderboard', nodeName: 'LeaderboardButton', label: '排行', position: Object.freeze({ x: 0, y: 0 }) }),
    Object.freeze({ id: 'mail', nodeName: 'MailButton', label: '邮件', position: Object.freeze({ x: 130, y: 0 }) }),
    Object.freeze({ id: 'daily_progress', nodeName: 'DailyProgressButton', label: '日常', position: Object.freeze({ x: 260, y: 0 }) }),
]);

export const CAMP_PREFAB_MODULES = Object.freeze([
    Object.freeze({
        path: 'assets/bundles/camp/prefabs/CampPanorama.prefab',
        root: 'WorldViewport',
        presenter: 'assets/scripts/presentation/CampPanoramaController.ts',
        requiredNodes: Object.freeze(['PanoramaContent', 'BackgroundLayer', 'BuildingLayer', 'ForegroundLayer']),
    }),
    Object.freeze({
        path: 'assets/bundles/camp/prefabs/CampTopHud.prefab',
        root: 'TopHUD',
        presenter: 'assets/scripts/presentation/CampHudPresenter.ts',
        requiredNodes: Object.freeze(['ResourceBar', 'AvatarButton', 'MainTaskButton']),
    }),
    Object.freeze({
        path: 'assets/bundles/camp/prefabs/CampBottomHud.prefab',
        root: 'BottomHUD',
        presenter: 'assets/scripts/presentation/CampBottomHudPresenter.ts',
        requiredNodes: Object.freeze(['BottomLeftSlots', 'BottomRightCurrency', 'SettingsButton']),
    }),
    Object.freeze({
        path: 'assets/bundles/camp/prefabs/CampNpcPage.prefab',
        root: 'NpcPage',
        presenter: 'assets/scripts/presentation/CampNpcPresenter.ts',
        requiredNodes: Object.freeze(['NpcListPanel', 'NpcDialogPanel', 'CenShouyiButton']),
    }),
    Object.freeze({
        path: 'assets/bundles/camp/prefabs/CampSettingsPage.prefab',
        root: 'SettingsPage',
        presenter: 'assets/scripts/presentation/CampSettingsPresenter.ts',
        requiredNodes: Object.freeze(['SettingsPanel', 'SettingsBackButton']),
    }),
]);

export const CAMP_NODE_NAMES = Object.freeze({
    buildingIds: Object.freeze(CAMP_BUILDINGS.map(({ id }) => id)),
    closedAnchors: Object.freeze(CAMP_CLOSED_ANCHORS.map(({ name }) => name)),
    topResources: Object.freeze(CAMP_TOP_RESOURCES.map(({ id }) => id)),
    systemEntries: Object.freeze(CAMP_SYSTEM_ENTRIES.map(({ nodeName }) => nodeName)),
});
