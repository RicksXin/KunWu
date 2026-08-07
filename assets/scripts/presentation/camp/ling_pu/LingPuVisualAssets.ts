import {
    assetManager,
    Button,
    Color,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
    VerticalTextAlignment,
} from 'cc';
import { applyCampResizableButtonStyle } from 'db://assets/scripts/presentation/camp/shared/CampResizableButtonStyle';
import type { CampModalPanelFrame } from 'db://assets/scripts/presentation/camp/shared/CampModalPanelFrame';
import { RESOURCE_ICON_PATHS, RESOURCE_ROW_DEFINITIONS, TEXT_PRIMARY, TEXT_SECONDARY } from './LingPuViewTypes';
import type { ButtonView, LingPuView, VisualBackground } from './LingPuViewTypes';

/** 288×288 @3x 面板中，48 px 对应 16 个逻辑像素，可完整保留上下装饰。 */
const PANEL_FRAME_INSET = 48;

export async function loadAndApplyLingPuVisuals(
    view: LingPuView,
    isCancelled: () => boolean,
): Promise<void> {
    const [panel, panelBody, panelTop, panelBottom, plus, minus,
        grain, wood, iron, crystal, gengJing] = await Promise.all([
        loadSpriteFrame('camp', 'ui/ling_pu/ui_ling_pu_panel_frame/spriteFrame'),
        loadSpriteFrame('camp', 'ui/ling_pu/ui_ling_pu_panel_body/spriteFrame'),
        loadSpriteFrame('camp', 'ui/expedition/ui_expedition_panel_decoration_top/spriteFrame'),
        loadSpriteFrame('camp', 'ui/expedition/ui_expedition_panel_decoration_bottom/spriteFrame'),
        loadSpriteFrame('camp', 'ui/ling_pu/icon_action_plus/spriteFrame'),
        loadSpriteFrame('camp', 'ui/ling_pu/icon_action_minus/spriteFrame'),
        loadSpriteFrame('camp', RESOURCE_ICON_PATHS.spiritGrain),
        loadSpriteFrame('camp', RESOURCE_ICON_PATHS.spiritWood),
        loadSpriteFrame('camp', RESOURCE_ICON_PATHS.darkIron),
        loadSpriteFrame('camp', RESOURCE_ICON_PATHS.spiritCrystal),
        loadSpriteFrame('camp', RESOURCE_ICON_PATHS.gengJing),
    ]);
    if (isCancelled()) return;

    view.resourceIconFrames.set('spiritGrain', grain);
    view.resourceIconFrames.set('spiritWood', wood);
    view.resourceIconFrames.set('darkIron', iron);
    view.resourceIconFrames.set('spiritCrystal', crystal);
    view.resourceIconFrames.set('gengJing', gengJing);
    view.panelBodyFrame = panelBody;
    view.panelDecorationTopFrame = panelTop;
    view.panelDecorationBottomFrame = panelBottom;
    refreshLingPuPanelVisual(view);
    applyWidthScaledSlicedFrame(view.panelBackground, panel, PANEL_FRAME_INSET);
    applyWidthScaledSlicedFrame(view.confirmationPanel, panel, PANEL_FRAME_INSET);
    for (const definition of RESOURCE_ROW_DEFINITIONS) {
        const rowView = view.rows.get(definition.id)?.view;
        if (!rowView) continue;
        applyResourceRowBackground(rowView.background);
        rowView.icon.spriteFrame = view.resourceIconFrames.get(definition.id) ?? null;
        applySimpleFrame(rowView.minus.visual, minus);
        applySimpleFrame(rowView.plus.visual, plus);
    }
    for (const label of view.labels) {
        label.font = null;
        label.useSystemFont = true;
        label.fontFamily = 'Noto Sans SC';
    }
    view.modalFrame?.setFooterFont(null);
}

