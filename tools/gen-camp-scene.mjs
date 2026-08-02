/**
 * 营地场景的历史初始化脚本（任务 P1-HALL-012/013 / 1.2.1–1.2.4）。
 *
 * 节点树对应 PRD-01 §2 的三层信息架构：
 *   顶部固定 HUD / 中央分层全景 / 底部固定 HUD
 *
 * 生成的是灰盒结构：只有节点与组件挂载，没有美术资源。
 * Sprite 与 Label 的图片、字体需在编辑器中指定——那些引用需要资源 UUID，
 * 而资源本身还不存在。
 *
 * 正式 Camp.scene 与后续 Prefab 以 Cocos Creator 保存结果为唯一事实源。
 * 本脚本只保留给“场景文件完全不存在”时的灰盒恢复，不得覆盖现有场景。
 *
 * 逻辑 id 与节点名从 domain/CampSceneContract 读取，坐标尺寸从
 * camp-layout-config 读取，本脚本自身不再持有第二份 id 列表。
 *
 * 用法：node --experimental-strip-types tools/gen-camp-scene.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
    SceneBuilder,
    validateScene,
    vec3,
    ALIGN_ALL,
    ALIGN_TOP,
    ALIGN_BOTTOM,
    ALIGN_LEFT,
    ALIGN_RIGHT,
    DESIGN_WIDTH,
} from './scene-builder.mjs';
import { uuidFromMeta } from './uuid-compress.mjs';
import { writeScene } from './write-scene.mjs';
import {
    CAMP_BUILDING_LAYOUT,
    CAMP_CLOSED_ANCHOR_LAYOUT,
    CAMP_LAYOUT,
    CAMP_RESOURCE_LABELS,
    CAMP_SYSTEM_ENTRY_LAYOUT,
} from './camp-layout-config.mjs';
import {
    BUILDING_IDS,
    CAMP_CLOSED_ANCHOR_NAMES,
    CAMP_MODULES,
    CAMP_RESOURCE_NODE_NAMES,
    CAMP_SYSTEM_ENTRY_IDS,
    CAMP_SYSTEM_ENTRY_NAMES,
    CAMP_SYSTEM_ENTRY_NODE_NAMES,
} from './camp-domain-contract.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

if (process.argv.includes('--force')) {
    console.error(
        '禁止整体覆盖 Camp.scene：正式场景由 Cocos Creator 与 Prefab 维护。' +
            '如需恢复，请从 Git 还原场景。',
    );
    process.exit(1);
}

/** UI 贴图目录。第三方 CC0 素材隔离在此（PRD-11 §135）。 */
const UI_DIR = 'assets/third_party/kenney_pixel_ui';
/** Ark Pixel 字体。 */
const FONT_META = 'assets/fonts/ark-pixel-12px-proportional-zh_cn.ttf.meta';
/** 营地正式横向背景，随 camp Bundle 加载。 */
const CAMP_BACKGROUND_META = 'assets/bundles/camp/env_camp_panorama_bg.png.meta';

/**
 * SpriteFrame 引用。png 的 .meta 里 subMetas 有个 sprite-frame 子资源，
 * 引用格式为 `<uuid>@<子资源ID>`——只用主 uuid 会拿到 ImageAsset，
 * Sprite 组件不认，表现为图不显示但不报错。
 */
function spriteFrameRefFromMeta(relativeMetaPath) {
    const metaPath = path.join(REPO_ROOT, relativeMetaPath);
    if (!existsSync(metaPath)) {
        return null;
    }
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    const subId = Object.entries(meta.subMetas ?? {}).find(
        ([, value]) => value.importer === 'sprite-frame',
    )?.[0];
    if (!subId) {
        return null;
    }
    return { __uuid__: `${meta.uuid}@${subId}`, __expectedType__: 'cc.SpriteFrame' };
}

function spriteFrameRef(name) {
    return spriteFrameRefFromMeta(path.join(UI_DIR, `${name}.png.meta`));
}

function fontRef() {
    const metaPath = path.join(REPO_ROOT, FONT_META);
    if (!existsSync(metaPath)) {
        return null;
    }
    return { __uuid__: uuidFromMeta(metaPath), __expectedType__: 'cc.TTFFont' };
}

/** Sprite 组件。9-slice 用 SLICED 模式，拉伸时保持圆角不变形。 */
function makeSprite(frame, { sliced = true, color = [255, 255, 255] } = {}) {
    return {
        __type__: 'cc.Sprite',
        _name: '',
        _objFlags: 0,
        _enabled: true,
        __prefab: null,
        _customMaterial: null,
        _srcBlendFactor: 2,
        _dstBlendFactor: 4,
        _color: { __type__: 'cc.Color', r: color[0], g: color[1], b: color[2], a: 255 },
        _spriteFrame: frame,
        // 1 = SLICED（九宫格），0 = SIMPLE
        _type: sliced ? 1 : 0,
        _fillType: 0,
        _sizeMode: 0,
        _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 },
        _fillStart: 0,
        _fillRange: 0,
        _isTrimmedMode: true,
        _useGrayscale: false,
        _atlas: null,
        _id: '',
    };
}


