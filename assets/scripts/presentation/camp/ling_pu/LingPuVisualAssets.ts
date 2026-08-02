import { assetManager, Sprite, SpriteFrame, TTFFont, UITransform } from 'cc';
import { RESOURCE_ICON_PATHS, RESOURCE_ROW_DEFINITIONS } from './LingPuViewTypes';
import type { LingPuView, VisualBackground } from './LingPuViewTypes';

/** 288×288 @3x 面板中，48 px 对应 16 个逻辑像素，可完整保留上下装饰。 */
const PANEL_FRAME_INSET = 48;

export async function loadAndApplyLingPuVisuals(
    view: LingPuView,
    isCancelled: () => boolean,
): Promise<void> {
    const [panel, row, inlineAction, footerAction, plus, minus, track, fill,
        grain, wood, iron, crystal, gengJing, font] = await Promise.all([
        loadSpriteFrame('camp', 'ui/ling_pu/ui_ling_pu_panel_frame/spriteFrame'),
        loadSpriteFrame('camp', 'ui/ling_pu/ui_ling_pu_resource_row/spriteFrame'),
        loadSpriteFrame('camp', 'ui/common/ui_common_button_inline_normal/spriteFrame'),
        loadSpriteFrame('camp', 'ui/common/ui_common_button_footer_normal/spriteFrame'),
        loadSpriteFrame('camp', 'ui/ling_pu/icon_action_plus/spriteFrame'),
        loadSpriteFrame('camp', 'ui/ling_pu/icon_action_minus/spriteFrame'),
        loadSpriteFrame('camp', 'ui/ling_pu/ui_production_progress_track/spriteFrame'),
        loadSpriteFrame('camp', 'ui/ling_pu/ui_production_progress_fill/spriteFrame'),
        loadSpriteFrame('camp', RESOURCE_ICON_PATHS.spiritGrain),
        loadSpriteFrame('camp', RESOURCE_ICON_PATHS.spiritWood),
        loadSpriteFrame('camp', RESOURCE_ICON_PATHS.darkIron),
        loadSpriteFrame('camp', RESOURCE_ICON_PATHS.spiritCrystal),
        loadSpriteFrame('camp', RESOURCE_ICON_PATHS.gengJing),
        loadFont(),
    ]);
    if (isCancelled()) return;

    view.resourceIconFrames.set('spiritGrain', grain);
    view.resourceIconFrames.set('spiritWood', wood);
    view.resourceIconFrames.set('darkIron', iron);
    view.resourceIconFrames.set('spiritCrystal', crystal);
    view.resourceIconFrames.set('gengJing', gengJing);
    applyWidthScaledSlicedFrame(view.panelBackground, panel, PANEL_FRAME_INSET);
    applyWidthScaledSlicedFrame(view.confirmationPanel, panel, PANEL_FRAME_INSET);
    for (const definition of RESOURCE_ROW_DEFINITIONS) {
        const rowView = view.rows.get(definition.id)?.view;
        if (!rowView) continue;
        applySlicedFrame(rowView.background, row, 18);
        rowView.icon.spriteFrame = view.resourceIconFrames.get(definition.id) ?? null;
        applySlicedFrame(rowView.upgrade.visual, inlineAction, 24, 18);
        applySimpleFrame(rowView.minus.visual, minus);
        applySimpleFrame(rowView.plus.visual, plus);
    }
    applySimpleFrame(view.progressTrack, track);
    view.progressFill.spriteFrame = fill;
    view.progressFill.type = Sprite.Type.FILLED;
    view.progressFill.fillType = Sprite.FillType.HORIZONTAL;
    view.progressFill.fillStart = 0;
    for (const button of [view.recruitButton, view.closeButton, view.confirmationPrimary, view.confirmationCancel]) {
        applySlicedFrame(button.visual, footerAction, 32, 11);
    }
    if (font) {
        for (const label of view.labels) label.font = font;
        view.modalFrame?.setFooterFont(font);
    }
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

function loadFont(): Promise<TTFFont | null> {
    const bundle = assetManager.getBundle('main');
    if (!bundle) return Promise.resolve(null);
    return new Promise((resolve) => {
        bundle.load('fonts/ark-pixel-12px-proportional-zh_cn', TTFFont,
            (error, asset) => resolve(error ? null : (asset ?? null)));
    });
}