export function prepareLingPuContentLayout(view: LingPuView): void {
    view.titleLabel.node.setPosition(0, 727.5, 0);
    view.titleLabel.node.getComponent(UITransform)?.setContentSize(1077, 72);
    styleLabel(view.titleLabel, 60, 72, TEXT_PRIMARY);
    view.idleWorkerLabel.node.setPosition(289.5, 631.5, 0);
    const rowsRoot = view.rows.values().next().value?.view.root.parent ?? null;
    rowsRoot?.setPosition(0, 0, 0);
    const rowPositions = [478.5, 244.5, 4.5, -235.5, -475.5];
    RESOURCE_ROW_DEFINITIONS.forEach((definition, index) => {
        const row = view.rows.get(definition.id)?.view;
        if (!row) return;
        row.root.setPosition(0, rowPositions[index], 0);
        row.root.getComponent(UITransform)?.setContentSize(870, 222);
        place(row.background.node, 0, 48, 870, 126);
        place(row.warningOutline, 0, 48, 870, 126);
        place(row.icon.node, -351, 48, 96, 96);
        place(row.name.node, -225, 72, 90, 54);
        place(row.rate.node, -45, 72, 180, 48);
        place(row.stock.node, -136.5, 21, 330, 48);
        place(row.upgrade.node, 291, 57, 216, 84);
        place(row.minus.node, 171, -69, 144, 144);
        place(row.workers.node, 285, -69, 144, 48);
        place(row.plus.node, 399, -69, 144, 144);
        place(row.status.node, -225, -69, 330, 42);
        styleLabel(row.name, 42, 54, TEXT_PRIMARY);
        styleLabel(row.rate, 36, 48, TEXT_SECONDARY);
        styleLabel(row.stock, 36, 48, TEXT_SECONDARY);
        styleLabel(row.workers, 36, 48, TEXT_PRIMARY);
        styleLabel(row.status, 30, 42, TEXT_SECONDARY);
    });
}

export function createLingPuIdleWorkerLabel(parent: Node, labels: Label[]): Label {
    const node = new Node('IdleWorkerLabel');
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(289.5, 631.5, 0);
    node.addComponent(UITransform).setContentSize(210, 48);
    const label = node.addComponent(Label);
    label.string = '闲置杂役： 0';
    label.fontSize = 36;
    label.lineHeight = 48;
    label.horizontalAlign = HorizontalTextAlignment.LEFT;
    label.verticalAlign = VerticalTextAlignment.CENTER;
    label.color = new Color(181, 138, 66, 255);
    labels.push(label);
    return label;
}

export function prepareLingPuResizableButton(
    view: ButtonView,
    kind: 'inline' | 'footer',
    visualWidth: number,
    visualHeight: number,
): void {
    if (view.label) {
        view.label.node.setParent(view.node, true);
        view.label.node.setPosition(0, kind === 'footer' ? 6 : 0, 0);
        view.label.node.getComponent(UITransform)?.setContentSize(visualWidth, visualHeight);
        styleLabel(
            view.label,
            kind === 'inline' ? 36 : 42,
            kind === 'inline' ? 48 : 60,
            TEXT_PRIMARY,
        );
    }
    view.visual.node.active = false;
    view.node.getComponent(UITransform)?.setContentSize(visualWidth, visualHeight);
    const visual = applyCampResizableButtonStyle(view.node, kind, 'default');
    view.node.getComponent(UITransform)?.setContentSize(visualWidth, Math.max(144, visualHeight));
    view.button.target = visual;
    view.button.transition = Button.Transition.SCALE;
    view.button.zoomScale = 0.96;
    view.button.duration = 0.1;
}

export function refreshLingPuPanelVisual(view: LingPuView): void {
    const panel = view.modalFrame?.mainPanel;
    if (!panel || !view.panelBodyFrame) return;
    panel.getChildByName('LingPuPanelVisual')?.destroy();
    const rootSprite = panel.getComponent(Sprite);
    if (rootSprite) rootSprite.enabled = false;
    const visual = new Node('LingPuPanelVisual');
    visual.layer = panel.layer;
    panel.addChild(visual);
    visual.setSiblingIndex(0);
    visual.addComponent(UITransform).setContentSize(359, 570);
    createPanelSprite(visual, 'PanelBody', view.panelBodyFrame, 0, 1.5, 335, 503);
    if (view.panelDecorationTopFrame) {
        createPanelSprite(visual, 'TopDecoration', view.panelDecorationTopFrame, 0, 252.5, 359, 65);
    }
    if (view.panelDecorationBottomFrame) {
        createPanelSprite(visual, 'BottomDecoration', view.panelDecorationBottomFrame, 0, -223.5, 359, 55);
    }
    panel.getChildByName('ContentMount')?.setSiblingIndex(panel.children.length - 1);
}

