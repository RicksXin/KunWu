import { Color, Graphics, Node, Sprite, UITransform } from 'cc';

export type CampResizableButtonKind = 'inline' | 'footer';
export type CampResizableButtonState = 'default' | 'selected' | 'disabled';

interface ButtonPalette {
    readonly base: Color;
    readonly outer: Color;
    readonly inner: Color;
    readonly depth: Color;
    readonly highlight: Color;
}

const PALETTES: Readonly<Record<CampResizableButtonKind, Readonly<Record<CampResizableButtonState, ButtonPalette>>>> = {
    inline: {
        default: palette(32, 42, 39, 111, 143, 133, 63, 95, 89, 4, 9, 8, 117, 184, 163),
        selected: palette(44, 38, 28, 181, 138, 66, 128, 98, 58, 18, 12, 8, 219, 168, 82),
        disabled: palette(17, 25, 23, 94, 106, 102, 67, 73, 69, 4, 6, 6, 122, 133, 125),
    },
    footer: {
        default: palette(36, 29, 24, 181, 138, 66, 128, 98, 58, 5, 5, 5, 219, 168, 82),
        selected: palette(50, 37, 24, 205, 158, 74, 181, 138, 66, 7, 5, 4, 238, 190, 100),
        disabled: palette(24, 24, 22, 94, 106, 102, 74, 75, 70, 5, 5, 5, 122, 133, 125),
    },
};

/** Figma Approved V1.0 可拉伸按钮：视觉层与至少 48px 触控层分离。 */
export function applyCampResizableButtonStyle(
    node: Node,
    kind: CampResizableButtonKind,
    state: CampResizableButtonState,
): Node {
    const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
    let visual = node.getChildByName('NativeVisual');
    const previousVisualSize = visual?.getComponent(UITransform)?.contentSize;
    const visualWidth = previousVisualSize?.width ?? transform.contentSize.width;
    const visualHeight = previousVisualSize?.height ?? transform.contentSize.height;
    transform.setContentSize(
        Math.max(48, transform.contentSize.width, visualWidth),
        Math.max(48, transform.contentSize.height, visualHeight),
    );
    const rootSprite = node.getComponent(Sprite);
    if (rootSprite) rootSprite.enabled = false;
    const rootGraphics = node.getComponent(Graphics);
    if (rootGraphics) rootGraphics.enabled = false;

    if (!visual) {
        visual = new Node('NativeVisual');
        visual.layer = node.layer;
        node.addChild(visual);
    }
    visual.setPosition(0, 0, 0);
    visual.setScale(1, 1, 1);
    visual.setSiblingIndex(0);
    const visualTransform = visual.getComponent(UITransform) ?? visual.addComponent(UITransform);
    visualTransform.setContentSize(visualWidth, visualHeight);
    visualTransform.setAnchorPoint(0.5, 0.5);
    drawButton(
        visual.getComponent(Graphics) ?? visual.addComponent(Graphics),
        visualWidth,
        visualHeight,
        kind,
        state,
    );
    node.getChildByName('Label')?.setSiblingIndex(node.children.length - 1);
    return visual;
}

function drawButton(
    graphics: Graphics,
    width: number,
    height: number,
    kind: CampResizableButtonKind,
    state: CampResizableButtonState,
): void {
    const colors = PALETTES[kind][state];
    const radius = kind === 'footer' ? 4 : 3;
    graphics.clear();
    graphics.fillColor = colors.base.clone();
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.fill();
    graphics.fillColor = colors.depth.clone();
    graphics.roundRect(-width / 2 + 2, -height / 2 + 2, width - 4, Math.max(1, height / 2), radius - 1);
    graphics.fill();
    graphics.strokeColor = colors.outer.clone();
    graphics.lineWidth = 1;
    graphics.roundRect(-width / 2 + 0.5, -height / 2 + 0.5, width - 1, height - 1, radius);
    graphics.stroke();
    graphics.strokeColor = colors.inner.clone();
    graphics.roundRect(-width / 2 + 2.5, -height / 2 + 2.5, width - 5, height - 5, radius - 1);
    graphics.stroke();
    graphics.strokeColor = colors.highlight.clone();
    graphics.moveTo(-width / 2 + 6, height / 2 - 4);
    graphics.lineTo(width / 2 - 6, height / 2 - 4);
    graphics.stroke();
}

function palette(
    br: number, bg: number, bb: number,
    or: number, og: number, ob: number,
    ir: number, ig: number, ib: number,
    dr: number, dg: number, db: number,
    hr: number, hg: number, hb: number,
): ButtonPalette {
    return {
        base: new Color(br, bg, bb, 255),
        outer: new Color(or, og, ob, 255),
        inner: new Color(ir, ig, ib, 255),
        depth: new Color(dr, dg, db, 78),
        highlight: new Color(hr, hg, hb, 92),
    };
}
