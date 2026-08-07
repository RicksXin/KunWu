import {
    BlockInputEvents,
    Color,
    Graphics,
    HorizontalTextAlignment,
    Node,
    ScrollView,
    UITransform,
} from 'cc';
import { CAMP_EXPEDITION_PATHS } from 'db://assets/scripts/domain/CampSceneContract';
import type { ExpeditionMapOption } from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { Profile } from 'db://assets/scripts/services/GameState';
import { campLabel, campNode } from 'db://assets/scripts/presentation/camp/shared/CampViewUtils';
import {
    EXPEDITION_COLORS,
    expeditionText,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionTheme';
import type { ExpeditionVisualAssets } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionViewTypes';
import {
    configureExistingButton,
    configureExistingLabel,
    createButton,
    createLabel,
    prepareExistingScrollViewport,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionUiFactory';
import {
    applyFixedPanelBackground,
    createSpriteNode,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionVisualNodes';

const PANEL_WIDTH = 343;
const PANEL_HEIGHT = 622;
const LIST_WIDTH = 272;
const LIST_HEIGHT = 374;
const ROW_HEIGHT = 70;
const ROW_GAP = 6;

export interface ExpeditionMapSelectionActions {
    readonly selectMap: (map: ExpeditionMapOption) => void;
    readonly close: () => void;
}

export function renderExpeditionMapSelection(
    root: Node,
    profile: Profile,
    maps: readonly ExpeditionMapOption[],
    assets: ExpeditionVisualAssets,
    actions: ExpeditionMapSelectionActions,
): void {
    const layer = campNode(root, CAMP_EXPEDITION_PATHS.mapSelection);
    const panel = campNode(root, CAMP_EXPEDITION_PATHS.mapSelectionPanel);
    const title = campLabel(root, CAMP_EXPEDITION_PATHS.mapSelectionTitle);
    const hint = campLabel(root, CAMP_EXPEDITION_PATHS.mapSelectionHint);
    const list = campNode(root, CAMP_EXPEDITION_PATHS.mapList);
    const close = campNode(root, CAMP_EXPEDITION_PATHS.mapSelectionClose);
    if (!layer || !panel || !title || !hint || !list || !close) return;

    layer.active = true;
    drawMapSelectionBackdrop(layer, root);
    panel.setPosition(0, 11.5, 0);
    applyFixedPanelBackground(panel, assets.mapSelectionPanelFrame, PANEL_WIDTH, PANEL_HEIGHT);
    title.node.active = false;
    hint.node.active = true;
    hint.node.setPosition(0.5, 264.5, 0);
    hint.node.getComponent(UITransform)?.setContentSize(160, 16);
    configureExistingLabel(
        hint,
        '选择本次入山的地图',
        12,
        EXPEDITION_COLORS.text,
        HorizontalTextAlignment.CENTER,
        { lineHeight: 16 },
    );

    list.setPosition(0, 57.5, 0);
    list.getComponent(UITransform)?.setContentSize(LIST_WIDTH, LIST_HEIGHT);
    const viewport = prepareExistingScrollViewport(list);
    const contentHeight = Math.max(
        LIST_HEIGHT,
        maps.length * (ROW_HEIGHT + ROW_GAP) - ROW_GAP,
    );
    viewport.getComponent(UITransform)?.setContentSize(LIST_WIDTH, contentHeight);
    const scrollView = list.getComponent(ScrollView);
    if (scrollView) {
        scrollView.vertical = contentHeight > LIST_HEIGHT;
        scrollView.elastic = false;
    }
    maps.forEach((map, index) => renderMapRow(
        viewport,
        map,
        index,
        profile,
        assets,
        actions.selectMap,
    ));

    close.setPosition(-5.5, -329.5, 0);
    close.getComponent(UITransform)?.setContentSize(132, 44);
    configureExistingButton(close, { text: '返回', onClick: actions.close });
}

function renderMapRow(
    parent: Node,
    map: ExpeditionMapOption,
    index: number,
    profile: Profile,
    assets: ExpeditionVisualAssets,
    selectMap: (map: ExpeditionMapOption) => void,
): void {
    const unlocked = map.unlockFlag === null || profile.storyFlags[map.unlockFlag] === true;
    const button = createButton(parent, {
        name: `Map_${map.mapId}`,
        text: `${map.mapNumber}. ${expeditionText(map.nameKey)}`,
        x: 0,
        y: -ROW_HEIGHT / 2 - index * (ROW_HEIGHT + ROW_GAP),
        width: LIST_WIDTH,
        height: ROW_HEIGHT,
        enabled: unlocked,
        onClick: () => selectMap(map),
    });
    drawMapRowBackground(button.node);
    button.label.node.setPosition(0, 11, 0);
    button.label.node.getComponent(UITransform)?.setContentSize(244, 20);
    configureExistingLabel(
        button.label,
        `${map.mapNumber}. ${expeditionText(map.nameKey)}`,
        16,
        EXPEDITION_COLORS.text,
        HorizontalTextAlignment.CENTER,
        { lineHeight: 20 },
    );
    createLabel(
        button.node,
        'MapRule',
        unlocked
            ? `灵息 ${map.staminaCost} · 每步灵粮 ${map.grainPerStep}`
            : '尚未解锁',
        0,
        -13,
        230,
        16,
        12,
        EXPEDITION_COLORS.textSecondary,
        HorizontalTextAlignment.CENTER,
        { lineHeight: 16 },
    );
    if (!unlocked && assets.lockFrame) {
        createSpriteNode(button.node, 'LockIcon', assets.lockFrame, 125.5, 13, 14, 14);
    }
}

function drawMapSelectionBackdrop(layer: Node, root: Node): void {
    const rootSize = root.getComponent(UITransform)?.contentSize;
    const width = rootSize?.width ?? 375;
    const height = rootSize?.height ?? 817;
    layer.getComponent(UITransform)?.setContentSize(width, height);
    layer.getComponent(BlockInputEvents) ?? layer.addComponent(BlockInputEvents);
    const graphics = layer.getComponent(Graphics) ?? layer.addComponent(Graphics);
    graphics.clear();
    graphics.fillColor = new Color(0, 0, 0, 242);
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
}

function drawMapRowBackground(node: Node): void {
    const graphics = node.getComponent(Graphics);
    if (!graphics) return;
    graphics.clear();
    graphics.fillColor = EXPEDITION_COLORS.mapRowStart.clone();
    graphics.roundRect(-LIST_WIDTH / 2, -ROW_HEIGHT / 2, LIST_WIDTH, ROW_HEIGHT, 3);
    graphics.fill();
    const strips = 24;
    const stripWidth = (LIST_WIDTH - 2) / strips;
    for (let index = 0; index < strips; index += 1) {
        const ratio = index / Math.max(1, strips - 1);
        graphics.fillColor = blendColor(
            EXPEDITION_COLORS.mapRowStart,
            EXPEDITION_COLORS.mapRowEnd,
            ratio,
        );
        graphics.rect(
            -LIST_WIDTH / 2 + 1 + index * stripWidth,
            -ROW_HEIGHT / 2 + 1,
            stripWidth + 0.5,
            ROW_HEIGHT - 2,
        );
        graphics.fill();
    }
    graphics.strokeColor = EXPEDITION_COLORS.mapRowBorder.clone();
    graphics.lineWidth = 1;
    graphics.roundRect(
        -LIST_WIDTH / 2 + 0.5,
        -ROW_HEIGHT / 2 + 0.5,
        LIST_WIDTH - 1,
        ROW_HEIGHT - 1,
        3,
    );
    graphics.stroke();
}

function blendColor(from: Color, to: Color, ratio: number): Color {
    return new Color(
        Math.round(from.r + (to.r - from.r) * ratio),
        Math.round(from.g + (to.g - from.g) * ratio),
        Math.round(from.b + (to.b - from.b) * ratio),
        Math.round(from.a + (to.a - from.a) * ratio),
    );
}
