import {
    BlockInputEvents,
    Color,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Mask,
    Node,
} from 'cc';
import { MainTaskSummary } from 'db://assets/scripts/presentation/core/MainTaskSummary';
import {
    createMapButton,
    createMapLabel,
    createMapNode,
    createMapPanel,
    setMapButtonEnabled,
} from 'db://assets/scripts/presentation/map/MapUiFactory';

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
    readonly titlePositionLabel: Label;
    readonly burdenLabel: Label;
    readonly grainLabel: Label;
    readonly mainTaskSummary: MainTaskSummary;
    readonly restButton: Node;
    readonly returnButton: Node;
    readonly returnButtonLabel: Label;
    readonly partyButton: Node;
    readonly backpackButton: Node;
    readonly settingsButton: Node;
    readonly upButton: Node;
    readonly downButton: Node;
    readonly leftButton: Node;
    readonly rightButton: Node;
    readonly hintLabel: Label;
    readonly grainWarningRoot: Node;
    readonly grainWarningLabel: Label;
    readonly restRoot: Node;
    readonly restChanceLabel: Label;
    readonly restFoodLabel: Label;
    readonly restHealLabel: Label;
    readonly replenishButton: Node;
    readonly healButton: Node;
    readonly continueButton: Node;
    readonly backpackRoot: Node;
    readonly backpackGridRoot: Node;
    readonly backpackEmptyLabel: Label;
    readonly backpackCloseButton: Node;
    readonly entryReturnRoot: Node;
    readonly entryReturnConfirmButton: Node;
    readonly entryReturnCancelButton: Node;
    readonly loadingRoot: Node;
    readonly loadingLabel: Label;
    readonly eventRoot: Node;
    readonly eventKindLabel: Label;
    readonly eventTitle: Label;
    readonly eventMessage: Label;
    readonly eventEngageButton: Node;
    readonly eventInspectButton: Node;
    readonly eventTalkButton: Node;
    readonly eventOperateButton: Node;
    readonly eventSmallTalkButton: Node;
    readonly eventLeaveButton: Node;
}

