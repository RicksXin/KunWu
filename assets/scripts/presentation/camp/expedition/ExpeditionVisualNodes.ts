import {
    Color,
    Graphics,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
} from 'cc';
import type { ExpeditionItemId } from 'db://assets/scripts/domain/ExpeditionPreparation';
import { EXPEDITION_COLORS } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionTheme';

export function applyPanelBackground(node: Node, frame: SpriteFrame | null): void {
    const sprite = node.getComponent(Sprite);
    if (!sprite) {
        return;
    }
    const transform = node.getComponent(UITransform);
    const width = transform?.contentSize.width ?? 359;
    const height = transform?.contentSize.height ?? 570;
    sprite.color = frame ? new Color(255, 255, 255, 255) : EXPEDITION_COLORS.panel.clone();
    if (!frame) {
        return;
    }
    frame.insetLeft = 30;
    frame.insetRight = 30;
    frame.insetTop = 30;
    frame.insetBottom = 30;
    sprite.spriteFrame = frame;
    sprite.type = Sprite.Type.SLICED;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    transform?.setContentSize(width, height);
}

export function drawSolidBackground(node: Node, color: Color): void {
    const size = node.getComponent(UITransform)?.contentSize;
    const width = size?.width ?? 79;
    const height = size?.height ?? 205;
    const sprite = node.getComponent(Sprite);
    if (sprite) {
        sprite.enabled = false;
    }

    let fillNode = node.getChildByName('SolidFill');
    if (!fillNode) {
        fillNode = new Node('SolidFill');
        node.addChild(fillNode);
    }
    fillNode.layer = node.layer;
    fillNode.setPosition(0, 0, 0);
    fillNode.setSiblingIndex(0);
    const fillTransform = fillNode.getComponent(UITransform) ?? fillNode.addComponent(UITransform);
    fillTransform.setContentSize(width, height);
    fillTransform.setAnchorPoint(0.5, 0.5);
    const graphics = fillNode.getComponent(Graphics) ?? fillNode.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = color.clone();
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
}

export function createSpriteNode(
    parent: Node,
    name: string,
    frame: SpriteFrame,
    x: number,
    y: number,
    width: number,
    height: number,
): Sprite {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    const transform = node.addComponent(UITransform);
    const sprite = node.addComponent(Sprite);
    sprite.spriteFrame = frame;
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    // 赋 SpriteFrame 时 Cocos 会先按源图像素尺寸刷新 UITransform。
    transform.setContentSize(width, height);
    transform.setAnchorPoint(0.5, 0.5);
    return sprite;
}

export function createSilhouette(
    parent: Node,
    x: number,
    y: number,
    undecided: boolean,
    scale = 1,
): void {
    const node = new Node('PortraitSilhouette');
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    node.setScale(scale, scale, 1);
    node.addComponent(UITransform).setContentSize(64, 112);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = EXPEDITION_COLORS.silhouette.clone();
    graphics.circle(0, 31, undecided ? 17 : 19);
    graphics.fill();
    graphics.roundRect(-29, -49, 58, 68, 20);
    graphics.fill();
}

export function createItemGlyph(
    parent: Node,
    itemId: ExpeditionItemId,
    x: number,
    y: number,
): void {
    const node = new Node('ItemGlyph');
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(38, 38);
    const graphics = node.addComponent(Graphics);
    graphics.strokeColor = EXPEDITION_COLORS.border.clone();
    graphics.fillColor = new Color(25, 31, 29, 255);
    graphics.lineWidth = 2;
    graphics.circle(0, 0, 17);
    graphics.fill();
    graphics.stroke();
    graphics.strokeColor = EXPEDITION_COLORS.text.clone();
    if (itemId === 'spiritGrain') {
        graphics.moveTo(-7, -10);
        graphics.lineTo(7, 11);
        graphics.moveTo(-1, -2);
        graphics.lineTo(-10, 3);
        graphics.moveTo(3, 4);
        graphics.lineTo(11, 7);
    } else if (itemId === 'pickaxe') {
        graphics.moveTo(-9, 10);
        graphics.lineTo(10, -10);
        graphics.moveTo(-12, 7);
        graphics.lineTo(4, 13);
    } else {
        graphics.circle(0, 2, 9);
        graphics.moveTo(6, -5);
        graphics.lineTo(12, -13);
    }
    graphics.stroke();
}
