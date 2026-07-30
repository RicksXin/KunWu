/**
 * 生成营地场景 Camp.scene（任务 P0-HALL-001 / #7b2）。
 *
 * 节点树对应 PRD-01 §2 的信息架构：
 *   常驻顶部资源栏 / 主场景七座建筑 / 底部五项导航
 *
 * 生成的是灰盒结构：只有节点与组件挂载，没有美术资源。
 * Sprite 与 Label 的图片、字体需在编辑器中指定——那些引用需要资源 UUID，
 * 而资源本身还不存在。
 *
 * 用法：node tools/gen-camp-scene.mjs [--force]
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
    DESIGN_WIDTH,
} from './scene-builder.mjs';
import { uuidFromMeta } from './uuid-compress.mjs';
import { writeScene } from './write-scene.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

/** UI 贴图目录。第三方 CC0 素材隔离在此（PRD-11 §135）。 */
const UI_DIR = 'assets/third_party/kenney_pixel_ui';
/** Ark Pixel 字体。 */
const FONT_META = 'assets/fonts/ark-pixel-12px-proportional-zh_cn.ttf.meta';

/**
 * SpriteFrame 引用。png 的 .meta 里 subMetas 有个 sprite-frame 子资源，
 * 引用格式为 `<uuid>@<子资源ID>`——只用主 uuid 会拿到 ImageAsset，
 * Sprite 组件不认，表现为图不显示但不报错。
 */
