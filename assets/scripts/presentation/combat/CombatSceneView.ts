import { BlockInputEvents, Color, Graphics, Label, Node } from 'cc';
import { buildCombatLootOverlay } from './CombatLootView';
import type { CombatLootSceneNodes } from './CombatLootView';
import { combatButton, combatLabel, combatNode, combatPanel } from './CombatUiPrimitives';

export const COMBAT_LOGICAL_WIDTH = 375;
export const COMBAT_LOGICAL_HEIGHT = 817;

export interface CombatSceneNodes extends CombatLootSceneNodes {
    readonly designRoot: Node;
    readonly enemyLayer: Node;
    readonly allyLayer: Node;
    readonly titleLabel: Label;
    readonly tickLabel: Label;
    readonly skillBanner: Label;
    readonly escapeButton: Node;
    readonly skillRoot: Node;
    readonly skillButtons: readonly Node[];
    readonly skillLabels: readonly Label[];
    readonly resultRoot: Node;
    readonly resultTitle: Label;
    readonly resultMessage: Label;
    readonly resultButton: Node;
    readonly resultButtonLabel: Label;
    readonly loadingRoot: Node;
    readonly loadingLabel: Label;
}

export function buildCombatScene(host: Node): CombatSceneNodes {
    const root = combatNode(host, 'CombatDesignRoot', 0, 0, COMBAT_LOGICAL_WIDTH, COMBAT_LOGICAL_HEIGHT);
    drawBackground(root);
    const titleLabel = combatLabel(
        root, 'Title', '破禁山麓 · 遭遇战', 0, 374, 230, 24, 13, new Color(198, 205, 185),
    );
    const tickLabel = combatLabel(
        root, 'Tick', '战斗 0.0 秒', -137, 345, 90, 20, 10, new Color(132, 157, 156),
    );
    const escape = combatButton(root, 'EscapeButton', '逃生', 138, 364, 86, 44, 13);
    escape.node.active = false;
    const skillBanner = combatLabel(
        root, 'SkillBanner', '', 0, 32, 250, 28, 15, new Color(239, 216, 147),
    );
    const enemyLayer = combatNode(root, 'EnemyLayer', 0, 0, 375, 817);
    const allyLayer = combatNode(root, 'AllyLayer', 0, 0, 375, 817);
    const skills = buildSkillPanel(root);
    const result = buildResultOverlay(root);
    const loot = buildCombatLootOverlay(root);
    const loading = buildLoadingOverlay(root);
    return {
        designRoot: root,
        enemyLayer,
        allyLayer,
        titleLabel,
        tickLabel,
        skillBanner,
        escapeButton: escape.node,
        ...skills,
        ...result,
        ...loot,
        ...loading,
    };
}

function drawBackground(root: Node): void {
    const background = combatNode(root, 'GrayboxBackground', 0, 0, 375, 817);
    const graphics = background.addComponent(Graphics);
    graphics.fillColor = new Color(10, 23, 29, 255);
    graphics.rect(-187.5, -408.5, 375, 817);
    graphics.fill();
    graphics.fillColor = new Color(19, 39, 44, 255);
    graphics.moveTo(-188, 70);
    graphics.lineTo(-120, 180);
    graphics.lineTo(-48, 94);
    graphics.lineTo(25, 220);
    graphics.lineTo(95, 116);
    graphics.lineTo(188, 198);
    graphics.lineTo(188, -409);
    graphics.lineTo(-188, -409);
    graphics.close();
    graphics.fill();
    graphics.fillColor = new Color(29, 47, 47, 255);
    graphics.moveTo(-188, -88);
    graphics.bezierCurveTo(-80, -30, 74, -145, 188, -72);
    graphics.lineTo(188, -409);
    graphics.lineTo(-188, -409);
    graphics.close();
    graphics.fill();
    graphics.strokeColor = new Color(115, 80, 56, 105);
    graphics.lineWidth = 2;
    for (let index = 0; index < 7; index += 1) {
        const y = -130 - index * 38;
        graphics.moveTo(-188, y);
        graphics.lineTo(188, y - 20);
        graphics.stroke();
    }
    combatPanel(root, 'BottomSafeArea', 0, -381.5, 375, 54, new Color(5, 9, 12, 235));
}

function buildSkillPanel(root: Node) {
    const skillRoot = combatPanel(
        root, 'SkillPanel', 0, -55, 267, 78,
        new Color(10, 15, 18, 235), new Color(101, 119, 98, 255), 5,
    );
    combatLabel(skillRoot, 'Hint', '行动就绪 · 请选择技能', 0, 26, 240, 18, 10, new Color(171, 184, 166));
    const entries = [-82, 0, 82].map((x, index) =>
        combatButton(skillRoot, `Skill_${index}`, '技能', x, -10, 74, 42, 12));
    skillRoot.active = false;
    return {
        skillRoot,
        skillButtons: entries.map((entry) => entry.node),
        skillLabels: entries.map((entry) => entry.label),
    };
}

function buildResultOverlay(root: Node) {
    const resultRoot = combatPanel(root, 'ResultOverlay', 0, 0, 375, 817, new Color(3, 6, 9, 205));
    resultRoot.addComponent(BlockInputEvents);
    const panel = combatPanel(
        resultRoot, 'ResultPanel', 0, 18, 315, 236,
        new Color(24, 29, 30, 255), new Color(154, 126, 72, 255), 6,
    );
    const resultTitle = combatLabel(
        panel, 'Title', '战斗结束', 0, 70, 270, 38, 24, new Color(237, 221, 173),
    );
    const resultMessage = combatLabel(
        panel, 'Message', '--', 0, 13, 270, 60, 14, new Color(207, 210, 190),
    );
    const button = combatButton(panel, 'Confirm', '返回地图', 0, -72, 144, 48, 14);
    resultRoot.active = false;
    return {
        resultRoot,
        resultTitle,
        resultMessage,
        resultButton: button.node,
        resultButtonLabel: button.label,
    };
}

function buildLoadingOverlay(root: Node) {
    const loadingRoot = combatPanel(root, 'LoadingOverlay', 0, 0, 375, 817, new Color(6, 10, 13, 248));
    loadingRoot.addComponent(BlockInputEvents);
    const loadingLabel = combatLabel(
        loadingRoot, 'LoadingLabel', '正在展开战斗……', 0, 0, 310, 60, 16,
    );
    return { loadingRoot, loadingLabel };
}
