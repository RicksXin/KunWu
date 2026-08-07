import {
    Button,
    Color,
    Graphics,
    HorizontalTextAlignment,
    Label,
    Mask,
    Node,
    Sprite,
    UITransform,
} from 'cc';
import type { ExpeditionPreparationState, HeroInstance } from 'db://assets/scripts/services/GameState';
import type { ExpeditionPreparationActions } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionPreparationView';
import {
    EXPEDITION_COLORS,
    expeditionText,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionTheme';
import type { ExpeditionVisualAssets } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionViewTypes';
import {
    configureExistingLabel,
    createLabel,
    createRect,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionUiFactory';
import {
    createSilhouette,
    createSpriteNode,
    drawSolidBackground,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionVisualNodes';
import { createSpiritualRootFrame } from 'db://assets/scripts/presentation/camp/expedition/SpiritualRootFrame';

const CARD_WIDTH = 71;
const CARD_HEIGHT = 163;

export function renderExpeditionHeroCard(
    card: Node,
    hero: HeroInstance | null,
    assets: ExpeditionVisualAssets,
): void {
    const background = card.getChildByName('Background');
    for (const child of [...card.children]) {
        if (child !== background) child.destroy();
    }
    card.getComponent(UITransform)?.setContentSize(CARD_WIDTH, CARD_HEIGHT);
    if (background) {
        background.getComponent(UITransform)?.setContentSize(CARD_WIDTH, CARD_HEIGHT);
        drawSolidBackground(background, EXPEDITION_COLORS.panelAlt);
        background.setSiblingIndex(0);
    }
    createArtwork(card, hero, assets);
    if (hero) createSpiritualRootFrame(card, hero.spiritualRootId, 0, 6.325, 45.517, 139.31);
    assets.heroCardFrame && createSpriteNode(
        card,
        'CardFrame',
        assets.heroCardFrame,
        0,
        0,
        CARD_WIDTH,
        CARD_HEIGHT,
    );
    hero ? createHeroInformation(card, hero) : createEmptyInformation(card);
}

export function renderExpeditionPartyTabs(
    parent: Node,
    state: ExpeditionPreparationState,
    maxPartyPresets: number,
    assets: ExpeditionVisualAssets,
    actions: ExpeditionPreparationActions,
): void {
    parent.getComponent(UITransform)?.setContentSize(90, 26);
    for (let index = 0; index < maxPartyPresets; index += 1) {
        const tab = parent.getChildByName(`PartyTab${index + 1}`);
        if (!tab) continue;
        const preset = state.partyPresets[index];
        const selected = preset?.presetId === state.activePresetId;
        preparePartyTab(tab, index, Boolean(preset), selected, assets);
        const button = tab.getComponent(Button) ?? tab.addComponent(Button);
        button.target = tab;
        button.transition = Button.Transition.SCALE;
        button.zoomScale = 0.96;
        button.duration = 0.1;
        button.interactable = true;
        tab.off(Button.EventType.CLICK);
        tab.on(
            Button.EventType.CLICK,
            () => preset ? actions.switchParty(preset.presetId) : actions.unlockParty(index),
        );
    }
}

function createArtwork(card: Node, hero: HeroInstance | null, assets: ExpeditionVisualAssets): void {
    if (!hero && assets.emptyHeroFrame) {
        const empty = createSpriteNode(card, 'EmptyPortrait', assets.emptyHeroFrame, 0.5, -1.5, 64, 166);
        empty.trim = false;
        return;
    }
    const clip = new Node('ArtworkClip');
    clip.layer = card.layer;
    card.addChild(clip);
    clip.setPosition(0.5, -4.88, 0);
    clip.addComponent(UITransform).setContentSize(64, 153.24);
    const mask = clip.addComponent(Mask);
    mask.type = Mask.Type.RECT;
    const portrait = hero ? assets.portraitFrames.get(hero.nameKey) ?? null : null;
    if (portrait) {
        const portraitSprite = createSpriteNode(clip, 'Portrait', portrait, 0, 0, 64, 153.24);
        portraitSprite.trim = false;
    } else {
        createSilhouette(clip, 0, 8, false, 0.82);
    }
}

function createHeroInformation(card: Node, hero: HeroInstance): void {
    const fade = createRect(
        card,
        'InfoFade',
        0,
        -52.5,
        58,
        48,
        new Color(10, 14, 13, 87),
    );
    fade.setSiblingIndex(Math.max(0, card.children.length - 1));
    createLabel(
        card,
        'Stamina',
        `灵息 ${hero.stamina}`,
        0,
        -34.72,
        71,
        14,
        10,
        EXPEDITION_COLORS.info,
        HorizontalTextAlignment.CENTER,
        { lineHeight: 14 },
    );
    createLabel(
        card,
        'Name',
        expeditionText(hero.nameKey),
        0,
        -47.3,
        71,
        16,
        10,
        EXPEDITION_COLORS.text,
        HorizontalTextAlignment.CENTER,
        { lineHeight: 16 },
    );
    createLabel(
        card,
        'Career',
        `${expeditionText(`career.${hero.careerId}`)}·${hero.level} 级`,
        0,
        -60.54,
        71,
        16,
        10,
        EXPEDITION_COLORS.accent,
        HorizontalTextAlignment.CENTER,
        { lineHeight: 16 },
    );
    createLabel(
        card,
        'Realm',
        `${expeditionText(`realm.${hero.realmId}`)}·${expeditionText(`spiritual_root.${hero.spiritualRootId}`)}`,
        0,
        -73.78,
        71,
        16,
        10,
        EXPEDITION_COLORS.textSecondary,
        HorizontalTextAlignment.CENTER,
        { lineHeight: 16 },
    );
}

function createEmptyInformation(card: Node): void {
    createLabel(
        card,
        'Undecided',
        '待上阵',
        0,
        -0.3,
        71,
        14,
        10,
        EXPEDITION_COLORS.accent,
        HorizontalTextAlignment.CENTER,
        { lineHeight: 14 },
    );
}

function preparePartyTab(
    tab: Node,
    index: number,
    unlocked: boolean,
    selected: boolean,
    assets: ExpeditionVisualAssets,
): void {
    tab.setPosition((index - 1) * 32, 0, 0);
    tab.getComponent(UITransform)?.setContentSize(26, 26);
    for (const child of [...tab.children]) {
        if (child.name !== 'Label') child.destroy();
    }
    const frame = selected ? assets.partyTabSelected : assets.partyTabDefault;
    const sprite = tab.getComponent(Sprite);
    const graphics = tab.getComponent(Graphics) ?? tab.addComponent(Graphics);
    if (sprite && frame) {
        sprite.enabled = true;
        sprite.spriteFrame = frame;
        sprite.type = Sprite.Type.SIMPLE;
        sprite.sizeMode = Sprite.SizeMode.CUSTOM;
        sprite.trim = false;
        graphics.enabled = false;
    } else {
        if (sprite) sprite.enabled = false;
        graphics.enabled = true;
        graphics.clear();
        graphics.fillColor = selected ? EXPEDITION_COLORS.rowSelected : EXPEDITION_COLORS.panelAlt;
        graphics.strokeColor = selected ? EXPEDITION_COLORS.accent : EXPEDITION_COLORS.borderSoft;
        graphics.rect(-13, -13, 26, 26);
        graphics.fill();
        graphics.stroke();
    }
    const label = tab.getChildByName('Label')?.getComponent(Label);
    if (label) {
        configureExistingLabel(
            label,
            `${index + 1}`,
            16,
            !unlocked ? EXPEDITION_COLORS.disabled : selected ? EXPEDITION_COLORS.accent : EXPEDITION_COLORS.text,
            HorizontalTextAlignment.CENTER,
            { lineHeight: 18, bold: selected },
        );
        label.node.getComponent(UITransform)?.setContentSize(26, 18);
    }
}
