/**
 * 校验手写场景与工程配置的一致性（任务 #6b）。
 *
 * 存在原因：场景是脚本生成的，而脚本 UUID 来自 .meta。
 * 若日后有人重新导入脚本导致 UUID 变化，场景里的组件引用会失效，
 * 症状是「场景能打开但组件全没了」——不报错，很难发现。此脚本把它变成硬失败。
 *
 * 用法：node tools/validate-scene.mjs
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { compressUuid, uuidFromMeta } from './uuid-compress.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
/** 初始场景不能位于 Asset Bundle 内，故放在 assets/scenes/。 */
const SCENE_PATH = path.join(REPO_ROOT, 'assets/scenes/Boot.scene');
const CAMP_SCENE_PATH = path.join(REPO_ROOT, 'assets/bundles/camp/Camp.scene');
const CAMP_BACKGROUND_META_PATH = path.join(
    REPO_ROOT,
    'assets/bundles/camp/env_camp_panorama_bg.png.meta',
);

const problems = [];
const notes = [];

function readJson(relPath) {
    return JSON.parse(readFileSync(path.join(REPO_ROOT, relPath), 'utf8'));
}

if (!existsSync(SCENE_PATH)) {
    console.error('找不到 Boot.scene，请先运行 node tools/gen-boot-scene.mjs');
    process.exit(1);
}

const scene = JSON.parse(readFileSync(SCENE_PATH, 'utf8'));

/** 场景里出现的自定义组件类型（非 cc. 开头即为脚本）。 */
const customTypes = new Set(
    scene
        .map((entry) => entry.__type__)
        .filter((type) => typeof type === 'string' && !type.startsWith('cc.')),
);

/**
 * 扫描全部脚本建立「压缩 UUID → 源文件」索引。
 *
 * 不用硬编码白名单：那样每加一个组件都得改这里，迟早漏掉，
 * 而漏掉的表现是校验器把正常组件报成「未知脚本」（本次就踩了）。
 * 反查索引能自动认出新组件，同时仍能发现真正失联的引用。
 */
function indexScripts(dir, index = new Map()) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            indexScripts(full, index);
            continue;
        }
        if (!entry.name.endsWith('.ts.meta')) {
            continue;
        }
        index.set(compressUuid(uuidFromMeta(full)), path.relative(REPO_ROOT, full).replace(/\.meta$/, ''));
    }
    return index;
}

const scriptIndex = indexScripts(path.join(REPO_ROOT, 'assets/scripts'));

for (const compressed of customTypes) {
    const source = scriptIndex.get(compressed);
    if (source) {
        notes.push(`${path.basename(source)} → ${compressed}`);
    } else {
        problems.push(
            `场景引用了未知脚本组件 ${compressed}，` +
                `对应源文件可能已删除、改名，或其 .meta 的 UUID 已变`,
        );
    }
}

// 启动场景必须挂上的组件。缺了游戏跑不起来，故单独校验。
const REQUIRED_SCRIPTS = [
    'assets/scripts/AppRoot.ts',
    'assets/scripts/presentation/ViewportAdapter.ts',
    'assets/scripts/presentation/GameBootstrap.ts',
];

for (const scriptPath of REQUIRED_SCRIPTS) {
    const metaPath = path.join(REPO_ROOT, `${scriptPath}.meta`);
    if (!existsSync(metaPath)) {
        problems.push(`${scriptPath} 缺少 .meta，场景无法引用它`);
        continue;
    }
    if (!customTypes.has(compressUuid(uuidFromMeta(metaPath)))) {
        problems.push(
            `启动场景未挂载 ${path.basename(scriptPath)}——` +
                `重新运行 pnpm gen:scene --force 即可接上`,
        );
    }
}

// 组件与节点必须双向配对，否则组件不会被实例化
scene.forEach((entry, index) => {
    const nodeRef = entry?.node?.__id__;
    if (typeof nodeRef !== 'number') {
        return;
    }
    const node = scene[nodeRef];
    if (!node || node.__type__ !== 'cc.Node') {
        problems.push(`[${index}] 的 node 未指向 cc.Node`);
        return;
    }
    if (!(node._components ?? []).some((ref) => ref.__id__ === index)) {
        problems.push(
            `[${index}] ${entry.__type__} 未被节点 ${node._name} 的 _components 登记，不会实例化`,
        );
    }
});