/** 常驻顶部显示的五种资源（PRD-01 §2）。仙铢与魂晶在展开区。 */
const TOP_RESOURCES = CAMP_RESOURCE_NODE_NAMES;

/**
 * 显示名。灰盒阶段与 localization/zh_cn.json 的
 * building.* / resource.* 保持一致；接入本地化服务后改为运行时查表（P2）。
 */
const BUILDING_NAMES = Object.fromEntries(
    BUILDING_IDS.map((id) => [id, CAMP_BUILDING_LAYOUT[id].label]),
);

const RESOURCE_NAMES = CAMP_RESOURCE_LABELS;

/** 顶部 HUD 同时容纳头像、五资源和主线。 */
const TOP_HUD_HEIGHT = CAMP_LAYOUT.sizes.topHud.height;
const RESOURCE_BAR_HEIGHT = CAMP_LAYOUT.sizes.resourceBar.height;
/** 底部固定 HUD 高度。 */
const BOTTOM_HUD_HEIGHT = CAMP_LAYOUT.sizes.bottomHud.height;
/** 左/中/右连续空间总宽为 2.8 屏，默认 x=0 停在中部。 */
const PANORAMA_WIDTH = CAMP_LAYOUT.sizes.panoramaContent.width;
/** 375×817 UI 稿按 1080 设计宽等比换算后的全高。 */
const PANORAMA_HEIGHT = CAMP_LAYOUT.sizes.panoramaContent.height;
/** 1152×896 交付背景包含安全出血；中央 1050×817 才是有效内容区。 */
const PANORAMA_ART_WIDTH = CAMP_LAYOUT.sizes.panoramaArtwork.width;
const PANORAMA_ART_HEIGHT = CAMP_LAYOUT.sizes.panoramaArtwork.height;

/**
 * 1.2.4 先把七座现有建筑放进左/中/右逻辑空间。
 * 1.2.5 再根据正式美术稿细化坐标、锚点和入口状态。
 */
const BUILDING_POSITIONS = Object.fromEntries(
    BUILDING_IDS.map((id) => {
        const { position } = CAMP_BUILDING_LAYOUT[id];
        return [id, [position.x, position.y]];
    }),
);

/**
 * 需要 UUID 的脚本。六个营地 Presenter 的路径来自契约，
 * 键即模块 id，避免这里再抄一份文件名。
 */
const REQUIRED_SCRIPTS = {
    resourceBar: 'assets/scripts/presentation/camp/hall/ResourceBar.ts',
    viewportAdapter: 'assets/scripts/presentation/core/ViewportAdapter.ts',
    ...Object.fromEntries(CAMP_MODULES.map((module) => [module.id, module.presenter])),
};

/**
 * 脚本 UUID 只能由编辑器分配。缺 .meta 时必须明确报错——
 * 用占位 UUID 生成的场景能打开但组件全是「丢失的脚本」，很难查。
 */
function resolveScriptUuids() {
    const missing = [];
    const uuids = {};

    for (const [key, relPath] of Object.entries(REQUIRED_SCRIPTS)) {
        const metaPath = path.join(REPO_ROOT, `${relPath}.meta`);
        if (!existsSync(metaPath)) {
            missing.push(relPath);
            continue;
        }
        uuids[key] = uuidFromMeta(metaPath);
    }

    if (missing.length > 0) {
        console.error('以下脚本缺少 .meta，无法生成营地场景：');
        for (const relPath of missing) {
            console.error(`  ${relPath}`);
        }
        console.error('');
        console.error('脚本 UUID 必须由编辑器分配（见 CLAUDE.md）。');
        console.error('请在 Cocos 编辑器中打开本工程并刷新资源，然后重新运行本脚本。');
        process.exit(2);
    }

    return uuids;
}