export function syncLingPuViewSize(root: Node, view: LingPuView): void {
    const size = root.getComponent(UITransform)?.contentSize;
    if (!size) return;
    view.mount.getComponent(UITransform)?.setContentSize(size);
    view.panelRoot.getComponent(UITransform)?.setContentSize(size);
    view.confirmationRoot.getComponent(UITransform)?.setContentSize(size);
    redrawSolid(view.backdrop, size.width, size.height);
    redrawSolid(view.confirmationRoot.getChildByName('ConfirmBackdrop'), size.width, size.height);
    if (view.modalFrame) fitLingPuFrameToLegacyContent(view.panelRoot, view, view.modalFrame);
}

/** 旧灵源院内容按 1029 宽保存；共享框架沿用该比例以保持资源栏可见。 */
export function fitLingPuFrameToLegacyContent(
    host: Node,
    view: LingPuView,
    frame: CampModalPanelFrame,
): void {
    const width = view.mainPanel.getComponent(UITransform)?.contentSize.width ?? 0;
    const legacyScale = width > 0 ? width / 343 : undefined;
    frame.fitToHost(host, legacyScale);
}

function redrawSolid(node: Node | null, width: number, height: number): void {
    if (!node) return;
    node.getComponent(UITransform)?.setContentSize(width, height);
    const graphics = node.getComponent(Graphics);
    if (!graphics) return;
    graphics.clear();
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
}

function applyResourceRowBackground(target: VisualBackground): void {
    target.sprite.enabled = false;
    const graphics = target.node.getComponent(Graphics) ?? target.node.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = new Color(8, 18, 16, 142);
    graphics.rect(-435, -63, 870, 126);
    graphics.fill();
}

function place(node: Node, x: number, y: number, width: number, height: number): void {
    node.setPosition(x, y, 0);
    node.getComponent(UITransform)?.setContentSize(width, height);
}

function styleLabel(label: Label, fontSize: number, lineHeight: number, color: Color): void {
    label.fontSize = fontSize;
    label.lineHeight = lineHeight;
    label.color = color.clone();
    label.verticalAlign = VerticalTextAlignment.CENTER;
}

function createPanelSprite(
    parent: Node,
    name: string,
    frame: SpriteFrame,
    x: number,
    y: number,
    width: number,
    height: number,
): void {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    const transform = node.addComponent(UITransform);
    const sprite = node.addComponent(Sprite);
    sprite.spriteFrame = frame;
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    transform.setContentSize(width, height);
}

function applySimpleFrame(target: VisualBackground, frame: SpriteFrame): void {
    target.sprite.spriteFrame = frame;
    target.sprite.type = Sprite.Type.SIMPLE;
    target.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
}

function applySlicedFrame(
    target: VisualBackground,
    frame: SpriteFrame,
    horizontalInset: number,
    verticalInset: number = horizontalInset,
): void {
    frame.insetLeft = horizontalInset;
    frame.insetRight = horizontalInset;
    frame.insetTop = verticalInset;
    frame.insetBottom = verticalInset;
    target.sprite.spriteFrame = frame;
    target.sprite.type = Sprite.Type.SLICED;
    target.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
}

/**
 * 旧工程使用 1080 宽坐标，而面板源图是 288 px @3x。普通九宫格不会放大边角，
 * 会让头尾只剩源图像素高度。这里保持最终外框尺寸不变，先按宽度等比放大整张
 * 九宫格，再只让中央区域承担额外的纵向拉伸。
 */
function applyWidthScaledSlicedFrame(
    target: VisualBackground,
    frame: SpriteFrame,
    inset: number,
): void {
    const transform = target.node.getComponent(UITransform);
    const sourceWidth = frame.originalSize.width;
    if (transform && sourceWidth > 0) {
        const currentScale = target.node.scale;
        const displayWidth = transform.contentSize.width * Math.abs(currentScale.x);
        const displayHeight = transform.contentSize.height * Math.abs(currentScale.y);
        const uniformScale = displayWidth / sourceWidth;
        if (uniformScale > 0) {
            transform.setContentSize(
                displayWidth / uniformScale,
                displayHeight / uniformScale,
            );
            target.node.setScale(uniformScale, uniformScale, currentScale.z);
        }
    }
    applySlicedFrame(target, frame, inset);
}

function loadSpriteFrame(bundleName: string, path: string): Promise<SpriteFrame> {
    const bundle = assetManager.getBundle(bundleName);
    if (!bundle) return Promise.reject(new Error(`${bundleName} Bundle 尚未加载`));
    return new Promise((resolve, reject) => {
        bundle.load(path, SpriteFrame, (error, asset) => {
            if (error || !asset) reject(error ?? new Error(`找不到 SpriteFrame ${path}`));
            else resolve(asset);
        });
    });
}