function spriteFrameRef(name) {
    const metaPath = path.join(REPO_ROOT, UI_DIR, `${name}.png.meta`);
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


/** 七座建筑（PRD-01 §2），顺序须与 domain/HallBadges 的 BUILDING_IDS 一致。 */
const BUILDING_IDS = [
    'yi_shi_dian',
    'ling_pu',
    'zhao_xian_tai',
    'bai_bao_ku',
    'lian_qi_fang',
    'jiao_yi_hang',
    'huan_hun_tan',
];

/** 底部导航五项（PRD-01 §2）。 */
const NAV_ITEMS = ['camp', 'heroes', 'inventory', 'quests', 'expedition'];

/** 常驻顶部显示的五种资源（PRD-01 §2）。仙铢与魂晶在展开区。 */
const TOP_RESOURCES = ['spiritGrain', 'spiritWood', 'darkIron', 'spiritStone', 'gengJing'];


/**
 * 显示名。灰盒阶段直接内联，与 localization/zh_cn.json 的
 * building.* / nav.* / resource.* 保持一致。
 * 接入本地化服务后应改为运行时查表（P2）。
 */
const BUILDING_NAMES = {
    yi_shi_dian: '议事殿',
    ling_pu: '灵圃',
    zhao_xian_tai: '招贤台',
    bai_bao_ku: '百宝库',
    lian_qi_fang: '炼器坊',
    jiao_yi_hang: '交易行',
    huan_hun_tan: '还魂坛',
};

const NAV_NAMES = {
    camp: '营地',
    heroes: '修士',
    inventory: '背包',
    quests: '任务',
    expedition: '出征',
};

const RESOURCE_NAMES = {
    spiritGrain: '灵粮',
    spiritWood: '灵木',
    darkIron: '玄铁',
    spiritStone: '灵石',
    gengJing: '庚精',
};

/** 资源栏高度。留足 48dp 触控区（PRD-09 §4）。 */
const RESOURCE_BAR_HEIGHT = 160;
/** 底部导航高度。五项均分 1080 宽，每项 216×96 满足 48dp。 */
const BOTTOM_NAV_HEIGHT = 96;

const REQUIRED_SCRIPTS = {
    campPresenter: 'assets/scripts/presentation/CampPresenter.ts',
    resourceBar: 'assets/scripts/presentation/ResourceBar.ts',
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

    // ── 营地全景背景。不做自由行走场景（PRD-01 §1）
    const backdropIdx = scene.addNode({ name: 'Backdrop', parent: canvasIdx });
    scene.addUITransform(backdropIdx);
    scene.addWidget(backdropIdx, ALIGN_ALL);

    // ── 建筑容器。用 Widget 撑满并避开上下两栏，
    // 不能按 1920 硬编码坐标：19.5:9 机型上画布实际高 2341，
    // 硬编码会让建筑整体偏移（实测踩过）。
    const buildingsIdx = scene.addNode({ name: 'Buildings', parent: canvasIdx });
    scene.addUITransform(buildingsIdx);
    scene.addWidget(buildingsIdx, ALIGN_ALL, {
        // 顶部多留 60：19.5:9 机型的刘海会占掉一部分，
        // ViewportAdapter 的 SafeArea 只管 HUD 根节点，营地是独立场景
        top: RESOURCE_BAR_HEIGHT + 60,
        bottom: BOTTOM_NAV_HEIGHT + 40,
    });

    const buildingNodes = [];
    const badgeNodes = [];
    const buildingFrame = spriteFrameRef('brown');
    const font = fontRef();

    // 3 列网格。七座建筑排成 3+3+1，居中于建筑区
    const COLS = 3;
    const CELL_W = 340;
    const CELL_H = 220;
    const ROWS = Math.ceil(BUILDING_IDS.length / COLS);
    BUILDING_IDS.forEach((buildingId, index) => {
        const col = index % COLS;
        const row = Math.floor(index / COLS);
        // 相对容器中心排布，容器由 Widget 定位，故与画布高度无关
        const x = (col - (COLS - 1) / 2) * CELL_W;
        const y = ((ROWS - 1) / 2 - row) * CELL_H;

        const nodeIdx = scene.addNode({
            name: buildingId,
            parent: buildingsIdx,
            pos: vec3(x, y, 0),
        });
        // 建筑按钮 240×180，远大于 48dp 触控下限
        scene.addUITransform(nodeIdx, 240, 180);
        if (buildingFrame) {
            scene.attach(nodeIdx, makeSprite(buildingFrame));
        }
        // Button 是必需的：CampPresenter.applyBuildingStates 通过它的
        // interactable 实现 LOCKED/DISABLED 不可点（PRD-01 §5）
        scene.attach(nodeIdx, makeButton());
        buildingNodes.push(nodeIdx);

        // 建筑名。文案 Key 见 localization/zh_cn.json 的 building.*
        const labelNodeIdx = scene.addNode({ name: 'Name', parent: nodeIdx });
        scene.addUITransform(labelNodeIdx, 220, 40);
        scene.attach(labelNodeIdx, makeLabel(BUILDING_NAMES[buildingId], 24, font));

        // 红点。同一建筑只显示一个总红点（PRD-01 §7）
        const badgeIdx = scene.addNode({
            name: 'Badge',
            parent: nodeIdx,
            // 右上角
            pos: vec3(100, 70, 0),
        });
        scene.addUITransform(badgeIdx, 24, 24);
        // 默认隐藏，由 CampPresenter.renderBadges 控制
        scene.entries[badgeIdx]._active = false;
        badgeNodes.push(badgeIdx);
    });

    // ── 常驻顶部资源栏
    const resourceBarIdx = scene.addNode({
        name: 'ResourceBar',
        parent: canvasIdx,
        pos: vec3(0, 0, 0),
    });
    scene.addUITransform(resourceBarIdx, DESIGN_WIDTH, RESOURCE_BAR_HEIGHT);
    scene.addWidget(resourceBarIdx, ALIGN_TOP);

    // 资源栏底图
    const barFrame = spriteFrameRef('grey_inlay');
    if (barFrame) {
        scene.attach(resourceBarIdx, makeSprite(barFrame));
    }

    // 五种资源横向均分。之前全部叠在原点，界面上只看到一个数字
    const resourceLabels = {};
    const slotW = Math.floor(DESIGN_WIDTH / TOP_RESOURCES.length);
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
        resourceLabels[resource] = scene.attach(labelNodeIdx, makeLabel('0', 28, font));
    });

    // 展开区：仙铢与魂晶（PRD-01 §2）
    const expandedIdx = scene.addNode({ name: 'Expanded', parent: resourceBarIdx });
    scene.addUITransform(expandedIdx, DESIGN_WIDTH, RESOURCE_BAR_HEIGHT);
    scene.entries[expandedIdx]._active = false;

    const expandedLabels = {};
    const expandedList = ['immortalCoin', 'soulCrystal'];
    expandedList.forEach((resource, index) => {
        const entryIdx = scene.addNode({
            name: resource,
            parent: expandedIdx,
            pos: vec3(240 * (index - (expandedList.length - 1) / 2), 0, 0),
        });
        scene.addUITransform(entryIdx, 240, RESOURCE_BAR_HEIGHT);
        const labelNodeIdx = scene.addNode({ name: 'Value', parent: entryIdx });
        scene.addUITransform(labelNodeIdx, 220, 36);
        expandedLabels[resource] = scene.attach(labelNodeIdx, makeLabel('0', 28, font));
    });

    const resourceBarCompIdx = scene.addScript(resourceBarIdx, uuids.resourceBar, {
        spiritGrainLabel: { __id__: resourceLabels.spiritGrain },
        spiritWoodLabel: { __id__: resourceLabels.spiritWood },
        darkIronLabel: { __id__: resourceLabels.darkIron },
        spiritStoneLabel: { __id__: resourceLabels.spiritStone },
        gengJingLabel: { __id__: resourceLabels.gengJing },
        expandedGroup: { __id__: expandedIdx },
        immortalCoinLabel: { __id__: expandedLabels.immortalCoin },
        soulCrystalLabel: { __id__: expandedLabels.soulCrystal },
    });

    // ── 底部导航
    const navIdx = scene.addNode({ name: 'BottomNav', parent: canvasIdx });
    scene.addUITransform(navIdx, DESIGN_WIDTH, BOTTOM_NAV_HEIGHT);
    scene.addWidget(navIdx, ALIGN_BOTTOM);

    const navNodes = [];
    const itemWidth = Math.floor(DESIGN_WIDTH / NAV_ITEMS.length);
    NAV_ITEMS.forEach((item, index) => {
        const nodeIdx = scene.addNode({
            name: item,
            parent: navIdx,
            // 均分宽度，锚点居中故从中线偏移
            pos: vec3(itemWidth * (index - (NAV_ITEMS.length - 1) / 2), 0, 0),
        });
        scene.addUITransform(nodeIdx, itemWidth, BOTTOM_NAV_HEIGHT);
        const navFrame = spriteFrameRef('grey');
        if (navFrame) {
            scene.attach(nodeIdx, makeSprite(navFrame));
        }
        // Button 用于 interactable 控制，点击事件在编辑器中绑定
        scene.attach(nodeIdx, makeButton());

        const navLabelIdx = scene.addNode({ name: 'Label', parent: nodeIdx });
        scene.addUITransform(navLabelIdx, itemWidth - 8, 40);
        scene.attach(navLabelIdx, makeLabel(NAV_NAMES[item], 24, font));

        navNodes.push(nodeIdx);
    });

    // ── Presenter 挂在 Canvas 上，持有以上各节点引用
    scene.addScript(canvasIdx, uuids.campPresenter, {
        resourceBar: { __id__: resourceBarCompIdx },
        buildingNodes: buildingNodes.map((idx) => ({ __id__: idx })),
        bottomNavNodes: navNodes.map((idx) => ({ __id__: idx })),
        badgeNodes: badgeNodes.map((idx) => ({ __id__: idx })),
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
    force: process.argv.includes('--force'),
});