function build(uuids) {
    const scene = new SceneBuilder('Camp');
    const { canvasIdx } = scene.addCanvas();

    // ── 营地全景铺满画布并延伸到 HUD 背后。建筑坐标仍放在中部安全范围，
    // 顶部/底部 HUD 是后绘制的兄弟节点，不会随横滑移动。
    const worldViewportIdx = scene.addNode({ name: 'WorldViewport', parent: canvasIdx });
    scene.addUITransform(worldViewportIdx);
    scene.addWidget(worldViewportIdx, ALIGN_ALL);
    // 全景内容宽 2.8 屏，必须裁剪到中央可视区；否则宽屏设备会同时漏出
    // 左、中、右三段，玩家无需横滑就能看到全部建筑。
    scene.attach(worldViewportIdx, makeRectMask());

    // 当前没有正式全景资产，必须显示可读灰盒，不能露出空白。
    // 后续资源加载成功后只需关闭 SceneFallback，不影响三层节点结构。
    const fallbackIdx = scene.addNode({ name: 'SceneFallback', parent: worldViewportIdx });
    scene.addUITransform(fallbackIdx);
    scene.addWidget(fallbackIdx, ALIGN_ALL);
    const fallbackFrame = spriteFrameRef('grey_inlay');
    if (fallbackFrame) {
        scene.attach(fallbackIdx, makeSprite(fallbackFrame));
    }

    const font = fontRef();
    const fallbackLabelIdx = scene.addNode({ name: 'Message', parent: fallbackIdx });
    scene.addUITransform(fallbackLabelIdx, 720, 48);
    scene.attach(fallbackLabelIdx, makeLabel('营地全景灰盒', 24, font, [150, 140, 130]));

    // PanoramaContent 是唯一横向移动的节点；HUD 是 Canvas 下的独立兄弟节点。
    const panoramaContentIdx = scene.addNode({ name: 'PanoramaContent', parent: worldViewportIdx });
    scene.addUITransform(panoramaContentIdx, PANORAMA_WIDTH, PANORAMA_HEIGHT);

    const backgroundLayerIdx = scene.addNode({ name: 'BackgroundLayer', parent: panoramaContentIdx });
    scene.addUITransform(backgroundLayerIdx, PANORAMA_WIDTH, PANORAMA_HEIGHT);

    const campBackgroundFrame = spriteFrameRefFromMeta(CAMP_BACKGROUND_META);
    if (campBackgroundFrame) {
        const backgroundArtworkIdx = scene.addNode({
            name: 'PanoramaBackground',
            parent: backgroundLayerIdx,
        });
        scene.addUITransform(backgroundArtworkIdx, PANORAMA_ART_WIDTH, PANORAMA_ART_HEIGHT);
        scene.attach(backgroundArtworkIdx, makeSprite(campBackgroundFrame, { sliced: false }));
    }

    const buildingLayerIdx = scene.addNode({ name: 'BuildingLayer', parent: panoramaContentIdx });
    scene.addUITransform(buildingLayerIdx, PANORAMA_WIDTH, PANORAMA_HEIGHT);

    const foregroundLayerIdx = scene.addNode({ name: 'ForegroundLayer', parent: panoramaContentIdx });
    scene.addUITransform(foregroundLayerIdx, PANORAMA_WIDTH, PANORAMA_HEIGHT);

    const buildingFrame = spriteFrameRef('brown');

    BUILDING_IDS.forEach((buildingId, index) => {
        const [x, y] = BUILDING_POSITIONS[buildingId];

        const nodeIdx = scene.addNode({
            name: buildingId,
            parent: buildingLayerIdx,
            pos: vec3(x, y, 0),
        });
        scene.addUITransform(
            nodeIdx,
            CAMP_LAYOUT.sizes.building.width,
            CAMP_LAYOUT.sizes.building.height,
        );
        if (buildingFrame) {
            scene.attach(nodeIdx, makeSprite(buildingFrame));
        }
        // Button 是必需的：CampBuildingPresenter 通过它的 interactable
        // 实现 LOCKED/DISABLED 不可点（PRD-01 §5）
        scene.attach(nodeIdx, makeButton());

        // 建筑名放在建筑下方，状态文字再排在名称下方；不能让两者压住贴图主体。
        // 这里使用相对建筑高度的偏移，灰盒尺寸以后调整时仍保持正确层级。
        const buildingBottom = -CAMP_LAYOUT.sizes.building.height / 2;
        const nameY = buildingBottom - 30;
        const labelNodeIdx = scene.addNode({
            name: 'Name',
            parent: nodeIdx,
            pos: vec3(0, nameY, 0),
        });
        scene.addUITransform(labelNodeIdx, 216, 48);
        scene.attach(labelNodeIdx, makeLabel(BUILDING_NAMES[buildingId], 28, font));

        const stateNodeIdx = scene.addNode({
            name: 'State',
            parent: nodeIdx,
            pos: vec3(0, nameY - 50, 0),
        });
        scene.addUITransform(stateNodeIdx, 260, 36);
        scene.attach(stateNodeIdx, makeLabel('未加载', 20, font, [125, 118, 112]));

        // 红点。同一建筑只显示一个总红点（PRD-01 §7）
        const badgeIdx = scene.addNode({
            name: 'Badge',
            parent: nodeIdx,
            // 右上角
            pos: vec3(100, 70, 0),
        });
        scene.addUITransform(badgeIdx, 28, 28);
        // 默认隐藏，由 CampBuildingPresenter.renderBadges 控制
        scene.entries[badgeIdx]._active = false;
    });

    // 中部入山入口。整备页未完成前仍必须给出明确反馈。
    const expeditionIdx = scene.addNode({
        name: 'ExpeditionEntry',
        parent: buildingLayerIdx,
        pos: vec3(CAMP_LAYOUT.positions.expedition.x, CAMP_LAYOUT.positions.expedition.y, 0),
    });
    scene.addUITransform(
        expeditionIdx,
        CAMP_LAYOUT.sizes.expedition.width,
        CAMP_LAYOUT.sizes.expedition.height,
    );
    if (buildingFrame) {
        scene.attach(expeditionIdx, makeSprite(buildingFrame));
    }
    scene.attach(expeditionIdx, makeButton());
    const expeditionLabelIdx = scene.addNode({ name: 'Name', parent: expeditionIdx });
    scene.addUITransform(expeditionLabelIdx, 250, 56);
    scene.attach(expeditionLabelIdx, makeLabel('传送阵', 32, font));

    // 竞技场、遗迹、圣迹、教会只是场景锚点：无 Button、无 Badge。
    const addClosedAnchor = (name, label, x, y) => {
        const nodeIdx = scene.addNode({
            name,
            parent: buildingLayerIdx,
            pos: vec3(x, y, 0),
        });
        scene.addUITransform(
            nodeIdx,
            CAMP_LAYOUT.sizes.building.width,
            CAMP_LAYOUT.sizes.building.height,
        );
        if (fallbackFrame) {
            scene.attach(nodeIdx, makeSprite(fallbackFrame, { color: [150, 145, 140] }));
        }
        const labelIdx = scene.addNode({ name: 'Name', parent: nodeIdx });
        scene.addUITransform(labelIdx, 216, 64);
        scene.attach(labelIdx, makeLabel(`${label}·未开放`, 24, font, [125, 118, 112]));
        return nodeIdx;
    };
    CAMP_CLOSED_ANCHOR_NAMES.forEach((name) => {
        const { label, position } = CAMP_CLOSED_ANCHOR_LAYOUT[name];
        addClosedAnchor(name, label, position.x, position.y);
    });

    // ── 安全区根。Camp 是独立场景，不能引用 Boot 场景中 AppRoot 的
    // SafeArea 节点，因此复用 ViewportAdapter 为本场景根单独应用 Insets。
    const safeAreaRootIdx = scene.addNode({ name: 'SafeAreaRoot', parent: canvasIdx });
    scene.addUITransform(safeAreaRootIdx);
    scene.addWidget(safeAreaRootIdx, ALIGN_ALL);

    // ── 常驻顶部 HUD
    const topHudIdx = scene.addNode({ name: 'TopHUD', parent: safeAreaRootIdx });
    scene.addUITransform(topHudIdx, DESIGN_WIDTH, TOP_HUD_HEIGHT);
    scene.addWidget(topHudIdx, ALIGN_TOP | ALIGN_LEFT | ALIGN_RIGHT);
    // 不加底图：正式背景到位后灰盒底板会挡住全景顶部（2026-07-31 用户决定）。

    const avatarIdx = scene.addNode({
        name: 'AvatarButton',
        parent: topHudIdx,
        pos: vec3(-456, 56, 0),
    });
    scene.addUITransform(avatarIdx, 144, 144);
    if (buildingFrame) {
        scene.attach(avatarIdx, makeSprite(buildingFrame));
    }
    scene.attach(avatarIdx, makeButton());
    const avatarLabelIdx = scene.addNode({ name: 'Label', parent: avatarIdx });
    scene.addUITransform(avatarLabelIdx, 120, 40);
    scene.attach(avatarLabelIdx, makeLabel('头像', 24, font));

    const resourceBarIdx = scene.addNode({
        name: 'ResourceBar',
        parent: topHudIdx,
        pos: vec3(100, 56, 0),
    });
    const resourceBarWidth = CAMP_LAYOUT.sizes.resourceBar.width;
    scene.addUITransform(resourceBarIdx, resourceBarWidth, RESOURCE_BAR_HEIGHT);

    // 资源栏不加底图，同 TopHUD。

    // 五种资源横向均分。之前全部叠在原点，界面上只看到一个数字
    const resourceLabels = {};
    const slotW = Math.floor(resourceBarWidth / TOP_RESOURCES.length);
    TOP_RESOURCES.forEach((resource, index) => {
        const x = slotW * (index - (TOP_RESOURCES.length - 1) / 2);
        const entryIdx = scene.addNode({
            name: resource,
            parent: resourceBarIdx,
            pos: vec3(x, 0, 0),
        });
        scene.addUITransform(entryIdx, slotW, RESOURCE_BAR_HEIGHT);

        // 资源名在上，数值在下——只显示数字玩家分不清哪个是哪个
        // 名称在上、数值在下，均置于栏内。之前 y=24 会顶到栏外被裁
        const nameNodeIdx = scene.addNode({
            name: 'Name',
            parent: entryIdx,
            pos: vec3(0, 8, 0),
        });
        scene.addUITransform(nameNodeIdx, slotW - 8, 28);
        scene.attach(nameNodeIdx, makeLabel(RESOURCE_NAMES[resource], 20, font, [150, 140, 130]));

        const labelNodeIdx = scene.addNode({
            name: 'Value',
            parent: entryIdx,
            pos: vec3(0, -34, 0),
        });
        scene.addUITransform(labelNodeIdx, slotW - 8, 36);
        resourceLabels[resource] = scene.attach(labelNodeIdx, makeLabel('--', 28, font));
    });

    scene.addScript(resourceBarIdx, uuids.resourceBar, {
        spiritGrainLabel: { __id__: resourceLabels.spiritGrain },
        spiritWoodLabel: { __id__: resourceLabels.spiritWood },
        darkIronLabel: { __id__: resourceLabels.darkIron },
        spiritStoneLabel: { __id__: resourceLabels.spiritStone },
        gengJingLabel: { __id__: resourceLabels.gengJing },
    });

    const mainTaskIdx = scene.addNode({
        name: 'MainTaskButton',
        parent: topHudIdx,
        pos: vec3(-180, -96, 0),
    });
    scene.addUITransform(mainTaskIdx, 720, 72);
    if (buildingFrame) {
        scene.attach(mainTaskIdx, makeSprite(buildingFrame));
    }
    scene.attach(mainTaskIdx, makeButton());
    const taskIconIdx = scene.addNode({ name: 'Icon', parent: mainTaskIdx, pos: vec3(-322, 0, 0) });
    scene.addUITransform(taskIconIdx, 56, 56);
    scene.attach(taskIconIdx, makeLabel('任', 28, font));
    const mainTaskLabelIdx = scene.addNode({ name: 'Objective', parent: mainTaskIdx, pos: vec3(25, 0, 0) });
    scene.addUITransform(mainTaskLabelIdx, 610, 48);
    scene.attach(mainTaskLabelIdx, makeLabel('主线：--', 24, font));

    // ── 常驻底部 HUD：左五入口、右侧独立灵石余额。
    const bottomHudIdx = scene.addNode({ name: 'BottomHUD', parent: safeAreaRootIdx });
    scene.addUITransform(bottomHudIdx, DESIGN_WIDTH, BOTTOM_HUD_HEIGHT);
    scene.addWidget(bottomHudIdx, ALIGN_BOTTOM | ALIGN_LEFT | ALIGN_RIGHT);
    // 底部 HUD 同样不加底图。

    const bottomLeftIdx = scene.addNode({ name: 'BottomLeftSlots', parent: bottomHudIdx });
    scene.addUITransform(
        bottomLeftIdx,
        CAMP_LAYOUT.sizes.bottomLeftSlots.width,
        CAMP_LAYOUT.sizes.bottomLeftSlots.height,
    );
    scene.addWidget(bottomLeftIdx, ALIGN_TOP | ALIGN_BOTTOM | ALIGN_LEFT);
    CAMP_SYSTEM_ENTRY_IDS.forEach((entryId) => {
        const nodeName = CAMP_SYSTEM_ENTRY_NODE_NAMES[entryId];
        const label = CAMP_SYSTEM_ENTRY_NAMES[entryId];
        const { position } = CAMP_SYSTEM_ENTRY_LAYOUT[entryId];
        const entryIdx = scene.addNode({
            name: nodeName,
            parent: bottomLeftIdx,
            pos: vec3(position.x, position.y, 0),
        });
        scene.addUITransform(
            entryIdx,
            CAMP_LAYOUT.sizes.systemEntry.width,
            CAMP_LAYOUT.sizes.systemEntry.height,
        );
        if (buildingFrame) {
            scene.attach(entryIdx, makeSprite(buildingFrame));
        }
        scene.attach(entryIdx, makeButton());
        const labelIdx = scene.addNode({ name: 'Label', parent: entryIdx });
        scene.addUITransform(labelIdx, 100, 40);
        scene.attach(labelIdx, makeLabel(label, 20, font));
    });

    const bottomRightIdx = scene.addNode({ name: 'BottomRightCurrency', parent: bottomHudIdx });
    scene.addUITransform(
        bottomRightIdx,
        CAMP_LAYOUT.sizes.bottomRightCurrency.width,
        CAMP_LAYOUT.sizes.bottomRightCurrency.height,
    );
    scene.addWidget(bottomRightIdx, ALIGN_TOP | ALIGN_BOTTOM | ALIGN_RIGHT);
    const currencyIconIdx = scene.addNode({
        name: 'ImmortalCoinIcon',
        parent: bottomRightIdx,
        pos: vec3(
            CAMP_LAYOUT.positions.immortalCoinIcon.x,
            CAMP_LAYOUT.positions.immortalCoinIcon.y,
            0,
        ),
    });
    scene.addUITransform(
        currencyIconIdx,
        CAMP_LAYOUT.sizes.immortalCoinIcon.width,
        CAMP_LAYOUT.sizes.immortalCoinIcon.height,
    );
    scene.attach(currencyIconIdx, makeLabel('石', 28, font, [218, 188, 96]));
    const currencyValueIdx = scene.addNode({
        name: 'ImmortalCoinValue',
        parent: bottomRightIdx,
        pos: vec3(
            CAMP_LAYOUT.positions.immortalCoinValue.x,
            CAMP_LAYOUT.positions.immortalCoinValue.y,
            0,
        ),
    });
    scene.addUITransform(
        currencyValueIdx,
        CAMP_LAYOUT.sizes.immortalCoinValue.width,
        CAMP_LAYOUT.sizes.immortalCoinValue.height,
    );
    scene.attach(currencyValueIdx, makeLabel('--', 28, font));

    // SettingsPage 是始终激活的页面壳，Presenter 挂在它上面。
    // 面板自身 active=false，组件挂在面板上时 onLoad 不会执行。
    const settingsPageIdx = scene.addNode({ name: 'SettingsPage', parent: safeAreaRootIdx });
    scene.addUITransform(settingsPageIdx);
    scene.addWidget(settingsPageIdx, ALIGN_ALL);

    // 设置页页面壳；详细音频、画面和存档控制属于后续设置任务。
    const settingsPanelIdx = scene.addNode({ name: 'SettingsPanel', parent: settingsPageIdx });
    scene.addUITransform(settingsPanelIdx);
    scene.addWidget(settingsPanelIdx, ALIGN_ALL);
    scene.entries[settingsPanelIdx]._active = false;
    if (fallbackFrame) {
        scene.attach(settingsPanelIdx, makeSprite(fallbackFrame, { color: [92, 90, 94] }));
    }
    scene.attach(settingsPanelIdx, makeBlockInputEvents());
    const settingsTitleIdx = scene.addNode({
        name: 'Title',
        parent: settingsPanelIdx,
        pos: vec3(0, 700, 0),
    });
    scene.addUITransform(settingsTitleIdx, 600, 72);
    scene.attach(settingsTitleIdx, makeLabel('设置', 36, font));
    const settingsHintIdx = scene.addNode({
        name: 'Hint',
        parent: settingsPanelIdx,
        pos: vec3(0, 300, 0),
    });
    scene.addUITransform(settingsHintIdx, 760, 300);
    scene.attach(
        settingsHintIdx,
        makeWrappedLabel('音频设置\n画面设置\n语言设置\n存档导入与导出\n\n详细选项将在后续版本开放', 24, font),
    );
    const settingsBackIdx = scene.addNode({
        name: 'SettingsBackButton',
        parent: settingsPanelIdx,
        pos: vec3(-420, 780, 0),
    });
    scene.addUITransform(settingsBackIdx, 160, 72);
    if (buildingFrame) {
        scene.attach(settingsBackIdx, makeSprite(buildingFrame));
    }
    scene.attach(settingsBackIdx, makeButton());
    const settingsBackLabelIdx = scene.addNode({ name: 'Label', parent: settingsBackIdx });
    scene.addUITransform(settingsBackLabelIdx, 140, 40);
    scene.attach(settingsBackLabelIdx, makeLabel('返回', 24, font));

    // ── 议事殿营地人物列表。当前新档只显示岑守一。
    // NpcPage 同为始终激活的页面壳，承载列表与对话两个面板。
    const npcPageIdx = scene.addNode({ name: 'NpcPage', parent: safeAreaRootIdx });
    scene.addUITransform(npcPageIdx);
    scene.addWidget(npcPageIdx, ALIGN_ALL);

    const npcListPanelIdx = scene.addNode({ name: 'NpcListPanel', parent: npcPageIdx });
    scene.addUITransform(npcListPanelIdx);
    scene.addWidget(npcListPanelIdx, ALIGN_ALL);
    scene.entries[npcListPanelIdx]._active = false;
    if (fallbackFrame) {
        scene.attach(npcListPanelIdx, makeSprite(fallbackFrame, { color: [105, 102, 105] }));
    }
    scene.attach(npcListPanelIdx, makeBlockInputEvents());

    const npcListTitleIdx = scene.addNode({ name: 'Title', parent: npcListPanelIdx, pos: vec3(0, 700, 0) });
    scene.addUITransform(npcListTitleIdx, 700, 72);
    scene.attach(npcListTitleIdx, makeLabel('议事殿·营地人物', 32, font));

    const npcListHintIdx = scene.addNode({ name: 'Hint', parent: npcListPanelIdx, pos: vec3(0, 610, 0) });
    scene.addUITransform(npcListHintIdx, 780, 48);
    scene.attach(npcListHintIdx, makeLabel('只显示已随主线入驻的人物', 20, font, [150, 140, 130]));

    const npcListBackIdx = scene.addNode({ name: 'NpcListBackButton', parent: npcListPanelIdx, pos: vec3(-420, 780, 0) });
    scene.addUITransform(npcListBackIdx, 160, 72);
    if (buildingFrame) {
        scene.attach(npcListBackIdx, makeSprite(buildingFrame));
    }
    scene.attach(npcListBackIdx, makeButton());
    const npcListBackLabelIdx = scene.addNode({ name: 'Label', parent: npcListBackIdx });
    scene.addUITransform(npcListBackLabelIdx, 140, 40);
    scene.attach(npcListBackLabelIdx, makeLabel('返回', 24, font));

    const cenButtonIdx = scene.addNode({ name: 'CenShouyiButton', parent: npcListPanelIdx, pos: vec3(0, 390, 0) });
    scene.addUITransform(cenButtonIdx, 820, 180);
    if (buildingFrame) {
        scene.attach(cenButtonIdx, makeSprite(buildingFrame));
    }
    scene.attach(cenButtonIdx, makeButton());

    const cenAvatarIdx = scene.addNode({ name: 'Avatar', parent: cenButtonIdx, pos: vec3(-330, 0, 0) });
    scene.addUITransform(cenAvatarIdx, 128, 128);
    if (fallbackFrame) {
        scene.attach(cenAvatarIdx, makeSprite(fallbackFrame, { color: [135, 145, 145] }));
    }
    const cenAvatarLabelIdx = scene.addNode({ name: 'Label', parent: cenAvatarIdx });
    scene.addUITransform(cenAvatarLabelIdx, 100, 40);
    scene.attach(cenAvatarLabelIdx, makeLabel('岑伯', 24, font));

    const npcNameIdx = scene.addNode({ name: 'NpcName', parent: cenButtonIdx, pos: vec3(-140, 40, 0) });
    scene.addUITransform(npcNameIdx, 260, 44);
    scene.attach(npcNameIdx, makeLabel('岑守一', 28, font));
    const npcRoleIdx = scene.addNode({ name: 'NpcRole', parent: cenButtonIdx, pos: vec3(-60, -30, 0) });
    scene.addUITransform(npcRoleIdx, 440, 40);
    scene.attach(npcRoleIdx, makeLabel('留守管事·旧阵簿保管人', 20, font, [150, 140, 130]));
    const npcStatusIdx = scene.addNode({ name: 'NpcStatus', parent: cenButtonIdx, pos: vec3(310, 0, 0) });
    scene.addUITransform(npcStatusIdx, 150, 48);
    scene.attach(npcStatusIdx, makeLabel('有任务', 20, font));

    // ── 岑守一对话。结束后返回人物列表，不跳到其它页面。
    const npcDialogPanelIdx = scene.addNode({ name: 'NpcDialogPanel', parent: npcPageIdx });
    scene.addUITransform(npcDialogPanelIdx);
    scene.addWidget(npcDialogPanelIdx, ALIGN_ALL);
    scene.entries[npcDialogPanelIdx]._active = false;
    if (fallbackFrame) {
        scene.attach(npcDialogPanelIdx, makeSprite(fallbackFrame, { color: [92, 90, 94] }));
    }
    scene.attach(npcDialogPanelIdx, makeBlockInputEvents());

    const dialogTitleIdx = scene.addNode({ name: 'Title', parent: npcDialogPanelIdx, pos: vec3(0, 700, 0) });
    scene.addUITransform(dialogTitleIdx, 760, 72);
    scene.attach(dialogTitleIdx, makeLabel('岑守一·留守管事', 32, font));

    const dialogBackIdx = scene.addNode({ name: 'NpcDialogBackButton', parent: npcDialogPanelIdx, pos: vec3(-420, 780, 0) });
    scene.addUITransform(dialogBackIdx, 160, 72);
    if (buildingFrame) {
        scene.attach(dialogBackIdx, makeSprite(buildingFrame));
    }
    scene.attach(dialogBackIdx, makeButton());
    const dialogBackLabelIdx = scene.addNode({ name: 'Label', parent: dialogBackIdx });
    scene.addUITransform(dialogBackLabelIdx, 140, 40);
    scene.attach(dialogBackLabelIdx, makeLabel('返回', 24, font));

    const dialogPortraitIdx = scene.addNode({ name: 'Portrait', parent: npcDialogPanelIdx, pos: vec3(-330, 180, 0) });
    scene.addUITransform(dialogPortraitIdx, 280, 400);
    if (fallbackFrame) {
        scene.attach(dialogPortraitIdx, makeSprite(fallbackFrame, { color: [125, 138, 140] }));
    }
    const portraitHintIdx = scene.addNode({ name: 'Hint', parent: dialogPortraitIdx });
    scene.addUITransform(portraitHintIdx, 230, 100);
    scene.attach(portraitHintIdx, makeLabel('灰青旧袍\n木质阵钥\n卷边账簿', 20, font, [150, 140, 130]));

    const dialogBoxIdx = scene.addNode({ name: 'DialogueBox', parent: npcDialogPanelIdx, pos: vec3(160, 180, 0) });
    scene.addUITransform(dialogBoxIdx, 640, 400);
    if (buildingFrame) {
        scene.attach(dialogBoxIdx, makeSprite(buildingFrame));
    }
    const dialogTextIdx = scene.addNode({ name: 'DialogueText', parent: dialogBoxIdx });
    scene.addUITransform(dialogTextIdx, 570, 320);
    scene.attach(
        dialogTextIdx,
        makeWrappedLabel('……', 24, font),
    );

    const dialogNextIdx = scene.addNode({ name: 'NpcDialogNextButton', parent: npcDialogPanelIdx, pos: vec3(320, -350, 0) });
    scene.addUITransform(dialogNextIdx, 220, 84);
    if (buildingFrame) {
        scene.attach(dialogNextIdx, makeSprite(buildingFrame));
    }
    scene.attach(dialogNextIdx, makeButton());
    const dialogNextLabelNodeIdx = scene.addNode({ name: 'Label', parent: dialogNextIdx });
    scene.addUITransform(dialogNextLabelNodeIdx, 180, 48);
    scene.attach(dialogNextLabelNodeIdx, makeLabel('继续', 24, font));

    // ── 六个 Presenter 各挂在自己的模块根节点上。
    // 拆分后不再有跨节点 @property 接线：Presenter 用 CampSceneContract
    // 里的相对路径在自己子树内查找，故此处只需挂载组件、无需传引用。
    const MODULE_ROOT_IDX = {
        panorama: worldViewportIdx,
        buildings: buildingLayerIdx,
        topHud: topHudIdx,
        bottomHud: bottomHudIdx,
        npcPage: npcPageIdx,
        settingsPage: settingsPageIdx,
    };
    for (const module of CAMP_MODULES) {
        scene.addScript(MODULE_ROOT_IDX[module.id], uuids[module.id], {});
    }
    scene.addScript(canvasIdx, uuids.viewportAdapter, {
        safeAreaRoot: { __id__: safeAreaRootIdx },
    });

    scene.addGlobals();
    return scene.finish();
}