// AppRoot 必须在场景根层级，否则 addPersistRootNode 静默失效
const sceneRoot = scene[1];
const rootChildIds = (sceneRoot?._children ?? []).map((ref) => ref.__id__);
const appRootIdx = scene.findIndex(
    (entry) => entry.__type__ === 'cc.Node' && entry._name === 'AppRoot',
);
if (appRootIdx < 0) {
    problems.push('场景中没有名为 AppRoot 的节点');
} else if (!rootChildIds.includes(appRootIdx)) {
    problems.push(
        'AppRoot 不在场景根层级——cc.d.ts 明确要求根层级，' +
            '否则 addPersistRootNode 无效，跨场景常驻会静默失败',
    );
}

// AppRoot 的全局 UI 必须随持久根跨场景存在。
// 缺引用时代码仍能运行，但路由加载会没有遮罩，很容易漏过。
const appRootType = compressUuid(
    uuidFromMeta(path.join(REPO_ROOT, 'assets/scripts/AppRoot.ts.meta')),
);
const appRootComponent = scene.find((entry) => entry.__type__ === appRootType);
if (!appRootComponent) {
    problems.push('场景中找不到 AppRoot 组件');
} else {
    for (const [property, expectedNodeName] of [
        ['loadingOverlay', 'LoadingOverlay'],
        ['feedbackRoot', 'Feedback'],
    ]) {
        const target = scene[appRootComponent[property]?.__id__];
        if (target?.__type__ !== 'cc.Node' || target._name !== expectedNodeName) {
            problems.push(`AppRoot.${property} 未指向 ${expectedNodeName} 节点`);
        }
    }
    const feedbackLabel = scene[appRootComponent.feedbackLabel?.__id__];
    if (feedbackLabel?.__type__ !== 'cc.Label') {
        problems.push('AppRoot.feedbackLabel 未指向 cc.Label 组件');
    }
}

const loadingOverlayIdx = scene.findIndex(
    (entry) => entry.__type__ === 'cc.Node' && entry._name === 'LoadingOverlay',
);
if (loadingOverlayIdx < 0) {
    problems.push('场景缺少 LoadingOverlay');
} else {
    const componentTypes = (scene[loadingOverlayIdx]._components ?? []).map(
        (ref) => scene[ref.__id__]?.__type__,
    );
    if (!componentTypes.includes('cc.BlockInputEvents')) {
        problems.push('LoadingOverlay 缺少 cc.BlockInputEvents，无法拦截重复点击');
    }
}

if (appRootIdx >= 0) {
    const componentTypes = (scene[appRootIdx]._components ?? []).map(
        (ref) => scene[ref.__id__]?.__type__,
    );
    if (!componentTypes.includes('cc.Canvas')) {
        problems.push('AppRoot 缺少持久 cc.Canvas，全局遮罩不会渲染');
    }
}

// 起始场景配置须与场景 meta 的 uuid 一致
const sceneMeta = readJson('assets/scenes/Boot.scene.meta');
const builder = readJson('settings/v2/packages/builder.json');
const configuredStart = builder?.taskMap?.['web-mobile']?.options?.startScene;
if (!configuredStart) {
    problems.push('builder.json 未配置 startScene');
} else if (configuredStart !== sceneMeta.uuid) {
    problems.push(
        `builder.json 的 startScene (${configuredStart}) 与 Boot.scene.meta 的 uuid ` +
            `(${sceneMeta.uuid}) 不一致`,
    );
}

// 设计分辨率须与领域层常量一致
const project = readJson('settings/v2/packages/project.json');
const resolution = project?.general?.designResolution;
if (resolution?.width !== 1080 || resolution?.height !== 1920) {
    problems.push(
        `project.json 设计分辨率为 ${resolution?.width}×${resolution?.height}，` +
            '应与 ViewportLayout 的 1080×1920 一致',
    );
}

// 初始场景不得位于 Asset Bundle 内（Cocos 硬性限制），
// 且 start-scene 是引擎保留的内置 Bundle 名，不该由工程自建同名目录
if (existsSync(path.join(REPO_ROOT, 'assets/bundles/start-scene'))) {
    problems.push(
        'assets/bundles/start-scene 不应存在：start-scene 是引擎保留的内置 Bundle 名，' +
            '且初始场景不能放在 Bundle 内',
    );
}

