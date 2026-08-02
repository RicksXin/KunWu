import {
    Button,
    Color,
    Graphics,
    Label,
    Mask,
    Node,
    UITransform,
} from 'cc';

export const MAP_LOGICAL_WIDTH = 375;
export const MAP_LOGICAL_HEIGHT = 817;

export interface MapSceneNodes {
    readonly designRoot: Node;
    readonly viewport: Node;
    readonly world: Node;
    readonly terrainGraphics: Graphics;
    readonly tiledMapHost: Node;
    readonly fogGraphics: Graphics;
    readonly markerGraphics: Graphics;
    readonly playerMarker: Node;
    readonly playerGraphics: Graphics;
    readonly titleLabel: Label;
    readonly grainLabel: Label;
    readonly positionLabel: Label;
    readonly returnCostLabel: Label;
    readonly hintLabel: Label;
    readonly upButton: Node;
    readonly downButton: Node;
    readonly leftButton: Node;
    readonly rightButton: Node;
    readonly returnButton: Node;
    readonly returnButtonLabel: Label;
    readonly loadingRoot: Node;
    readonly loadingLabel: Label;
    readonly encounterRoot: Node;
    readonly encounterTitle: Label;
    readonly encounterMessage: Label;
    readonly encounterCloseButton: Node;
}

export function buildMapScene(host: Node, worldWidth: number, worldHeight: number): MapSceneNodes {
    const designRoot = createNode(host, 'MapDesignRoot', 0, 0, MAP_LOGICAL_WIDTH, MAP_LOGICAL_HEIGHT);

    const top = createPanel(
        designRoot,
        'TopHud',
        0,
        361.5,
        MAP_LOGICAL_WIDTH,
        94,
        new Color(20, 27, 34, 248),
        new Color(96, 119, 112, 255),
    );
    const titleLabel = createLabel(top, 'Title', '破禁山麓', 0, 24, 351, 26, 19, new Color(232, 224, 190));
    const grainLabel = createLabel(top, 'Grain', '灵粮 --', -123, -8, 105, 22, 14, new Color(219, 203, 132));
    const positionLabel = createLabel(top, 'Position', '坐标 --', 0, -8, 118, 22, 13, new Color(189, 204, 194));
    const returnCostLabel = createLabel(top, 'ReturnCost', '返程 --', 125, -8, 105, 22, 13, new Color(189, 204, 194));

    const viewport = createNode(designRoot, 'WorldViewport', 0, 24, MAP_LOGICAL_WIDTH, 581);
    viewport.addComponent(Mask).type = Mask.Type.RECT;
    const world = createNode(viewport, 'World', 0, 0, worldWidth, worldHeight, 0, 0);
    const terrain = createNode(world, 'FallbackTerrain', 0, 0, worldWidth, worldHeight, 0, 0);
    const terrainGraphics = terrain.addComponent(Graphics);
    const tiledMapHost = createNode(world, 'PunyDungeonMap', 0, 0, worldWidth, worldHeight, 0, 0);
    const fog = createNode(world, 'FogLayer', 0, 0, worldWidth, worldHeight, 0, 0);
    const fogGraphics = fog.addComponent(Graphics);
    const markers = createNode(world, 'MarkerLayer', 0, 0, worldWidth, worldHeight, 0, 0);
    const markerGraphics = markers.addComponent(Graphics);
    const playerMarker = createNode(world, 'PlayerMarker', 0, 0, 32, 32);
    const playerGraphics = playerMarker.addComponent(Graphics);

    const bottom = createPanel(
        designRoot,
        'BottomHud',
        0,
        -337.5,
        MAP_LOGICAL_WIDTH,
        142,
        new Color(20, 27, 34, 250),
        new Color(96, 119, 112, 255),
    );
    const upButton = createButton(bottom, 'MoveUp', '↑', -112, 36, 48, 48);
    const leftButton = createButton(bottom, 'MoveLeft', '←', -163, -13, 48, 48);
    const downButton = createButton(bottom, 'MoveDown', '↓', -112, -13, 48, 48);
    const rightButton = createButton(bottom, 'MoveRight', '→', -61, -13, 48, 48);
    const returnButton = createButton(bottom, 'ReturnCamp', '返营', 107, 17, 118, 48);
    const returnButtonLabel = returnButton.getChildByName('Label')!.getComponent(Label)!;
    const hintLabel = createLabel(
        bottom,
        'Hint',
        '点击相邻格或使用方向键',
        93,
        -32,
        155,
        31,
        11,
        new Color(153, 169, 162),
    );

    const loadingRoot = createPanel(
        designRoot,
        'LoadingOverlay',
        0,
        24,
        MAP_LOGICAL_WIDTH,
        581,
        new Color(8, 12, 16, 242),
    );
    const loadingLabel = createLabel(
        loadingRoot,
        'LoadingLabel',
        '正在踏入破禁山麓……',
        0,
        0,
        320,
        80,
        16,
        new Color(223, 218, 190),
    );

    const encounterRoot = createPanel(
        designRoot,
        'EncounterOverlay',
        0,
        20,
        331,
        222,
        new Color(27, 25, 29, 252),
        new Color(155, 91, 72, 255),
    );
    const encounterTitle = createLabel(
        encounterRoot,
        'EncounterTitle',
        '遭遇：残禁石傀',
        0,
        65,
        295,
        36,
        19,
        new Color(237, 189, 139),
    );
    const encounterMessage = createLabel(
        encounterRoot,
        'EncounterMessage',
        '石傀从残禁中苏醒，挡住了去路。\n战斗表现将在下一阶段接入。',
        0,
        8,
        282,
        82,
        14,
        new Color(211, 208, 191),
    );
    const encounterCloseButton = createButton(encounterRoot, 'Continue', '继续探索', 0, -70, 134, 46);
    encounterRoot.active = false;

    return {
        designRoot,
        viewport,
        world,
        terrainGraphics,
        tiledMapHost,
        fogGraphics,
        markerGraphics,
        playerMarker,
        playerGraphics,
        titleLabel,
        grainLabel,
        positionLabel,
        returnCostLabel,
        hintLabel,
        upButton,
        downButton,
        leftButton,
        rightButton,
        returnButton,
        returnButtonLabel,
        loadingRoot,
        loadingLabel,
        encounterRoot,
        encounterTitle,
        encounterMessage,
        encounterCloseButton,
    };
}

export function setMapButtonEnabled(node: Node, enabled: boolean): void {
    const button = node.getComponent(Button);
    if (button) button.interactable = enabled;
    node.setScale(enabled ? 1 : 0.96, enabled ? 1 : 0.96, 1);
    node.getComponent(Graphics)!.fillColor = enabled
        ? new Color(66, 82, 76, 255)
        : new Color(46, 51, 50, 255);
}

function createButton(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
): Node {
    const node = createPanel(
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
    createLabel(node, 'Label', text, 0, 0, width - 8, height - 6, 16, new Color(236, 230, 202));
    return node;
}

function createPanel(
    parent: Node,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: Color,
    stroke?: Color,
): Node {
    const node = createNode(parent, name, x, y, width, height);
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

function createLabel(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize: number,
    color: Color,
): Label {
    const node = createNode(parent, name, x, y, width, height);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.ceil(fontSize * 1.35);
    label.color = color.clone();
    label.horizontalAlign = Label.HorizontalAlign.CENTER;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    return label;
}

function createNode(
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
