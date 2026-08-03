import {
    Button,
    Color,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Node,
    UITransform,
} from 'cc';

export function createMapButton(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize = 14,
): Node {
    const node = createMapPanel(
        parent,
        name,
        x,
        y,
        width,
        height,
        new Color(66, 82, 76, 255),
        new Color(132, 151, 126, 255),
    );
    const button = node.addComponent(Button);
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 0.96;
    createMapLabel(node, 'Label', text, 0, 0, width - 6, height - 6, fontSize);
    return node;
}

export function createMapPanel(
    parent: Node,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: Color,
    stroke?: Color,
): Node {
    const node = createMapNode(parent, name, x, y, width, height);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = fill.clone();
    graphics.roundRect(-width / 2, -height / 2, width, height, 4);
    graphics.fill();
    if (stroke) {
        graphics.strokeColor = stroke.clone();
        graphics.lineWidth = 1;
        graphics.roundRect(-width / 2 + 0.5, -height / 2 + 0.5, width - 1, height - 1, 4);
        graphics.stroke();
    }
    return node;
}

export function createMapLabel(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize: number,
    color = new Color(236, 230, 202),
    horizontalAlign = HorizontalTextAlignment.CENTER,
): Label {
    const node = createMapNode(parent, name, x, y, width, height);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.ceil(fontSize * 1.35);
    label.color = color.clone();
    label.horizontalAlign = horizontalAlign;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    return label;
}

export function createMapNode(
    parent: Node,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    anchorX = 0.5,
    anchorY = 0.5,
): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);
    transform.setAnchorPoint(anchorX, anchorY);
    return node;
}

export function setMapButtonEnabled(node: Node, enabled: boolean): void {
    const button = node.getComponent(Button);
    if (button) button.interactable = enabled;
    node.setScale(enabled ? 1 : 0.96, enabled ? 1 : 0.96, 1);
    const graphics = node.getComponent(Graphics);
    if (graphics) {
        graphics.fillColor = enabled
            ? new Color(66, 82, 76, 255)
            : new Color(46, 51, 50, 255);
    }
}
