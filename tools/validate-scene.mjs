/**
 * 校验 Cocos Creator 场景、Prefab 与工程配置的一致性（任务 #6b）。
 *
 * 存在原因：场景与 Prefab 引用的脚本 UUID 来自 .meta。
 * 若日后有人重新导入脚本导致 UUID 变化，场景里的组件引用会失效，
 * 症状是「场景能打开但组件全没了」——不报错，很难发现。此脚本把它变成硬失败。
 *
 * 节点名、逻辑 id 与 Presenter 访问路径来自 domain/CampSceneContract，
 * 尺寸坐标来自 camp-layout-config；本脚本不持有第二份布局事实源。
 *
 * 用法：node --experimental-strip-types tools/validate-scene.mjs
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { compressUuid, uuidFromMeta } from './uuid-compress.mjs';
import {
    BUILDING_IDS,
    CAMP_CLOSED_ANCHOR_NAMES,
    CAMP_HIDDEN_PANELS,
    CAMP_MODULES,
    CAMP_PREFAB_PATHS,
    CAMP_RESOURCE_NODE_NAMES,
    CAMP_SYSTEM_ENTRY_IDS,
    CAMP_SYSTEM_ENTRY_NODE_ORDER,
    campBuildingPath,
    campModule,
    MIN_TOUCH_TARGET_DP,
} from './camp-domain-contract.mjs';
import {
    CAMP_BUILDING_LAYOUT,
    CAMP_CLOSED_ANCHOR_LAYOUT,
    CAMP_LAYOUT,
    CAMP_RESOURCE_LABELS,
    CAMP_SYSTEM_ENTRY_LAYOUT,
} from './camp-layout-config.mjs';

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

/**
 * 视觉配置与领域层契约的键必须完全一致。
 *
 * 这条先跑：两边的 id 集合一旦分叉，后面所有查表都会静默取到 undefined，
 * 报出来的会是「某节点尺寸不对」之类的假症状。曾经 camp-layout-config 用
 * `daily_progress` 而领域层用 `dailyProgress`，就是这样漏过去的。
 */
const expectSameKeys = (label, expectedKeys, actualKeys) => {
    const expected = new Set(expectedKeys);
    const actual = new Set(actualKeys);
    const missing = [...expected].filter((key) => !actual.has(key));
    const extra = [...actual].filter((key) => !expected.has(key));
    if (missing.length > 0) {
        problems.push(`${label} 缺少 ${missing.join('、')}`);
    }
    if (extra.length > 0) {
        problems.push(`${label} 多出 ${extra.join('、')}，领域层没有这些 id`);
    }
};

expectSameKeys('camp-layout-config 的建筑表', BUILDING_IDS, Object.keys(CAMP_BUILDING_LAYOUT));
expectSameKeys(
    'camp-layout-config 的远景锚点表',
    CAMP_CLOSED_ANCHOR_NAMES,
    Object.keys(CAMP_CLOSED_ANCHOR_LAYOUT),
);
expectSameKeys(
    'camp-layout-config 的资源显示名表',
    CAMP_RESOURCE_NODE_NAMES,
    Object.keys(CAMP_RESOURCE_LABELS),
);
expectSameKeys(
    'camp-layout-config 的系统入口表',
    CAMP_SYSTEM_ENTRY_IDS,
    Object.keys(CAMP_SYSTEM_ENTRY_LAYOUT),
);

function readJson(relPath) {
    return JSON.parse(readFileSync(path.join(REPO_ROOT, relPath), 'utf8'));
}

/**
 * 按相对路径解析节点，等价于 CampViewUtils.campNode 的 getChildByName 链。
 * 返回 -1 表示路径断了。场景与 Prefab 是同一种扁平数组，故共用此函数。
 */