/**
 * Label 组件。
 * 字号取 4 的倍数：Ark Pixel 是 12px 点阵，
 * 非整数倍放大会让字形插值发虚（CLAUDE.md）。
 */
function makeLabel(text = '0', fontSize = 32, font = null, color = [232, 227, 220]) {
    return {
        __type__: 'cc.Label',
        _name: '',
        _objFlags: 0,
        _enabled: true,
        __prefab: null,
        _customMaterial: null,
        _srcBlendFactor: 2,
        _dstBlendFactor: 4,
        _color: { __type__: 'cc.Color', r: color[0], g: color[1], b: color[2], a: 255 },
        _string: text,
        _horizontalAlign: 1,
        _verticalAlign: 1,
        _actualFontSize: fontSize,
        _fontSize: fontSize,
        _fontFamily: 'Arial',
        _lineHeight: Math.round(fontSize * 1.3),
        _overflow: 0,
        _enableWrapText: false,
        _font: font,
        // 有字体资源时必须关掉系统字体，否则引擎忽略 _font
        _isSystemFontUsed: !font,
        _spacingX: 0,
        _isItalic: false,
        _isBold: false,
        _isUnderline: false,
        _underlineHeight: 2,
        _cacheMode: 0,
        _enableOutline: false,
        _outlineColor: { __type__: 'cc.Color', r: 0, g: 0, b: 0, a: 255 },
        _outlineWidth: 2,
        _enableShadow: false,
        _shadowColor: { __type__: 'cc.Color', r: 0, g: 0, b: 0, a: 255 },
        _shadowOffset: { __type__: 'cc.Vec2', x: 2, y: 2 },
        _shadowBlur: 2,
        _id: '',
    };
}