export function buildMapScene(host: Node, worldWidth: number, worldHeight: number): MapSceneNodes {
    const root = createMapNode(host, 'MapDesignRoot', 0, 0, MAP_LOGICAL_WIDTH, MAP_LOGICAL_HEIGHT);
    const top = createMapPanel(root, 'TopHud', 0, 330.5, 375, 156, hudFill(), hudBorder());
    const info = createMapPanel(top, 'MapInfo', -101, 24, 157, 102, panelFill(), hudBorder());
    const titlePositionLabel = createMapLabel(info, 'MapAndPosition', '破禁山麓（--,--）', 0, 27, 141, 28, 15);
    const burdenLabel = createMapLabel(info, 'Burden', '负重 --/--', 0, 0, 141, 24, 13);
    const grainLabel = createMapLabel(info, 'Grain', '灵粮：---', 0, -27, 141, 24, 13, new Color(219, 203, 132));

    const actions = createMapPanel(top, 'Actions', 83, 24, 192, 102, panelFill(), hudBorder());
    const restButton = createMapButton(actions, 'Rest', '休整', -60, 25, 54, 48, 12);
    const returnButton = createMapButton(actions, 'Return', '归营', 0, 25, 54, 48, 12);
    const partyButton = createMapButton(actions, 'Party', '队伍', 60, 25, 54, 48, 12);
    const backpackButton = createMapButton(actions, 'Backpack', '背包', -30, -25, 54, 48, 12);
    const settingsButton = createMapButton(actions, 'Settings', '设置', 30, -25, 54, 48, 12);
    const returnButtonLabel = returnButton.getChildByName('Label')!.getComponent(Label)!;

    const task = createMapPanel(top, 'MainTask', 0, -55, 355, 40, panelFill(), hudBorder());
    const taskLabel = createMapLabel(task, 'Objective', '主线：--', 0, 0, 335, 30, 13);
    const mainTaskSummary = task.addComponent(MainTaskSummary);
    mainTaskSummary.bind(taskLabel);

    const viewport = createMapNode(root, 'WorldViewport', 0, -7, MAP_LOGICAL_WIDTH, 519);
    viewport.addComponent(Mask).type = Mask.Type.RECT;
    const world = createMapNode(viewport, 'World', 0, 0, worldWidth, worldHeight, 0, 0);
    const terrain = createMapNode(world, 'FallbackTerrain', 0, 0, worldWidth, worldHeight, 0, 0);
    const terrainGraphics = terrain.addComponent(Graphics);
    const tiledMapHost = createMapNode(world, 'PunyDungeonMap', 0, 0, worldWidth, worldHeight, 0, 0);
    const fog = createMapNode(world, 'FogLayer', 0, 0, worldWidth, worldHeight, 0, 0);
    const fogGraphics = fog.addComponent(Graphics);
    const markers = createMapNode(world, 'MarkerLayer', 0, 0, worldWidth, worldHeight, 0, 0);
    const markerGraphics = markers.addComponent(Graphics);
    const playerMarker = createMapNode(world, 'PlayerMarker', 0, 0, 32, 32);
    const playerGraphics = playerMarker.addComponent(Graphics);

    const bottom = createMapPanel(root, 'BottomHud', 0, -337.5, 375, 142, hudFill(), hudBorder());
    const upButton = createMapButton(bottom, 'MoveUp', '↑', -112, 36, 48, 48, 16);
    const leftButton = createMapButton(bottom, 'MoveLeft', '←', -163, -13, 48, 48, 16);
    const downButton = createMapButton(bottom, 'MoveDown', '↓', -112, -13, 48, 48, 16);
    const rightButton = createMapButton(bottom, 'MoveRight', '→', -61, -13, 48, 48, 16);
    const hintLabel = createMapLabel(
        bottom, 'Hint', '点击相邻格或使用方向键', 92, 0, 174, 55, 13, new Color(153, 169, 162),
    );
    const grainWarningRoot = createMapPanel(
        root, 'GrainDepletionWarning', 0, 226, 345, 40,
        new Color(91, 39, 31, 245), new Color(207, 118, 74, 255),
    );
    const grainWarningLabel = createMapLabel(
        grainWarningRoot, 'Warning', '警告：灵粮已尽', 0, 0, 325, 30, 13, new Color(255, 220, 164),
    );
    grainWarningRoot.active = false;

    const restNodes = buildRestOverlay(root);
    const backpackNodes = buildBackpackOverlay(root);
    const entryReturnNodes = buildEntryReturnOverlay(root);
    const loadingNodes = buildLoadingOverlay(root);
    const eventNodes = buildEventOverlay(root);

    return {
        designRoot: root, viewport, world, terrainGraphics, tiledMapHost, fogGraphics, markerGraphics,
        playerMarker, playerGraphics, titlePositionLabel, burdenLabel, grainLabel, mainTaskSummary,
        restButton, returnButton, returnButtonLabel, partyButton, backpackButton, settingsButton,
        upButton, downButton, leftButton, rightButton, hintLabel,
        grainWarningRoot, grainWarningLabel,
        ...restNodes, ...backpackNodes, ...entryReturnNodes, ...loadingNodes, ...eventNodes,
    };
}

function buildRestOverlay(root: Node) {
    const restRoot = createMapPanel(root, 'RestOverlay', 0, 0, 375, 817, new Color(5, 8, 11, 180));
    restRoot.addComponent(BlockInputEvents);
    const card = createMapPanel(restRoot, 'RestPanel', 0, 0, 337, 270, overlayFill(), hudBorder());
    createMapLabel(card, 'Title', '野外休整', 0, 98, 300, 34, 20, new Color(232, 224, 190));
    const restChanceLabel = createMapLabel(card, 'Chance', '剩余休整次数：--', 0, 58, 295, 25, 14);
    const restFoodLabel = createMapLabel(card, 'Food', '野外食材：--', 0, 20, 295, 42, 13);
    const restHealLabel = createMapLabel(card, 'Healing', '运功疗伤：--', 0, -19, 295, 30, 13);
    const replenishButton = createMapButton(card, 'Replenish', '补充灵粮', -108, -91, 100, 48, 13);
    const healButton = createMapButton(card, 'Heal', '运功疗伤', 0, -91, 100, 48, 13);
    const continueButton = createMapButton(card, 'Continue', '结束休整', 108, -91, 100, 48, 13);
    restRoot.active = false;
    return { restRoot, restChanceLabel, restFoodLabel, restHealLabel, replenishButton, healButton, continueButton };
}