// ── Camp 三层大厅骨架（任务 1.2.1–1.2.2）
if (!existsSync(CAMP_SCENE_PATH)) {
    problems.push(
        '找不到 Camp.scene：正式营地场景以 Cocos Creator 保存结果为准，请从 Git 还原，' +
            '不要用生成器整体覆盖',
    );
} else {
    const camp = JSON.parse(readFileSync(CAMP_SCENE_PATH, 'utf8'));

    const campCustomTypes = new Set(
        camp
            .map((entry) => entry.__type__)
            .filter((type) => typeof type === 'string' && !type.startsWith('cc.')),
    );
    for (const compressed of campCustomTypes) {
        if (!scriptIndex.has(compressed)) {
            problems.push(`Camp.scene 引用了未知脚本组件 ${compressed}`);
        }
    }

    // Camp 组件也必须与节点双向配对，生成器增删节点后最容易漏这条。
    camp.forEach((entry, index) => {
        const nodeRef = entry?.node?.__id__;
        if (typeof nodeRef !== 'number') {
            return;
        }
        const node = camp[nodeRef];
        if (!node || node.__type__ !== 'cc.Node') {
            problems.push(`Camp.scene [${index}] 的 node 未指向 cc.Node`);
            return;
        }
        if (!(node._components ?? []).some((ref) => ref.__id__ === index)) {
            problems.push(
                `Camp.scene [${index}] ${entry.__type__} 未被节点 ${node._name} 登记`,
            );
        }
    });

    const findNodeIdx = (name) =>
        camp.findIndex((entry) => entry.__type__ === 'cc.Node' && entry._name === name);
    const expectNode = (name) => {
        const idx = findNodeIdx(name);
        if (idx < 0) {
            problems.push(`Camp.scene 缺少 ${name} 节点`);
        }
        return idx;
    };
    const expectParent = (childName, parentName) => {
        const childIdx = expectNode(childName);
        const parentIdx = expectNode(parentName);
        if (childIdx >= 0 && parentIdx >= 0 && camp[childIdx]._parent?.__id__ !== parentIdx) {
            problems.push(`Camp.scene ${childName} 必须直属 ${parentName}`);
        }
        return { childIdx, parentIdx };
    };

    expectParent('WorldViewport', 'Canvas');
    expectParent('SceneFallback', 'WorldViewport');
    expectParent('PanoramaContent', 'WorldViewport');
    expectParent('BackgroundLayer', 'PanoramaContent');
    expectParent('PanoramaBackground', 'BackgroundLayer');
    expectParent('BuildingLayer', 'PanoramaContent');
    expectParent('ForegroundLayer', 'PanoramaContent');
    expectParent('SafeAreaRoot', 'Canvas');
    expectParent('TopHUD', 'SafeAreaRoot');
    expectParent('BottomHUD', 'SafeAreaRoot');
    expectParent('ResourceBar', 'TopHUD');
    expectParent('AvatarButton', 'TopHUD');
    expectParent('MainTaskButton', 'TopHUD');
    expectParent('ExpeditionEntry', 'BuildingLayer');
    for (const anchorName of [
        'ArenaAnchor',
        'RelicAnchor',
        'SacredSiteAnchor',
        'ChurchAnchor',
    ]) {
        expectParent(anchorName, 'BuildingLayer');
    }
    expectParent('BottomLeftSlots', 'BottomHUD');
    expectParent('BottomRightCurrency', 'BottomHUD');
    expectParent('SettingsPanel', 'SafeAreaRoot');
    expectParent('SettingsBackButton', 'SettingsPanel');
    expectParent('NpcListPanel', 'SafeAreaRoot');
    expectParent('NpcDialogPanel', 'SafeAreaRoot');

    if (findNodeIdx('BottomNav') >= 0) {
        problems.push('Camp.scene 仍包含旧 BottomNav，1.2.1 要求删除五主导航布局');
    }
    if (findNodeIdx('Expanded') >= 0) {
        problems.push('Camp.scene 仍包含顶部旧货币展开区，灵石/魂晶不应混入五资源');
    }

    const fallbackIdx = findNodeIdx('SceneFallback');
    if (fallbackIdx >= 0 && camp[fallbackIdx]._active !== true) {
        problems.push('Camp.scene SceneFallback 默认必须可见，避免正式全景未加载时露空白');
    }

    const viewportType = compressUuid(
        uuidFromMeta(
            path.join(REPO_ROOT, 'assets/scripts/presentation/ViewportAdapter.ts.meta'),
        ),
    );
    const viewportComponent = camp.find((entry) => entry.__type__ === viewportType);
    const safeAreaRootIdx = findNodeIdx('SafeAreaRoot');
    if (!viewportComponent) {
        problems.push('Camp.scene 未挂载 ViewportAdapter，顶部/底部 HUD 无法进入安全区');
    } else if (viewportComponent.safeAreaRoot?.__id__ !== safeAreaRootIdx) {
        problems.push('Camp.scene ViewportAdapter.safeAreaRoot 未指向 SafeAreaRoot');
    }

    const presenterType = compressUuid(
        uuidFromMeta(
            path.join(REPO_ROOT, 'assets/scripts/presentation/CampPresenter.ts.meta'),
        ),
    );
    const presenter = camp.find((entry) => entry.__type__ === presenterType);
    if (!presenter) {
        problems.push('Camp.scene 未挂载 CampPresenter');
    } else {
        if ((presenter.buildingNodes ?? []).length !== 7) {
            problems.push('CampPresenter.buildingNodes 必须保留七座成长建筑引用');
        }
        if ((presenter.badgeNodes ?? []).length !== 7) {
            problems.push('CampPresenter.badgeNodes 必须与七座建筑一一对应');
        }
        if ((presenter.buildingStateLabels ?? []).length !== 7) {
            problems.push('CampPresenter.buildingStateLabels 必须与七座建筑一一对应');
        } else {
            for (const ref of presenter.buildingStateLabels) {
                if (camp[ref?.__id__]?.__type__ !== 'cc.Label') {
                    problems.push('CampPresenter.buildingStateLabels 必须全部指向 cc.Label');
                    break;
                }
            }
        }
        if ((presenter.bottomNavNodes ?? []).length !== 0) {
            problems.push('CampPresenter.bottomNavNodes 应为空，旧五导航不得继续接线');
        }
        for (const [property, expectedName] of [
            ['avatarButton', 'AvatarButton'],
            ['mainTaskButton', 'MainTaskButton'],
            ['panoramaViewport', 'WorldViewport'],
            ['panoramaContent', 'PanoramaContent'],
            ['expeditionButton', 'ExpeditionEntry'],
            ['npcListPanel', 'NpcListPanel'],
            ['npcDialogPanel', 'NpcDialogPanel'],
            ['cenShouyiButton', 'CenShouyiButton'],
            ['npcListBackButton', 'NpcListBackButton'],
            ['npcDialogBackButton', 'NpcDialogBackButton'],
            ['npcDialogNextButton', 'NpcDialogNextButton'],
            ['settingsPanel', 'SettingsPanel'],
            ['settingsBackButton', 'SettingsBackButton'],
        ]) {
            const target = camp[presenter[property]?.__id__];
            if (target?.__type__ !== 'cc.Node' || target._name !== expectedName) {
                problems.push(`CampPresenter.${property} 未指向 ${expectedName}`);
            }
        }
        const mainTaskLabel = camp[presenter.mainTaskLabel?.__id__];
        if (mainTaskLabel?.__type__ !== 'cc.Label') {
            problems.push('CampPresenter.mainTaskLabel 未指向 cc.Label');
        }
        for (const property of [
            'npcNameLabel',
            'npcRoleLabel',
            'npcStatusLabel',
            'npcDialogTextLabel',
            'npcDialogNextLabel',
        ]) {
            if (camp[presenter[property]?.__id__]?.__type__ !== 'cc.Label') {
                problems.push(`CampPresenter.${property} 未指向 cc.Label`);
            }
        }
        const expectedSystemEntries = [
            'SettingsButton',
            'AchievementsButton',
            'LeaderboardButton',
            'MailButton',
            'DailyProgressButton',
        ];
        if ((presenter.systemEntryNodes ?? []).length !== expectedSystemEntries.length) {
            problems.push('CampPresenter.systemEntryNodes 必须按顺序接线五个底部系统入口');
        } else {
            presenter.systemEntryNodes.forEach((ref, index) => {
                if (camp[ref?.__id__]?._name !== expectedSystemEntries[index]) {
                    problems.push(
                        `CampPresenter.systemEntryNodes[${index}] 应指向 ${expectedSystemEntries[index]}`,
                    );
                }
            });
        }
        if (camp[presenter.immortalCoinLabel?.__id__]?.__type__ !== 'cc.Label') {
            problems.push('CampPresenter.immortalCoinLabel 必须指向右下灵石余额 Label');
        }
    }

    const nodeTransform = (nodeIdx) =>
        (camp[nodeIdx]?._components ?? [])
            .map((ref) => camp[ref.__id__])
            .find((component) => component?.__type__ === 'cc.UITransform');
    const componentTypesForNode = (nodeIdx) =>
        (camp[nodeIdx]?._components ?? []).map((ref) => camp[ref.__id__]?.__type__);
    const componentForNode = (nodeIdx, type) =>
        (camp[nodeIdx]?._components ?? [])
            .map((ref) => camp[ref.__id__])
            .find((component) => component?.__type__ === type);
    const contentTransform = nodeTransform(findNodeIdx('PanoramaContent'));
    const viewportTransform = nodeTransform(findNodeIdx('WorldViewport'));
    if (!componentTypesForNode(findNodeIdx('WorldViewport')).includes('cc.Mask')) {
        problems.push('Camp.scene WorldViewport 缺少 cc.Mask，2.8 屏全景会泄露到可视区外');
    }
    if (
        !contentTransform ||
        !viewportTransform ||
        contentTransform._contentSize.width <= viewportTransform._contentSize.width
    ) {
        problems.push('Camp.scene PanoramaContent 必须比 WorldViewport 宽，否则无法横滑');
    }
    if (contentTransform?._contentSize.width !== 3024) {
        problems.push('Camp.scene PanoramaContent 宽度必须为设计屏宽的 2.8 倍（3024）');
    }
    if (contentTransform?._contentSize.height !== 2353) {
        problems.push('Camp.scene PanoramaContent 高度必须匹配 375×817 设计稿（2353）');
    }

    const viewportWidget = componentForNode(findNodeIdx('WorldViewport'), 'cc.Widget');
    if (viewportWidget?._top !== 0 || viewportWidget?._bottom !== 0) {
        problems.push('Camp.scene WorldViewport 必须铺满画布，让背景延伸到固定 HUD 后方');
    }

    for (const layerName of ['BackgroundLayer', 'BuildingLayer', 'ForegroundLayer']) {
        const transform = nodeTransform(findNodeIdx(layerName));
        if (transform?._contentSize.width !== contentTransform?._contentSize.width) {
            problems.push(`Camp.scene ${layerName} 宽度必须与 PanoramaContent 一致`);
        }
        if (transform?._contentSize.height !== contentTransform?._contentSize.height) {
            problems.push(`Camp.scene ${layerName} 高度必须与 PanoramaContent 一致`);
        }
    }

    const backgroundIdx = findNodeIdx('PanoramaBackground');
    const backgroundTransform = nodeTransform(backgroundIdx);
    const backgroundSprite = componentForNode(backgroundIdx, 'cc.Sprite');
    if (
        backgroundTransform?._contentSize.width !== 3318 ||
        backgroundTransform?._contentSize.height !== 2580
    ) {
        problems.push('Camp.scene PanoramaBackground 必须按 1152×896 出血画布等比显示为 3318×2580');
    }
    if (!backgroundSprite || backgroundSprite._type !== 0) {
        problems.push('Camp.scene PanoramaBackground 必须使用 SIMPLE Sprite，不能九宫格拉伸');
    } else if (!existsSync(CAMP_BACKGROUND_META_PATH)) {
        problems.push('Camp 正式背景缺少 .meta');
    } else {
        const backgroundMeta = JSON.parse(readFileSync(CAMP_BACKGROUND_META_PATH, 'utf8'));
        const spriteSubId = Object.entries(backgroundMeta.subMetas ?? {}).find(
            ([, value]) => value.importer === 'sprite-frame',
        )?.[0];
        const expectedFrameUuid = spriteSubId
            ? `${backgroundMeta.uuid}@${spriteSubId}`
            : null;
        if (!expectedFrameUuid || backgroundSprite._spriteFrame?.__uuid__ !== expectedFrameUuid) {
            problems.push('Camp.scene PanoramaBackground 未引用正式背景 SpriteFrame');
        }
    }

    const expectedPanoramaPositions = {
        SacredSiteAnchor: [-1390, 260],
        ChurchAnchor: [-1390, -220],
        huan_hun_tan: [-1050, -220],
        bai_bao_ku: [-1050, 260],
        zhao_xian_tai: [-350, 0],
        yi_shi_dian: [0, 300],
        ExpeditionEntry: [0, -330],
        jiao_yi_hang: [350, 0],
        lian_qi_fang: [552, -250],
        ArenaAnchor: [552, 300],
        ling_pu: [1050, 80],
        RelicAnchor: [1390, -220],
    };
    for (const [nodeName, [expectedX, expectedY]] of Object.entries(
        expectedPanoramaPositions,
    )) {
        const node = camp[findNodeIdx(nodeName)];
        if (node?._lpos?.x !== expectedX || node?._lpos?.y !== expectedY) {
            problems.push(
                `Camp.scene ${nodeName} 的位置应为 (${expectedX}, ${expectedY})`,
            );
        }
    }

    for (const buildingName of [
        'yi_shi_dian',
        'ling_pu',
        'zhao_xian_tai',
        'bai_bao_ku',
        'lian_qi_fang',
        'jiao_yi_hang',
        'huan_hun_tan',
        'ArenaAnchor',
        'RelicAnchor',
        'SacredSiteAnchor',
        'ChurchAnchor',
    ]) {
        const size = nodeTransform(findNodeIdx(buildingName))?._contentSize;
        if (size?.width !== 240 || size?.height !== 180) {
            problems.push(`Camp.scene ${buildingName} 尺寸必须为 240×180`);
        }
    }
    const expeditionSize = nodeTransform(findNodeIdx('ExpeditionEntry'))?._contentSize;
    if (expeditionSize?.width !== 280 || expeditionSize?.height !== 150) {
        problems.push('Camp.scene ExpeditionEntry 尺寸必须为 280×150');
    }

    for (const anchorName of [
        'ArenaAnchor',
        'RelicAnchor',
        'SacredSiteAnchor',
        'ChurchAnchor',
    ]) {
        const anchorIdx = findNodeIdx(anchorName);
        const componentTypes = componentTypesForNode(anchorIdx);
        if (componentTypes.includes('cc.Button')) {
            problems.push(`Camp.scene ${anchorName} 是未开放锚点，不得挂载 cc.Button`);
        }
        const childNames = (camp[anchorIdx]?._children ?? []).map(
            (ref) => camp[ref.__id__]?._name,
        );
        if (childNames.includes('Badge')) {
            problems.push(`Camp.scene ${anchorName} 是未开放锚点，不得创建 Badge`);
        }
    }

    if (!componentTypesForNode(findNodeIdx('ExpeditionEntry')).includes('cc.Button')) {
        problems.push('Camp.scene ExpeditionEntry 必须有可点击入口');
    }

    for (const panelName of ['NpcListPanel', 'NpcDialogPanel']) {
        const panelIdx = findNodeIdx(panelName);
        if (camp[panelIdx]?._active !== false) {
            problems.push(`Camp.scene ${panelName} 默认必须隐藏`);
        }
        if (!componentTypesForNode(panelIdx).includes('cc.BlockInputEvents')) {
            problems.push(`Camp.scene ${panelName} 缺少 cc.BlockInputEvents，点击会穿透大厅`);
        }
    }

    const bottomLeftIdx = findNodeIdx('BottomLeftSlots');
    const expectedBottomEntries = [
        ['SettingsButton', -260],
        ['AchievementsButton', -130],
        ['LeaderboardButton', 0],
        ['MailButton', 130],
        ['DailyProgressButton', 260],
    ];
    const bottomEntryNames = (camp[bottomLeftIdx]?._children ?? []).map(
        (ref) => camp[ref.__id__]?._name,
    );
    if (
        JSON.stringify(bottomEntryNames) !==
        JSON.stringify(expectedBottomEntries.map(([name]) => name))
    ) {
        problems.push('Camp.scene 底部左侧入口顺序必须为设置、成就、排行榜、邮件、日常进度');
    }
    for (const [name, expectedX] of expectedBottomEntries) {
        const idx = findNodeIdx(name);
        if (camp[idx]?._parent?.__id__ !== bottomLeftIdx || camp[idx]?._lpos?.x !== expectedX) {
            problems.push(`Camp.scene ${name} 底部位置不正确`);
        }
        if (!componentTypesForNode(idx).includes('cc.Button')) {
            problems.push(`Camp.scene ${name} 必须可点击`);
        }
        const childNames = (camp[idx]?._children ?? []).map((ref) => camp[ref.__id__]?._name);
        if (childNames.includes('Badge')) {
            problems.push(`Camp.scene ${name} 不得产生红点`);
        }
    }

    const bottomRightIdx = findNodeIdx('BottomRightCurrency');
    const bottomRightChildren = (camp[bottomRightIdx]?._children ?? []).map(
        (ref) => camp[ref.__id__]?._name,
    );
    if (
        bottomRightChildren.length !== 2 ||
        !bottomRightChildren.includes('ImmortalCoinIcon') ||
        !bottomRightChildren.includes('ImmortalCoinValue')
    ) {
        problems.push('Camp.scene 底部右侧只能显示灵石图标和余额');
    }
    const immortalCoinValueIdx = findNodeIdx('ImmortalCoinValue');
    const immortalCoinValueLabel = (camp[immortalCoinValueIdx]?._components ?? [])
        .map((ref) => camp[ref.__id__])
        .find((entry) => entry?.__type__ === 'cc.Label');
    if (immortalCoinValueLabel?._string !== '--') {
        problems.push('Camp.scene 灵石余额默认必须为 --，不得写假数值');
    }

    const settingsPanelIdx = findNodeIdx('SettingsPanel');
    if (camp[settingsPanelIdx]?._active !== false) {
        problems.push('Camp.scene SettingsPanel 默认必须隐藏');
    }
    if (!componentTypesForNode(settingsPanelIdx).includes('cc.BlockInputEvents')) {
        problems.push('Camp.scene SettingsPanel 缺少 cc.BlockInputEvents，点击会穿透大厅');
    }

    const forbiddenPaymentLabels = new Set(['宝石', '充值', '礼包', '商店']);
    for (const entry of camp) {
        if (
            (entry.__type__ === 'cc.Node' && forbiddenPaymentLabels.has(entry._name)) ||
            (entry.__type__ === 'cc.Label' && forbiddenPaymentLabels.has(entry._string))
        ) {
            problems.push(`Camp.scene 不得显示付费入口：${entry._name || entry._string}`);
        }
    }

    const resourceDisplayNames = {
        spiritGrain: '灵粮',
        spiritWood: '灵木',
        darkIron: '玄铁',
        spiritStone: '灵晶',
        gengJing: '庚精',
    };
    for (const [resourceNodeName, displayName] of Object.entries(resourceDisplayNames)) {
        const resourceIdx = findNodeIdx(resourceNodeName);
        const childIds = camp[resourceIdx]?._children?.map((ref) => ref.__id__) ?? [];
        const nameNode = childIds.map((idx) => camp[idx]).find((node) => node?._name === 'Name');
        const valueNode = childIds.map((idx) => camp[idx]).find((node) => node?._name === 'Value');
        const nameLabel = (nameNode?._components ?? [])
            .map((ref) => camp[ref.__id__])
            .find((component) => component?.__type__ === 'cc.Label');
        const valueLabel = (valueNode?._components ?? [])
            .map((ref) => camp[ref.__id__])
            .find((component) => component?.__type__ === 'cc.Label');
        if (nameLabel?._string !== displayName) {
            problems.push(`Camp.scene ${resourceNodeName} 显示名应为${displayName}`);
        }
        if (valueLabel?._string !== '--') {
            problems.push(`Camp.scene ${resourceNodeName} 默认值应为 --，不得写假数值`);
        }
    }

    // 所有可点击入口都必须满足 48×48dp。
    for (const button of camp.filter((entry) => entry.__type__ === 'cc.Button')) {
        const node = camp[button.node?.__id__];
        const transform = nodeTransform(button.node?.__id__);
        const size = transform?._contentSize;
        if (!size || size.width < 48 || size.height < 48) {
            problems.push(
                `Camp.scene 可点击节点 ${node?._name ?? '(未知)'} 的触控区小于 48×48dp`,
            );
        }
    }

    notes.push(`Camp.scene 三层骨架 ${camp.length} 条目`);
}

if (problems.length > 0) {
    console.error('场景校验失败：');
    for (const problem of problems) {
        console.error(`  ${problem}`);
    }
    process.exit(1);
}

console.log('场景校验通过');
for (const note of notes) {
    console.log(`  ${note}`);
}
console.log(`  条目数 ${scene.length}，startScene ${sceneMeta.uuid}`);