function resolvePrefabPath(entries, rootIdx, relPath) {
    let current = rootIdx;
    for (const segment of relPath.split('/').filter(Boolean)) {
        const childIdx = (entries[current]?._children ?? [])
            .map((ref) => ref.__id__)
            .find((idx) => entries[idx]?._name === segment);
        if (childIdx === undefined) {
            return -1;
        }
        current = childIdx;
    }
    return current;
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
    'assets/scripts/presentation/core/ViewportAdapter.ts',
    'assets/scripts/presentation/boot/GameBootstrap.ts',
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
            .filter(
                (type) =>
                    typeof type === 'string' &&
                    !type.startsWith('cc.') &&
                    // Cocos 将 Prefab 实例的位置、名称等覆写序列化为该内置类型。
                    // 它不是脚本组件，也不会拥有对应的 .ts.meta。
                    type !== 'CCPropertyOverrideInfo',
            ),
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

    const prefabAssetUuidForNode = (nodeIdx) => {
        const prefabInfoIdx = camp[nodeIdx]?._prefab?.__id__;
        return camp[prefabInfoIdx]?.asset?.__uuid__ ?? null;
    };
    const linkedModulePrefabUuid = new Map(
        CAMP_MODULES.flatMap((module) => {
            const metaPath = path.join(REPO_ROOT, `${module.prefabPath}.meta`);
            return existsSync(metaPath)
                ? [[module.rootNode, uuidFromMeta(metaPath)]]
                : [];
        }),
    );
    const findNodeIdx = (name) => {
        const directIdx = camp.findIndex(
            (entry) => entry.__type__ === 'cc.Node' && entry._name === name,
        );
        if (directIdx >= 0) {
            return directIdx;
        }

        // 关联 Prefab 的根节点在 .scene 中只保存父节点与 PrefabInfo，真实名称和
        // 子树位于 .prefab 文件，打开场景时由 Cocos 展开。因此这里按资源 UUID
        // 识别模块实例，避免要求场景保存一份会与 Prefab 漂移的重复节点树。
        const assetUuid = linkedModulePrefabUuid.get(name);
        if (!assetUuid) {
            return -1;
        }
        return camp.findIndex(
            (entry, index) =>
                entry.__type__ === 'cc.Node' &&
                prefabAssetUuidForNode(index) === assetUuid,
        );
    };
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
    for (const anchorName of CAMP_CLOSED_ANCHOR_NAMES) {
        expectParent(anchorName, 'BuildingLayer');
    }
    expectParent('BottomLeftSlots', 'BottomHUD');
    expectParent('BottomRightCurrency', 'BottomHUD');
    expectParent('SettingsBackButton', 'SettingsPanel');

    // 六个模块的根节点必须挂在契约声明的父节点下。
    for (const module of CAMP_MODULES) {
        expectParent(module.rootNode, module.sceneParent);
    }

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
            path.join(REPO_ROOT, 'assets/scripts/presentation/core/ViewportAdapter.ts.meta'),
        ),
    );
    const viewportComponent = camp.find((entry) => entry.__type__ === viewportType);
    const safeAreaRootIdx = findNodeIdx('SafeAreaRoot');
    if (!viewportComponent) {
        problems.push('Camp.scene 未挂载 ViewportAdapter，顶部/底部 HUD 无法进入安全区');
    } else if (viewportComponent.safeAreaRoot?.__id__ !== safeAreaRootIdx) {
        problems.push('Camp.scene ViewportAdapter.safeAreaRoot 未指向 SafeAreaRoot');
    }

    /**
     * 每个模块：根节点挂对了 Presenter，且 Presenter 会访问的每条路径都存在。
     *
     * 后半条是拆分后最容易坏的地方——Presenter 用 getChildByName 找节点，
     * 编辑器里重命名一个子节点不会有任何编译错误，只在运行时打一行
     * console.error。这里把它提前成 pnpm check 的硬失败。
     */
    for (const module of CAMP_MODULES) {
        const presenterName = path.basename(module.presenter);
        const rootIdx = findNodeIdx(module.rootNode);
        if (rootIdx < 0) {
            continue;
        }
        const type = compressUuid(
            uuidFromMeta(path.join(REPO_ROOT, `${module.presenter}.meta`)),
        );
        if (prefabAssetUuidForNode(rootIdx)) {
            // 关联实例只在场景中保存 PrefabInfo；Presenter 与访问路径由下方的
            // Prefab 校验负责，场景层这里只校验实例存在且父级正确。
            continue;
        }
        const componentTypes = (camp[rootIdx]._components ?? []).map(
            (ref) => camp[ref.__id__]?.__type__,
        );
        if (!componentTypes.includes(type)) {
            problems.push(`Camp.scene ${module.rootNode} 未挂载 ${presenterName}`);
        }
        for (const relPath of module.presenterPaths) {
            if (resolvePrefabPath(camp, rootIdx, relPath) < 0) {
                problems.push(
                    `Camp.scene ${module.rootNode}/${relPath} 不存在，` +
                        `${presenterName} 运行时会取不到该节点`,
                );
            }
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
    const expectedContent = CAMP_LAYOUT.sizes.panoramaContent;
    if (contentTransform?._contentSize.width !== expectedContent.width) {
        problems.push(
            `Camp.scene PanoramaContent 宽度必须为设计屏宽的 ` +
                `${CAMP_LAYOUT.constraints.panoramaScreens} 倍（${expectedContent.width}）`,
        );
    }
    if (contentTransform?._contentSize.height !== expectedContent.height) {
        problems.push(
            `Camp.scene PanoramaContent 高度必须匹配 375×817 设计稿（${expectedContent.height}）`,
        );
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
    const expectedArtwork = CAMP_LAYOUT.sizes.panoramaArtwork;
    if (
        backgroundTransform?._contentSize.width !== expectedArtwork.width ||
        backgroundTransform?._contentSize.height !== expectedArtwork.height
    ) {
        problems.push(
            `Camp.scene PanoramaBackground 必须按 1152×896 出血画布等比显示为 ` +
                `${expectedArtwork.width}×${expectedArtwork.height}`,
        );
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

    /**
     * 建筑名必须完整位于建筑框下方，状态文字再位于名称下方。
     * 这里只校验相对关系，不锁死具体坐标，允许美术按每张贴图的透明边界微调。
     */
    for (const buildingId of BUILDING_IDS) {
        const buildingIdx = findNodeIdx(buildingId);
        if (buildingIdx < 0) {
            continue;
        }
        const childIdx = (childName) =>
            (camp[buildingIdx]._children ?? [])
                .map((ref) => ref.__id__)
                .find((idx) => camp[idx]?._name === childName) ?? -1;
        const nameIdx = childIdx('Name');
        const stateIdx = childIdx('State');
        if (nameIdx < 0) {
            problems.push(`Camp.scene ${buildingId} 缺少建筑名称 Name`);
            continue;
        }
        if (stateIdx < 0) {
            problems.push(`Camp.scene ${buildingId} 缺少状态文字 State`);
            continue;
        }

        const buildingTransform = nodeTransform(buildingIdx);
        const nameTransform = nodeTransform(nameIdx);
        const stateTransform = nodeTransform(stateIdx);
        if (!buildingTransform || !nameTransform || !stateTransform) {
            continue;
        }

        const buildingBottom = -buildingTransform._contentSize.height / 2;
        const nameTop = camp[nameIdx]._lpos.y + nameTransform._contentSize.height / 2;
        const nameBottom = camp[nameIdx]._lpos.y - nameTransform._contentSize.height / 2;
        const stateTop = camp[stateIdx]._lpos.y + stateTransform._contentSize.height / 2;
        if (nameTop > buildingBottom) {
            problems.push(`Camp.scene ${buildingId}/Name 必须完整位于建筑下方`);
        }
        if (stateTop > nameBottom) {
            problems.push(`Camp.scene ${buildingId}/State 必须位于建筑名称下方且不能重叠`);
        }
    }

    for (const anchorName of CAMP_CLOSED_ANCHOR_NAMES) {
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

    /**
     * 四个未开放场景（竞技场、遗迹、圣迹、教会）已改由背景图直接画出，
     * 场景中不应再有对应节点。PRD-01 §77 明确禁止它们伪装成已开放按钮——
     * 若日后有人重新建节点并挂上 Button，这里比人工走查更早发现。
     */
    for (const legacyAnchor of ['ArenaAnchor', 'RelicAnchor', 'SacredSiteAnchor', 'ChurchAnchor']) {
        const idx = findNodeIdx(legacyAnchor);
        if (idx < 0) {
            continue;
        }
        if (!CAMP_CLOSED_ANCHOR_NAMES.includes(legacyAnchor)) {
            problems.push(
                `Camp.scene 仍存在 ${legacyAnchor}：四个未开放远景已改由背景图表现，` +
                    `如确实要恢复独立锚点，请同时加回 CAMP_CLOSED_ANCHOR_NAMES`,
            );
        }
    }

    if (!componentTypesForNode(findNodeIdx('ExpeditionEntry')).includes('cc.Button')) {
        problems.push('Camp.scene ExpeditionEntry 必须有可点击入口');
    }

    for (const panelName of CAMP_HIDDEN_PANELS) {
        const panelIdx = findNodeIdx(panelName);
        if (panelIdx < 0) {
            continue;
        }
        if (camp[panelIdx]._active !== false) {
            problems.push(`Camp.scene ${panelName} 默认必须隐藏`);
        }
        if (!componentTypesForNode(panelIdx).includes('cc.BlockInputEvents')) {
            problems.push(`Camp.scene ${panelName} 缺少 cc.BlockInputEvents，点击会穿透大厅`);
        }
    }

    const bottomLeftIdx = findNodeIdx('BottomLeftSlots');
    const bottomEntryNames = (camp[bottomLeftIdx]?._children ?? []).map(
        (ref) => camp[ref.__id__]?._name,
    );
    if (JSON.stringify(bottomEntryNames) !== JSON.stringify([...CAMP_SYSTEM_ENTRY_NODE_ORDER])) {
        problems.push(
            `Camp.scene 底部左侧入口顺序必须为 ${CAMP_SYSTEM_ENTRY_NODE_ORDER.join('、')}`,
        );
    }
    for (const name of CAMP_SYSTEM_ENTRY_NODE_ORDER) {
        const idx = findNodeIdx(name);
        if (camp[idx]?._parent?.__id__ !== bottomLeftIdx) {
            problems.push(`Camp.scene ${name} 必须位于 BottomLeftSlots`);
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

    const forbiddenPaymentLabels = new Set(['宝石', '充值', '礼包', '商店']);
    for (const entry of camp) {
        if (
            (entry.__type__ === 'cc.Node' && forbiddenPaymentLabels.has(entry._name)) ||
            (entry.__type__ === 'cc.Label' && forbiddenPaymentLabels.has(entry._string))
        ) {
            problems.push(`Camp.scene 不得显示付费入口：${entry._name || entry._string}`);
        }
    }

    for (const resourceNodeName of CAMP_RESOURCE_NODE_NAMES) {
        const displayName = CAMP_RESOURCE_LABELS[resourceNodeName];
        const resourceIdx = findNodeIdx(resourceNodeName);
        const childIds = camp[resourceIdx]?._children?.map((ref) => ref.__id__) ?? [];
        const nameNode = childIds.map((idx) => camp[idx]).find((node) => node?._name === 'Name');
        const valueNode = childIds.map((idx) => camp[idx]).find((node) => node?._name === 'Value');
        const nameLabel = (nameNode?._components ?? [])
            .map((ref) => camp[ref.__id__])
            .find((component) => component?.__type__ === 'cc.Label');
        const nameSprite = (nameNode?._components ?? [])
            .map((ref) => camp[ref.__id__])
            .find((component) => component?.__type__ === 'cc.Sprite');
        const valueLabel = (valueNode?._components ?? [])
            .map((ref) => camp[ref.__id__])
            .find((component) => component?.__type__ === 'cc.Label');
        // 灰盒阶段用中文 Label，正式 HUD 到位后同一 Name 节点改为资源图标 Sprite。
        // 两种表现都保留节点路径，Presenter 与 Prefab 契约无需随美术阶段漂移。
        if (
            nameLabel?._string !== displayName &&
            !nameSprite?._spriteFrame?.__uuid__
        ) {
            problems.push(
                `Camp.scene ${resourceNodeName} 应显示名称“${displayName}”或正式资源图标`,
            );
        }
        if (valueLabel?._string !== '--') {
            problems.push(`Camp.scene ${resourceNodeName} 默认值应为 --，不得写假数值`);
        }
    }

    // 所有可点击入口都必须满足最小触控区（PRD-09 §4），阈值取自领域层。
    for (const button of camp.filter((entry) => entry.__type__ === 'cc.Button')) {
        const node = camp[button.node?.__id__];
        const size = nodeTransform(button.node?.__id__)?._contentSize;
        if (!size || size.width < MIN_TOUCH_TARGET_DP || size.height < MIN_TOUCH_TARGET_DP) {
            problems.push(
                `Camp.scene 可点击节点 ${node?._name ?? '(未知)'} 的触控区小于 ` +
                    `${MIN_TOUCH_TARGET_DP}×${MIN_TOUCH_TARGET_DP}dp`,
            );
        }
    }

    notes.push(`Camp.scene 三层骨架 ${camp.length} 条目`);
}

// ── 拆出的营地 Prefab。按 Prefab 文件遍历，一个文件可承载多个模块
// （CampPanorama.prefab 同时含 WorldViewport 与其子层 BuildingLayer）。
for (const prefabPath of CAMP_PREFAB_PATHS) {
    const fullPath = path.join(REPO_ROOT, prefabPath);
    const label = path.basename(prefabPath);
    const modules = CAMP_MODULES.filter((module) => module.prefabPath === prefabPath);
    if (!existsSync(fullPath)) {
        problems.push(`缺少营地 Prefab：${prefabPath}`);
        continue;
    }
    if (!existsSync(`${fullPath}.meta`)) {
        problems.push(`${prefabPath} 缺少 Cocos Creator 生成的 .meta`);
    }

    const prefab = JSON.parse(readFileSync(fullPath, 'utf8'));
    const findPrefabNodeIdx = (name) =>
        prefab.findIndex((entry) => entry.__type__ === 'cc.Node' && entry._name === name);

    // Prefab 的根由第一个模块声明；同文件内其余模块是它的后代。
    const [rootModule] = modules;
    const prefabAsset = prefab.find((entry) => entry.__type__ === 'cc.Prefab');
    const rootIdx = findPrefabNodeIdx(rootModule.rootNode);
    if (rootIdx < 0 || prefabAsset?.data?.__id__ !== rootIdx) {
        problems.push(`${label} 根节点必须为 ${rootModule.rootNode}`);
        continue;
    }

    for (const module of modules) {
        const presenterName = path.basename(module.presenter);
        const moduleRootIdx = findPrefabNodeIdx(module.rootNode);
        if (moduleRootIdx < 0) {
            problems.push(`${label} 缺少 ${module.rootNode} 节点`);
            continue;
        }
        const presenterType = compressUuid(
            uuidFromMeta(path.join(REPO_ROOT, `${module.presenter}.meta`)),
        );
        const rootComponentTypes = (prefab[moduleRootIdx]._components ?? []).map(
            (ref) => prefab[ref.__id__]?.__type__,
        );
        if (!rootComponentTypes.includes(presenterType)) {
            problems.push(`${label} ${module.rootNode} 未挂载 ${presenterName}`);
        }
        for (const relPath of module.presenterPaths) {
            if (resolvePrefabPath(prefab, moduleRootIdx, relPath) < 0) {
                problems.push(
                    `${label} ${module.rootNode}/${relPath} 不存在，` +
                        `${presenterName} 运行时会取不到该节点`,
                );
            }
        }
    }

    const prefabCustomTypes = new Set(
        prefab
            .map((entry) => entry.__type__)
            .filter((type) => typeof type === 'string' && !type.startsWith('cc.')),
    );
    for (const compressed of prefabCustomTypes) {
        if (!scriptIndex.has(compressed)) {
            problems.push(`${label} 引用了未知脚本组件 ${compressed}`);
        }
    }

    prefab.forEach((entry, index) => {
        const nodeRef = entry?.node?.__id__;
        if (typeof nodeRef !== 'number') {
            return;
        }
        const node = prefab[nodeRef];
        if (
            node?.__type__ !== 'cc.Node' ||
            !(node._components ?? []).some((ref) => ref.__id__ === index)
        ) {
            problems.push(`${label} [${index}] ${entry.__type__} 未被节点双向登记`);
        }
    });

    for (const panelName of CAMP_HIDDEN_PANELS) {
        const panel = prefab.find(
            (entry) => entry.__type__ === 'cc.Node' && entry._name === panelName,
        );
        if (panel && panel._active !== false) {
            problems.push(`${label} ${panelName} 默认必须隐藏`);
        }
    }

    for (const button of prefab.filter((entry) => entry.__type__ === 'cc.Button')) {
        const node = prefab[button.node?.__id__];
        const size = (node?._components ?? [])
            .map((ref) => prefab[ref.__id__])
            .find((component) => component?.__type__ === 'cc.UITransform')?._contentSize;
        if (!size || size.width < MIN_TOUCH_TARGET_DP || size.height < MIN_TOUCH_TARGET_DP) {
            problems.push(
                `${label} 可点击节点 ${node?._name ?? '(未知)'} 的触控区小于 ` +
                    `${MIN_TOUCH_TARGET_DP}×${MIN_TOUCH_TARGET_DP}dp`,
            );
        }
    }

    notes.push(`${label} ${prefab.length} 条目`);
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
