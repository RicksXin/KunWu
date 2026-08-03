import { Color, Graphics, Node, UITransform } from 'cc';
import type { SpiritualRootId } from 'db://assets/scripts/domain/HeroGrowth';

interface FrameStyle {
    readonly primary: Color;
    readonly accent: Color;
    readonly lineWidth: number;
}

const FRAME_STYLES: Readonly<Record<SpiritualRootId, FrameStyle>> = {
    mixed_root: frameStyle(143, 153, 149, 205, 211, 200, 1),
    pseudo_root: frameStyle(77, 161, 119, 157, 207, 143, 1.5),
    triple_root: frameStyle(65, 143, 203, 145, 207, 235, 1.5),
    dual_root: frameStyle(104, 121, 207, 188, 195, 246, 2),
    heavenly_root: frameStyle(211, 171, 70, 250, 229, 144, 2),
    variant_root: frameStyle(73, 211, 203, 223, 249, 231, 2),
};

/**
 * 六档灵根的 D0 代码覆盖层。轮廓和灵纹数量同时区分资质，不把颜色作为唯一信息。
 * 中心保持透明，正式 PNG 覆盖层接入后可直接替换本节点而不改修士卡数据流。
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
    const graphics = node.addComponent(Graphics);
    const style = FRAME_STYLES[spiritualRootId];
    drawCornerFrame(graphics, width, height, 2, style.primary, style.lineWidth);

    switch (spiritualRootId) {
        case 'mixed_root':
            drawBarMarkers(graphics, 5, height / 2 - 7, style.accent);
            break;
        case 'pseudo_root':
            drawCornerFrame(graphics, width, height, 5, style.accent, 1);
            drawSquareMarkers(graphics, 4, height / 2 - 8, style.accent);
            break;
        case 'triple_root':
            drawCircleMarkers(graphics, 3, height / 2 - 8, style.accent);
            break;
        case 'dual_root':
            drawDiamondMarkers(graphics, 2, height / 2 - 8, style.accent);
            break;
        case 'heavenly_root':
            drawSunMark(graphics, height / 2 - 10, style.accent);
            break;
        case 'variant_root':
            drawVariantMark(graphics, width, height, style.accent);
            break;
    }
}

function frameStyle(
    red: number,
    green: number,
    blue: number,
    accentRed: number,
    accentGreen: number,
    accentBlue: number,
    lineWidth: number,
): FrameStyle {
    return {
        primary: new Color(red, green, blue, 255),
        accent: new Color(accentRed, accentGreen, accentBlue, 255),
        lineWidth,
    };
}

function drawCornerFrame(
    graphics: Graphics,
    width: number,
    height: number,
    inset: number,
    color: Color,
    lineWidth: number,
): void {
    const left = -width / 2 + inset;
    const right = width / 2 - inset;
    const top = height / 2 - inset;
    const bottom = -height / 2 + inset;
    const horizontal = Math.min(17, width * 0.24);
    const vertical = Math.min(24, height * 0.14);
    graphics.strokeColor = color.clone();
    graphics.lineWidth = lineWidth;
    graphics.moveTo(left, top - vertical);
    graphics.lineTo(left, top);
    graphics.lineTo(left + horizontal, top);
    graphics.moveTo(right - horizontal, top);
    graphics.lineTo(right, top);
    graphics.lineTo(right, top - vertical);
    graphics.moveTo(left, bottom + vertical);
    graphics.lineTo(left, bottom);
    graphics.lineTo(left + horizontal, bottom);
    graphics.moveTo(right - horizontal, bottom);
    graphics.lineTo(right, bottom);
    graphics.lineTo(right, bottom + vertical);
    graphics.stroke();
}

function drawBarMarkers(graphics: Graphics, count: number, y: number, color: Color): void {
    graphics.fillColor = color.clone();
    markerXs(count, 7).forEach((x) => graphics.rect(x - 2, y - 1, 4, 2));
    graphics.fill();
}

function drawSquareMarkers(graphics: Graphics, count: number, y: number, color: Color): void {
    graphics.fillColor = color.clone();
    markerXs(count, 8).forEach((x) => graphics.rect(x - 1.5, y - 1.5, 3, 3));
    graphics.fill();
}

function drawCircleMarkers(graphics: Graphics, count: number, y: number, color: Color): void {
    graphics.fillColor = color.clone();
    markerXs(count, 10).forEach((x) => graphics.circle(x, y, 2.2));
    graphics.fill();
}

function drawDiamondMarkers(graphics: Graphics, count: number, y: number, color: Color): void {
    graphics.fillColor = color.clone();
    markerXs(count, 14).forEach((x) => {
        graphics.moveTo(x, y + 3.5);
        graphics.lineTo(x + 3.5, y);
        graphics.lineTo(x, y - 3.5);
        graphics.lineTo(x - 3.5, y);
        graphics.lineTo(x, y + 3.5);
    });
    graphics.fill();
}

function drawSunMark(graphics: Graphics, y: number, color: Color): void {
    graphics.strokeColor = color.clone();
    graphics.lineWidth = 1.5;
    graphics.circle(0, y, 4);
    [[0, 7], [0, -7], [7, 0], [-7, 0]].forEach(([dx, dy]) => {
        graphics.moveTo(dx * 0.72, y + dy * 0.72);
        graphics.lineTo(dx, y + dy);
    });
    graphics.stroke();
}

function drawVariantMark(graphics: Graphics, width: number, height: number, color: Color): void {
    const top = height / 2 - 7;
    graphics.strokeColor = color.clone();
    graphics.lineWidth = 1.5;
    graphics.moveTo(-width * 0.23, top - 5);
    graphics.lineTo(-width * 0.08, top + 1);
    graphics.lineTo(width * 0.03, top - 5);
    graphics.lineTo(width * 0.25, top + 1);
    graphics.moveTo(width / 2 - 7, -height * 0.18);
    graphics.lineTo(width / 2 - 3, -height * 0.08);
    graphics.lineTo(width / 2 - 8, height * 0.03);
    graphics.stroke();
}

function markerXs(count: number, spacing: number): readonly number[] {
    const start = -((count - 1) * spacing) / 2;
    return Array.from({ length: count }, (_, index) => start + index * spacing);
}
