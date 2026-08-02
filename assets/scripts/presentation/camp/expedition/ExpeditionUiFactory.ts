import {
    Button,
    Color,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Mask,
    Node,
    ScrollView,
    Sprite,
    UITransform,
} from 'cc';
import {
    COMMON_ART_BUTTON_NAMES,
    EXPEDITION_COLORS,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionTheme';

export interface CreatedButton {
    readonly node: Node;
    readonly button: Button;
    readonly label: Label;
}

export interface ButtonOptions {
    readonly name: string;
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly enabled?: boolean;
    readonly primary?: boolean;
    readonly onClick: () => void;
}

export function createRect(
    parent: Node,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: Color,
    stroke?: Color,
): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);
    transform.setAnchorPoint(0.5, 0.5);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = fill.clone();
    graphics.roundRect(-width / 2, -height / 2, width, height, 5);
    graphics.fill();
    if (stroke) {
        graphics.strokeColor = stroke.clone();
        graphics.lineWidth = 1;
        graphics.roundRect(-width / 2 + 0.5, -height / 2 + 0.5, width - 1, height - 1, 5);
        graphics.stroke();
    }
    return node;
}

export function createLabel(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize: number,
    color: Color,
    horizontalAlign: HorizontalTextAlignment = HorizontalTextAlignment.CENTER,
): Label {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);
    transform.setAnchorPoint(0.5, 0.5);
    const label = node.addComponent(Label);
    configureExistingLabel(label, text, fontSize, color, horizontalAlign);
    return label;
}

export function createButton(parent: Node, options: ButtonOptions): CreatedButton {
    const enabled = options.enabled ?? true;
    const node = createRect(
        parent,
        options.name,
        options.x,
        options.y,
        options.width,
        options.height,
        enabled
            ? options.primary
                ? EXPEDITION_COLORS.buttonPrimary
                : EXPEDITION_COLORS.button
            : EXPEDITION_COLORS.disabled,
        enabled ? EXPEDITION_COLORS.border : EXPEDITION_COLORS.borderSoft,
    );
    const button = node.addComponent(Button);
    button.interactable = enabled;
    button.transition = Button.Transition.NONE;
    const label = createLabel(
        node,
        'Label',
        options.text,
        0,
        0,
        options.width - 8,
        options.height - 6,
        14,
        enabled ? EXPEDITION_COLORS.text : EXPEDITION_COLORS.textSecondary,
    );
    if (enabled) {
        node.on(Button.EventType.CLICK, options.onClick);
    }
    return { node, button, label };
}

export function configureExistingButton(
    node: Node,
    options: Omit<ButtonOptions, 'name' | 'x' | 'y' | 'width' | 'height'>,
): CreatedButton {
    const enabled = options.enabled ?? true;
    const button = node.getComponent(Button) ?? node.addComponent(Button);
    button.transition = Button.Transition.NONE;
    const sprite = node.getComponent(Sprite);
    if (sprite) {
        const usesCommonArt = COMMON_ART_BUTTON_NAMES.has(node.name);
        sprite.color = (usesCommonArt
            ? enabled
                ? options.primary
                    ? EXPEDITION_COLORS.buttonArtPrimary
                    : EXPEDITION_COLORS.buttonArt
                : EXPEDITION_COLORS.buttonArtDisabled
            : enabled
                ? options.primary
                    ? EXPEDITION_COLORS.buttonPrimary
                    : EXPEDITION_COLORS.button
                : EXPEDITION_COLORS.disabled
        ).clone();
    }
    button.interactable = enabled;
    node.off(Button.EventType.CLICK);
    if (enabled) {
        node.on(Button.EventType.CLICK, options.onClick);
    }

    let labelNode = node.getChildByName('Label');
    if (!labelNode) {
        const size = node.getComponent(UITransform)?.contentSize;
        labelNode = createLabel(
            node,
            'Label',
            options.text,
            0,
            0,
            Math.max(1, (size?.width ?? 100) - 8),
            Math.max(1, (size?.height ?? 40) - 6),
            14,
            enabled ? EXPEDITION_COLORS.text : EXPEDITION_COLORS.textSecondary,
        ).node;
    }
    const label = labelNode.getComponent(Label) ?? labelNode.addComponent(Label);
    configureExistingLabel(
        label,
        options.text,
        14,
        enabled ? EXPEDITION_COLORS.text : EXPEDITION_COLORS.textSecondary,
    );
    return { node, button, label };
}

export function configureExistingLabel(
    label: Label,
    text: string,
    fontSize: number,
    color: Color,
    horizontalAlign: HorizontalTextAlignment = HorizontalTextAlignment.CENTER,
): void {
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.ceil(fontSize * 1.25);
    label.color = color.clone();
    label.horizontalAlign = horizontalAlign;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
}

export function styleExistingRect(node: Node, color: Color): void {
    const sprite = node.getComponent(Sprite);
    if (sprite) {
        sprite.color = color.clone();
    }
}

export function prepareExistingScrollViewport(viewport: Node): Node {
    clearChildren(viewport);
    const size = viewport.getComponent(UITransform)?.contentSize;
    const width = size?.width ?? 331;
    const height = size?.height ?? 620;
    const mask = viewport.getComponent(Mask) ?? viewport.addComponent(Mask);
    mask.type = Mask.Type.RECT;

    const content = new Node('Content');
    content.layer = viewport.layer;
    viewport.addChild(content);
    const contentTransform = content.addComponent(UITransform);
    contentTransform.setContentSize(width, height);
    contentTransform.setAnchorPoint(0.5, 1);
    content.setPosition(0, height / 2, 0);

    const scrollView = viewport.getComponent(ScrollView) ?? viewport.addComponent(ScrollView);
    scrollView.content = content;
    scrollView.horizontal = false;
    scrollView.vertical = true;
    scrollView.inertia = true;
    scrollView.elastic = true;
    return content;
}

export function clearChildren(node: Node): void {
    for (const child of [...node.children]) {
        child.destroy();
    }
}