function buildBackpackOverlay(root: Node) {
    const backpackRoot = createMapPanel(root, 'BackpackOverlay', 0, 0, 375, 817, new Color(5, 8, 11, 180));
    backpackRoot.addComponent(BlockInputEvents);
    const card = createMapPanel(backpackRoot, 'BackpackPanel', 0, 0, 331, 340, overlayFill(), hudBorder());
    createMapLabel(card, 'Title', '本次入山所得', 0, 137, 295, 36, 20, new Color(232, 224, 190));
    const backpackGridRoot = createMapNode(card, 'ItemGrid', 0, 18, 285, 190);
    const backpackEmptyLabel = createMapLabel(
        card, 'Empty', '尚未获得临时战利品', 0, 18, 285, 190, 14,
    );
    const backpackCloseButton = createMapButton(card, 'Close', '关闭', 0, -137, 126, 48);
    backpackRoot.active = false;
    return { backpackRoot, backpackGridRoot, backpackEmptyLabel, backpackCloseButton };
}

function buildEntryReturnOverlay(root: Node) {
    const entryReturnRoot = createMapPanel(root, 'EntryReturnOverlay', 0, 0, 375, 817, new Color(5, 8, 11, 180));
    entryReturnRoot.addComponent(BlockInputEvents);
    const card = createMapPanel(entryReturnRoot, 'EntryReturnPanel', 0, 0, 319, 190, overlayFill(), hudBorder());
    createMapLabel(card, 'Title', '返回入口传送阵', 0, 55, 280, 34, 19, new Color(232, 224, 190));
    createMapLabel(card, 'Message', '是否结束本次入山并返回营地？', 0, 12, 278, 42, 14);
    const entryReturnConfirmButton = createMapButton(card, 'Confirm', '确认归营', -75, -55, 132, 48, 14);
    const entryReturnCancelButton = createMapButton(card, 'Cancel', '取消', 75, -55, 132, 48, 14);
    entryReturnRoot.active = false;
    return { entryReturnRoot, entryReturnConfirmButton, entryReturnCancelButton };
}

function buildLoadingOverlay(root: Node) {
    const loadingRoot = createMapPanel(root, 'LoadingOverlay', 0, 0, 375, 817, new Color(8, 12, 16, 242));
    loadingRoot.addComponent(BlockInputEvents);
    const loadingLabel = createMapLabel(loadingRoot, 'LoadingLabel', '正在踏入破禁山麓……', 0, 0, 320, 80, 16);
    return { loadingRoot, loadingLabel };
}

function buildEventOverlay(root: Node) {
    const eventRoot = createMapPanel(root, 'MapEventOverlay', 0, 0, 375, 817, new Color(5, 8, 11, 180));
    eventRoot.addComponent(BlockInputEvents);
    const card = createMapPanel(eventRoot, 'MapEventPanel', 0, 0, 343, 414, overlayFill(), new Color(155, 91, 72));
    const eventKindLabel = createMapLabel(
        card, 'EventKind', '奇遇', 0, 169, 303, 22, 12, new Color(174, 192, 177),
    );
    const eventTitle = createMapLabel(
        card, 'EventTitle', '事件标题', 0, 142, 303, 34, 20, new Color(232, 224, 190),
    );
    const info = createMapPanel(card, 'EventInfo', 0, 44, 309, 150, new Color(20, 22, 26, 245), hudBorder());
    const eventMessage = createMapLabel(
        info, 'EventDescription', '事件信息', 0, 0, 279, 126, 14,
        new Color(224, 218, 194), HorizontalTextAlignment.LEFT,
    );
    createMapLabel(card, 'ActionTitle', '可用行动', 0, -50, 303, 24, 13, new Color(174, 192, 177));
    const eventEngageButton = createMapButton(card, 'Engage', '迎战', -103, -96, 92, 46, 14);
    const eventInspectButton = createMapButton(card, 'Inspect', '探灵', 0, -96, 92, 46, 14);
    const eventTalkButton = createMapButton(card, 'Talk', '交谈', 103, -96, 92, 46, 14);
    const eventOperateButton = createMapButton(card, 'Operate', '处理', -103, -151, 92, 46, 14);
    const eventSmallTalkButton = createMapButton(card, 'SmallTalk', '闲谈', 0, -151, 92, 46, 14);
    const eventLeaveButton = createMapButton(card, 'Leave', '离开', 103, -151, 92, 46, 14);
    eventRoot.active = false;
    return {
        eventRoot, eventKindLabel, eventTitle, eventMessage, eventEngageButton,
        eventInspectButton, eventTalkButton, eventOperateButton, eventSmallTalkButton,
        eventLeaveButton,
    };
}

function hudFill(): Color { return new Color(20, 27, 34, 248); }
function panelFill(): Color { return new Color(28, 36, 42, 250); }
function overlayFill(): Color { return new Color(27, 25, 29, 252); }
function hudBorder(): Color { return new Color(96, 119, 112, 255); }

export { setMapButtonEnabled };