/** 对话正文使用固定文本框自动换行，避免长句溢出面板。 */
function makeWrappedLabel(text, fontSize, font, color = [232, 227, 220]) {
    return {
        ...makeLabel(text, fontSize, font, color),
        // 1 = CLAMP：保持节点尺寸并在宽度内自动换行。
        _overflow: 1,
        _enableWrapText: true,
        _lineHeight: Math.round(fontSize * 1.6),
    };
}

/** 全屏子页面吞掉触摸，避免点击穿透到底层全景建筑。 */
function makeBlockInputEvents() {
    return {
        __type__: 'cc.BlockInputEvents',
        _name: '',
        _objFlags: 0,
        _enabled: true,
        __prefab: null,
        _id: '',
    };
}

/** WorldViewport 的矩形裁剪。Mask 会在运行时创建 Graphics 模板。 */
function makeRectMask() {
    return {
        __type__: 'cc.Mask',
        _name: '',
        _objFlags: 0,
        _enabled: true,
        __prefab: null,
        _materials: [],
        _visFlags: 0,
        _srcBlendFactor: 2,
        _dstBlendFactor: 4,
        _color: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
        // 0 = GRAPHICS_RECT
        _type: 0,
        _inverted: false,
        _segments: 64,
        _alphaThreshold: 0.1,
        _id: '',
    };
}

/** Button 组件。过渡效果留默认，具体样式在编辑器中调。 */
function makeButton() {
    return {
        __type__: 'cc.Button',
        _name: '',
        _objFlags: 0,
        _enabled: true,
        __prefab: null,
        clickEvents: [],
        _interactable: true,
        _transition: 0,
        _normalColor: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
        _hoverColor: { __type__: 'cc.Color', r: 211, g: 211, b: 211, a: 255 },
        _pressedColor: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
        _disabledColor: { __type__: 'cc.Color', r: 124, g: 124, b: 124, a: 255 },
        _normalSprite: null,
        _hoverSprite: null,
        _pressedSprite: null,
        _disabledSprite: null,
        _duration: 0.1,
        _zoomScale: 1.2,
        _target: null,
        _id: '',
    };
}

const uuids = resolveScriptUuids();
const entries = build(uuids);
const problems = validateScene(entries);
if (problems.length > 0) {
    console.error('场景引用校验失败：');
    for (const problem of problems) {
        console.error(`  ${problem}`);
    }
    process.exit(1);
}

writeScene({
    entries,
    scenePath: path.join(REPO_ROOT, 'assets/bundles/camp/Camp.scene'),
    repoRoot: REPO_ROOT,
    force: false,
});
