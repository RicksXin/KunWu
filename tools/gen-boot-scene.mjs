/**
 * 生成启动场景 Boot.scene（任务 P0-TECH-001 / #6b）。
 *
 * 场景构建原语在 tools/scene-builder.mjs。
 *
 * 一条必须遵守的引擎约束：
 *   AppRoot 必须在场景根层级，不能挂在 Canvas 下。
 *   cc.d.ts 写明「目标节点必须位于层级的根节点，否则无效」——
 *   挂在 Canvas 下 addPersistRootNode 会静默失效，跨场景常驻形同虚设。
 *
 * 用法：node tools/gen-boot-scene.mjs [--force]
 */

import path from 'node:path';
import { existsSync } from 'node:fs';
import { SceneBuilder, validateScene, vec3 } from './scene-builder.mjs';
import { uuidFromMeta } from './uuid-compress.mjs';
import { writeScene } from './write-scene.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

/** Ark Pixel 像素字体（OFL）。资源类型 cc.TTFFont，UUID 由编辑器分配。 */
const FONT_META = 'assets/fonts/ark-pixel-12px-proportional-zh_cn.ttf.meta';

/**
 * 字体引用。缺 .meta 时返回 null，Label 回退系统字体——
 * 启动画面必须能显示，宁可字体不对也不能白屏
 * （PRD-10 §8：异步操作要有处理中状态）。
 */
function fontRef() {
    const metaPath = path.join(REPO_ROOT, FONT_META);
    if (!existsSync(metaPath)) {
        console.warn(`注意：${FONT_META} 缺失，启动画面回退系统字体。`);
        return null;
    }
    return { __uuid__: uuidFromMeta(metaPath), __expectedType__: 'cc.TTFFont' };
}

/**
 * 启动画面文字（PRD-09 §3「启动和加载」页）。
 *
 * 字号取 12 的整数倍：Ark Pixel 是 12px 点阵字体，
 * 非整数倍会让字形插值而发虚（CLAUDE.md：禁止对 Pixel Art 开线性过滤）。
 */
function addSplashLabel(scene, parentIdx, { name, text, fontSize, y, color, font }) {
    const nodeIdx = scene.addNode({
        name,
        parent: parentIdx,
        pos: vec3(0, y, 0),
    });
    scene.addUITransform(nodeIdx, 900, Math.round(fontSize * 1.6));
    const labelCompIdx = scene.attach(nodeIdx, {
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
        _lineHeight: Math.round(fontSize * 1.4),
        _overflow: 0,
        _enableWrapText: false,
        _font: font ?? null,
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
    });
    // 返回 Label 组件下标：GameBootstrap 的 statusLabel 要引用组件而非节点
    return labelCompIdx;
}

function build() {
    const scene = new SceneBuilder('Boot');

    const { canvasIdx } = scene.addCanvas();

    // ── 启动画面。挂在 Canvas 下，随场景一起显示
    const splashIdx = scene.addNode({ name: 'Splash', parent: canvasIdx });
    scene.addUITransform(splashIdx);
    scene.addWidget(splashIdx);

    const font = fontRef();

    addSplashLabel(scene, splashIdx, {
        name: 'Title',
        text: '昆吾禁地',
        // 12 × 8：点阵字体按整数倍放大才不发虚
        fontSize: 96,
        y: 120,
        color: [232, 227, 220],
        font,
    });
    addSplashLabel(scene, splashIdx, {
        name: 'Subtitle',
        text: '山外修士营地',
        // 12 × 3
        fontSize: 36,
        y: -10,
        color: [150, 140, 130],
        font,
    });
    const statusLabelCompIdx = addSplashLabel(scene, splashIdx, {
        name: 'Status',
        text: '正在初始化',
        // 12 × 2
        fontSize: 24,
        y: -220,
        color: [120, 112, 104],
        font,
    });

    // AppRoot 与 Canvas 同为根层级——addPersistRootNode 的硬性要求
    const appRootIdx = scene.addNode({ name: 'AppRoot' });
    const safeAreaIdx = scene.addNode({ name: 'SafeArea', parent: appRootIdx });

    // SafeArea 需要 UITransform 才能被 Widget 布局
    scene.addUITransform(safeAreaIdx);
    scene.addWidget(safeAreaIdx);

    // 启动流程组件挂在 Splash 上，持有状态文字与整层引用。
    // 缺 .meta 时跳过并提示——脚本 UUID 只能由编辑器分配，
    // 用假 UUID 会生成「丢失的脚本」，不报错且极难查。
    const bootstrapMeta = path.join(
        REPO_ROOT,
        'assets/scripts/presentation/GameBootstrap.ts.meta',
    );
    if (existsSync(bootstrapMeta)) {
        scene.addScript(splashIdx, uuidFromMeta(bootstrapMeta), {
            statusLabel: { __id__: statusLabelCompIdx },
            splashRoot: { __id__: splashIdx },
        });
    } else {
        console.warn(
            '注意：GameBootstrap.ts 缺少 .meta，本次未挂载启动流程组件。\n' +
                '      在编辑器中 Cmd+R 刷新资源后重新运行本脚本即可接上。',
        );
    }

    scene.addUITransform(appRootIdx);
    scene.addScript(appRootIdx, uuidFromMeta(path.join(REPO_ROOT, 'assets/scripts/AppRoot.ts')));
    scene.addScript(
        appRootIdx,
        uuidFromMeta(path.join(REPO_ROOT, 'assets/scripts/presentation/ViewportAdapter.ts')),
        // @property(Node) safeAreaRoot
        { safeAreaRoot: { __id__: safeAreaIdx } },
    );

    scene.addGlobals();
    return scene.finish();
}

const entries = build();
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
    // 不放在 assets/bundles/ 下：Cocos 禁止初始场景位于 Asset Bundle 内
    // （构建报错「当前初始场景不存在或在 Bundle 中」）。
    scenePath: path.join(REPO_ROOT, 'assets/scenes/Boot.scene'),
    repoRoot: REPO_ROOT,
    force: process.argv.includes('--force'),
});
