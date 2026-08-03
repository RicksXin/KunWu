import {
    Button,
    Color,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Node,
    UIOpacity,
    UITransform,
} from 'cc';

export function combatNode(
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

export function combatPanel(
    parent: Node,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: Color,
    stroke?: Color,
    radius = 3,
): Node {
    const node = combatNode(parent, name, x, y, width, height);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = fill.clone();
    graphics.roundRect(-width / 2, -height / 2, width, height, radius);
    graphics.fill();
    if (stroke) {
        graphics.strokeColor = stroke.clone();
        graphics.lineWidth = 1;
        graphics.roundRect(-width / 2 + 0.5, -height / 2 + 0.5, width - 1, height - 1, radius);
        graphics.stroke();
    }
    return node;
}

export function combatLabel(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize: number,
    color = new Color(235, 230, 207),
    align = HorizontalTextAlignment.CENTER,
): Label {
    const node = combatNode(parent, name, x, y, width, height);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.ceil(fontSize * 1.25);
    label.color = color.clone();
    label.horizontalAlign = align;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    return label;
}

export function combatButton(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize = 13,
): { readonly node: Node; readonly label: Label } {
    const node = combatPanel(
        parent,
        name,
        x,
        y,
        width,
        height,
        new Color(56, 71, 67, 250),
        new Color(143, 126, 78, 255),
    );
    const button = node.addComponent(Button);
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 0.96;
    const label = combatLabel(node, 'Label', text, 0, 1, width - 8, height - 8, fontSize);
    return { node, label };
}

export function setCombatButtonEnabled(node: Node, enabled: boolean): void {
    const button = node.getComponent(Button);
    if (button) button.interactable = enabled;
    node.setScale(enabled ? 1 : 0.97, enabled ? 1 : 0.97, 1);
    const opacity = node.getComponent(UIOpacity) ?? node.addComponent(UIOpacity);
    opacity.opacity = enabled ? 255 : 135;
}
