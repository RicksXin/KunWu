import { Button, Color, Graphics, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { combatButton, combatLabel, combatNode, combatPanel } from './CombatUiPrimitives';

export interface CombatUnitView {
    readonly root: Node;
    readonly artRoot: Node;
    readonly portrait: Sprite;
    readonly nameButton: Node;
    readonly nameLabel: Label;
    readonly raceLabel: Label;
    readonly hpFill: Graphics;
    readonly hpFillTransform: UITransform;
    readonly hpLabel: Label;
    readonly actionFill: Graphics;
    readonly actionFillTransform: UITransform;
    readonly statusLabel: Label;
    readonly floatRoot: Node;
}

export function createCombatUnitView(
    parent: Node,
    unitId: number,
    ally: boolean,
    x: number,
    y: number,
): CombatUnitView {
    const root = combatNode(parent, `Unit_${unitId}`, x, y, 86, 205);
    const baseColor = ally ? new Color(42, 58, 65, 235) : new Color(58, 49, 46, 245);
    const artRoot = combatPanel(
        root, 'Art', 0, 0, 86, 205, baseColor,
        ally ? new Color(83, 122, 125) : new Color(137, 83, 68), 5,
    );
    const portraitNode = combatNode(artRoot, 'Portrait', 0, 0, 86, 205);
    const portrait = portraitNode.addComponent(Sprite);
    portrait.sizeMode = Sprite.SizeMode.CUSTOM;
    if (!ally) drawEnemySilhouette(artRoot);

    combatPanel(root, 'InfoShadow', 0, -74.5, 84, 56, new Color(7, 10, 13, 220));
    const name = combatButton(root, 'NameButton', '--', 0, -52, 78, 18, 11);
    const nameButton = name.node;
    nameButton.getComponent(Graphics)?.clear();
    if (!ally) {
        const button = nameButton.getComponent(Button);
        if (button) button.interactable = false;
    }

    const raceRoot = combatPanel(
        root, 'Race', -35, -68, 12, 12,
        new Color(25, 30, 31, 255), new Color(156, 126, 70, 255), 1,
    );
    const raceLabel = combatLabel(raceRoot, 'RaceLabel', ally ? '人' : '傀', 0, 0, 10, 10, 8);
    const hpTrack = combatPanel(root, 'HpTrack', 6, -68, 62, 8, new Color(14, 16, 18, 255));
    const hpFillNode = combatNode(hpTrack, 'Fill', -31, 0, 62, 6, 0, 0.5);
    const hpFill = hpFillNode.addComponent(Graphics);
    hpFill.fillColor = ally ? new Color(75, 159, 126) : new Color(190, 70, 54);
    hpFill.rect(0, -3, 62, 6);
    hpFill.fill();
    const hpLabel = combatLabel(hpTrack, 'Value', '--', 0, 0, 60, 10, 7, new Color(245, 239, 216));

    const actionTrack = combatPanel(root, 'ActionTrack', 6, -79, 62, 5, new Color(12, 17, 19, 255));
    const actionFillNode = combatNode(actionTrack, 'Fill', -31, 0, 62, 3, 0, 0.5);
    const actionFill = actionFillNode.addComponent(Graphics);
    actionFill.fillColor = new Color(75, 204, 204, 255);
    actionFill.rect(0, -1.5, 62, 3);
    actionFill.fill();
    const statusLabel = combatLabel(
        root, 'Statuses', '', 0, -92, 80, 14, 9,
        new Color(219, 196, 130),
    );
    const floatRoot = combatNode(root, 'FloatingText', 0, 46, 86, 40);
    return {
        root, artRoot, portrait, nameButton, nameLabel: name.label, raceLabel,
        hpFill, hpFillTransform: hpFillNode.getComponent(UITransform)!, hpLabel,
        actionFill, actionFillTransform: actionFillNode.getComponent(UITransform)!,
        statusLabel, floatRoot,
    };
}

export function setUnitPortrait(view: CombatUnitView, frame: SpriteFrame | null): void {
    view.portrait.spriteFrame = frame;
    view.portrait.node.active = frame !== null;
}

function drawEnemySilhouette(parent: Node): void {
    const node = combatNode(parent, 'EnemySilhouette', 0, 27, 72, 134);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = new Color(74, 79, 77, 255);
    graphics.circle(0, 44, 22);
    graphics.fill();
    graphics.roundRect(-31, -50, 62, 84, 10);
    graphics.fill();
    graphics.strokeColor = new Color(174, 82, 60, 255);
    graphics.lineWidth = 2;
    graphics.moveTo(-18, 49);
    graphics.lineTo(18, 39);
    graphics.stroke();
}
