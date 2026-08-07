import {
    Button,
    Color,
    Graphics,
    HorizontalTextAlignment,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
} from 'cc';
import {
    loadoutWeight,
    partyBurdenLimit,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import type {
    ExpeditionItemId,
    ExpeditionPreparationConfig,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { PartySlots } from 'db://assets/scripts/domain/Party';
import type { Profile } from 'db://assets/scripts/services/GameState';
import type { ExpeditionPreparationActions } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionPreparationView';
import {
    availableExpeditionItemCount,
    expeditionHeroSnapshots,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionState';
import {
    EXPEDITION_COLORS,
    expeditionText,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionTheme';
import type { ExpeditionVisualAssets } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionViewTypes';
import {
    clearChildren,
    createLabel,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionUiFactory';
import {
    createItemGlyph,
    createSpriteNode,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionVisualNodes';

export function renderExpeditionLoadoutRow(
    row: Node,
    itemId: ExpeditionItemId,
    profile: Profile,
    slots: PartySlots,
    config: ExpeditionPreparationConfig,
    assets: ExpeditionVisualAssets,
    actions: ExpeditionPreparationActions,
): void {
    const item = config.items[itemId];
    const carried = profile.expeditionPreparation.loadout[itemId];
    const available = availableExpeditionItemCount(itemId, profile, config);
    const weight = loadoutWeight(profile.expeditionPreparation.loadout, config);
    const limit = partyBurdenLimit(slots, expeditionHeroSnapshots(profile), config);
    clearChildren(row);
    row.getComponent(UITransform)?.setContentSize(204, 32);
    const rowSprite = row.getComponent(Sprite);
    if (rowSprite) rowSprite.enabled = false;
    const itemFrame = assets.itemFrames.get(itemId) ?? null;
    if (itemFrame) {
        const icon = createSpriteNode(row, 'ItemIcon', itemFrame, -86, 0, 32, 32);
        icon.trim = false;
    } else {
        createItemGlyph(row, itemId, -86, 0);
        row.getChildByName('ItemGlyph')?.setScale(0.82, 0.82, 1);
    }
    createLabel(
        row,
        'Name',
        expeditionText(item.nameKey),
        -33,
        0,
        62,
        20,
        14,
        EXPEDITION_COLORS.text,
        HorizontalTextAlignment.LEFT,
        { lineHeight: 18 },
    );
    createStepperButton(
        row,
        'MinusButton',
        14,
        assets.stepperMinus,
        false,
        carried > 0,
        () => actions.adjustLoadout(itemId, -1),
    );
    createLabel(
        row,
        'Count',
        `${carried} / ${available}`,
        52,
        0,
        48,
        18,
        12,
        EXPEDITION_COLORS.text,
        HorizontalTextAlignment.CENTER,
        { lineHeight: 16 },
    );
    createStepperButton(
        row,
        'PlusButton',
        90,
        assets.stepperPlus,
        true,
        carried < available && weight + item.weight <= limit,
        () => actions.adjustLoadout(itemId, 1),
    );
}

function createStepperButton(
    parent: Node,
    name: string,
    x: number,
    frame: SpriteFrame | null,
    plus: boolean,
    enabled: boolean,
    onClick: () => void,
): void {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(x, 0, 0);
    node.addComponent(UITransform).setContentSize(48, 48);
    let visual: Node;
    if (frame) {
        const sprite = createSpriteNode(node, 'Visual', frame, 0, 0, 24, 24);
        sprite.trim = false;
        sprite.color = enabled
            ? new Color(255, 255, 255, 255)
            : EXPEDITION_COLORS.buttonArtDisabled.clone();
        visual = sprite.node;
    } else {
        visual = createStepperFallback(node, plus, enabled);
    }
    const button = node.addComponent(Button);
    button.target = visual;
    button.transition = Button.Transition.SCALE;
    button.zoomScale = 0.9;
    button.duration = 0.1;
    button.interactable = enabled;
    enabled && node.on(Button.EventType.CLICK, onClick);
}

function createStepperFallback(parent: Node, plus: boolean, enabled: boolean): Node {
    const visual = new Node('Visual');
    visual.layer = parent.layer;
    parent.addChild(visual);
    visual.addComponent(UITransform).setContentSize(24, 24);
    const graphics = visual.addComponent(Graphics);
    graphics.fillColor = EXPEDITION_COLORS.panelAlt.clone();
    graphics.strokeColor = enabled ? EXPEDITION_COLORS.border : EXPEDITION_COLORS.disabled;
    graphics.rect(-12, -12, 24, 24);
    graphics.fill();
    graphics.stroke();
    graphics.moveTo(-5, 0);
    graphics.lineTo(5, 0);
    if (plus) {
        graphics.moveTo(0, -5);
        graphics.lineTo(0, 5);
    }
    graphics.stroke();
    return visual;
}
