import { Color, Graphics, Node, UITransform } from 'cc';
import type { SpiritualRootId } from 'db://assets/scripts/domain/HeroGrowth';

interface FrameStyle {
    readonly color: Color;
    readonly haloAlpha: number;
}

const FRAME_STYLES: Readonly<Record<SpiritualRootId, FrameStyle>> = {
    mixed_root: frameStyle(143, 153, 149, 92),
    pseudo_root: frameStyle(77, 161, 119, 108),
    triple_root: frameStyle(91, 149, 200, 138),
    dual_root: frameStyle(129, 116, 194, 145),
    heavenly_root: frameStyle(200, 154, 70, 150),
    variant_root: frameStyle(73, 211, 203, 145),
};

/**
 * Figma 修士卡的灵根光框覆盖层：只有 Halo/Core 两层矩形，不遮挡立绘或底部信息。
 * 六档资质通过各自颜色区分；中心保持透明，方便后续替换正式光框素材。
 */
export function createSpiritualRootFrame(
    parent: Node,
    spiritualRootId: SpiritualRootId,
    x: number,
    y: number,
    width: number,
    height: number,
): void {
    const node = new Node(`SpiritualRootFrame_${spiritualRootId}`);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(width, height);
    const style = FRAME_STYLES[spiritualRootId] ?? FRAME_STYLES.mixed_root;
    drawHalo(node, width, height, style);
    drawCore(node, width, height, style.color);
}

function drawHalo(parent: Node, width: number, height: number, style: FrameStyle): void {
    const halo = new Node('Halo');
    halo.layer = parent.layer;
    parent.addChild(halo);
    halo.addComponent(UITransform).setContentSize(width, height);
    const graphics = halo.addComponent(Graphics);
    graphics.strokeColor = new Color(
        style.color.r,
        style.color.g,
        style.color.b,
        style.haloAlpha,
    );
    graphics.lineWidth = 2.069;
    graphics.roundRect(
        -width / 2 + 1.0345,
        -height / 2 + 1.0345,
        width - 2.069,
        height - 2.069,
        1,
    );
    graphics.stroke();
}

function drawCore(parent: Node, width: number, height: number, color: Color): void {
    const core = new Node('Core');
    core.layer = parent.layer;
    parent.addChild(core);
    core.addComponent(UITransform).setContentSize(width, height);
    const graphics = core.addComponent(Graphics);
    graphics.strokeColor = color.clone();
    graphics.strokeColor.a = 235;
    graphics.lineWidth = 0.69;
    graphics.roundRect(
        -width / 2 + 0.345,
        -height / 2 + 0.345,
        width - 0.69,
        height - 0.69,
        1,
    );
    graphics.stroke();
}

function frameStyle(red: number, green: number, blue: number, haloAlpha: number): FrameStyle {
    return { color: new Color(red, green, blue, 255), haloAlpha };
}
