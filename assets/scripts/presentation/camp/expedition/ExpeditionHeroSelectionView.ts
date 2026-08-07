import { Color, HorizontalTextAlignment, Label, Mask, Node, UITransform } from 'cc';
import { CAMP_EXPEDITION_PATHS } from 'db://assets/scripts/domain/CampSceneContract';
import { membersOf } from 'db://assets/scripts/domain/Party';
import type { HeroInstance, Profile } from 'db://assets/scripts/services/GameState';
import { campLabel, campNode } from 'db://assets/scripts/presentation/camp/shared/CampViewUtils';
import { currentExpeditionPreset } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionState';
import {
    EXPEDITION_CAREER_CARD_COLORS,
    EXPEDITION_COLORS,
    expeditionText,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionTheme';
import type { ExpeditionVisualAssets } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionViewTypes';
import {
    configureExistingButton,
    configureExistingLabel,
    createButton,
    createLabel,
    createRect,
    prepareExistingScrollViewport,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionUiFactory';
import {
    applyFixedPanelBackground,
    createSilhouette,
    createSpriteNode,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionVisualNodes';
import { createSpiritualRootFrame } from 'db://assets/scripts/presentation/camp/expedition/SpiritualRootFrame';

export interface ExpeditionHeroSelectionActions {
    readonly toggleHero: (hero: HeroInstance) => void;
    readonly close: () => void;
}

export function renderExpeditionHeroSelection(
    root: Node,
    profile: Profile,
    assets: ExpeditionVisualAssets,
    actions: ExpeditionHeroSelectionActions,
): void {
    const layer = campNode(root, CAMP_EXPEDITION_PATHS.heroSelection);
    const panel = campNode(root, CAMP_EXPEDITION_PATHS.heroSelectionPanel);
    const title = campLabel(root, CAMP_EXPEDITION_PATHS.heroSelectionTitle);
    const hint = campLabel(root, CAMP_EXPEDITION_PATHS.heroSelectionHint);
    const list = campNode(root, CAMP_EXPEDITION_PATHS.heroList);
    const close = campNode(root, CAMP_EXPEDITION_PATHS.heroSelectionClose);
    if (!layer || !panel || !title || !hint || !list || !close) {
        return;
    }
    const selectedCount = membersOf(
        currentExpeditionPreset(profile.expeditionPreparation).slots,
    ).length;
    layer.active = true;
    prepareSelectionShell(
        layer,
        panel,
        title.node,
        hint,
        list,
        close,
        selectedCount,
        actions.close,
    );
    applyFixedPanelBackground(panel, assets.heroSelectionPanelFrame, 343, 553);

    const viewport = prepareExistingScrollViewport(list);
    const contentHeight = Math.max(292, profile.roster.length * 75 - 8);
    viewport.getComponent(UITransform)?.setContentSize(288, contentHeight);
    profile.roster.forEach((hero, index) => {
        renderHeroSelectionRow(viewport, hero, index, profile, assets, actions.toggleHero);
    });

    configureExistingButton(close, {
        text: `完成\n${selectedCount}/4`,
        primary: true,
        onClick: actions.close,
    });
}

function prepareSelectionShell(
    layer: Node,
    panel: Node,
    title: Node,
    hint: Label,
    list: Node,
    close: Node,
    selectedCount: number,
    onClose: () => void,
): void {
    layer.getChildByName('SelectionBackdrop')?.destroy();
    const backdrop = createRect(layer, 'SelectionBackdrop', 0, 0, 375, 817, new Color(0, 0, 0, 255));
    backdrop.setSiblingIndex(0);
    panel.setPosition(0, 58, 0);
    title.active = false;
    configureExistingLabel(hint, '选择你的修士', 12, EXPEDITION_COLORS.textSecondary);
    hint.node.setPosition(0.5, 276.5, 0);
    hint.node.getComponent(UITransform)?.setContentSize(112, 16);
    list.setPosition(-0.5, 106.5, 0);
    list.getComponent(UITransform)?.setContentSize(288, 292);

    let count = layer.getChildByName('HeroSelectionCount')?.getComponent(Label) ?? null;
    if (!count) count = createLabel(layer, 'HeroSelectionCount', '', 119.5, 275.5, 42, 18, 14, EXPEDITION_COLORS.accent);
    configureExistingLabel(count, `${selectedCount} / 4`, 14, EXPEDITION_COLORS.accent, HorizontalTextAlignment.CENTER, { lineHeight: 18 });

    close.setPosition(-8.5, -246.5, 0);
    close.getComponent(UITransform)?.setContentSize(132, 44);
    let back = layer.getChildByName('HeroSelectionBackButton');
    if (!back) {
        back = createButton(layer, {
            name: 'HeroSelectionBackButton', text: '返回', x: 72.5, y: -293.5,
            width: 132, height: 44, onClick: onClose,
        }).node;
    }
    back.setPosition(72.5, -293.5, 0);
    back.getComponent(UITransform)?.setContentSize(132, 44);
    configureExistingButton(back, { text: '返回', onClick: onClose });
}

function renderHeroSelectionRow(
    parent: Node,
    hero: HeroInstance,
    index: number,
    profile: Profile,
    assets: ExpeditionVisualAssets,
    toggleHero: (hero: HeroInstance) => void,
): void {
    const state = profile.expeditionPreparation;
    const preset = currentExpeditionPreset(state);
    const selectedIndex = preset.slots.indexOf(hero.instanceId);
    const otherParty = state.partyPresets.some(
        (candidate) => candidate.presetId !== preset.presetId && candidate.slots.includes(hero.instanceId),
    );
    const selected = selectedIndex >= 0;
    const background = selected ? assets.heroRowSelected : assets.heroRowDefault;
    const row = background
        ? createSpriteNode(parent, `Hero_${hero.instanceId}`, background, 0, -33.5 - index * 75, 288, 67).node
        : createRect(parent, `Hero_${hero.instanceId}`, 0, -33.5 - index * 75, 288, 67,
            selected ? EXPEDITION_COLORS.rowSelected : EXPEDITION_COLORS.row);
    const avatar = createRect(
        row,
        'Avatar',
        -112,
        0.5,
        40,
        40,
        EXPEDITION_CAREER_CARD_COLORS[hero.careerId] ?? EXPEDITION_COLORS.panelAlt,
        EXPEDITION_COLORS.borderSoft,
    );
    const clip = new Node('AvatarClip');
    clip.layer = avatar.layer;
    avatar.addChild(clip);
    clip.setPosition(0, 1, 0);
    clip.addComponent(UITransform).setContentSize(30, 32);
    const mask = clip.addComponent(Mask);
    mask.type = Mask.Type.RECT;
    const portrait = assets.portraitFrames.get(hero.nameKey) ?? null;
    portrait
        ? createSpriteNode(clip, 'Portrait', portrait, -4, -57, 64, 153)
        : createSilhouette(clip, 0, -20, false, 0.3);
    assets.avatarFrame && createSpriteNode(avatar, 'AvatarFrame', assets.avatarFrame, 0, 0, 40, 40);
    createSpiritualRootFrame(avatar, hero.spiritualRootId, 0, 0, 28, 28);
    createLabel(
        row,
        'Realm',
        expeditionText(`realm.${hero.realmId}`),
        -112,
        -21,
        80,
        16,
        10,
        EXPEDITION_COLORS.textSecondary,
    );

    const rating = Object.values(hero.attributes).reduce((sum, value) => sum + value, 0);
    createLabel(row, 'Name', `${expeditionText(hero.nameKey)} · ${expeditionText(`career.${hero.careerId}`)}`,
        -24, 17.5, 112, 20, 16, EXPEDITION_COLORS.text, HorizontalTextAlignment.LEFT, { lineHeight: 20 });
    createLabel(row, 'LevelAndPower', `Lv.${hero.level} · 战力${rating}`,
        -24, -1.5, 112, 16, 11, EXPEDITION_COLORS.textSecondary, HorizontalTextAlignment.LEFT, { lineHeight: 16 });
    createLabel(row, 'Stamina', `灵息${hero.stamina}`,
        -21, -19.5, 118, 14, 10, EXPEDITION_COLORS.textSecondary, HorizontalTextAlignment.LEFT, { lineHeight: 14 });

    const enabled = !hero.isDead && !otherParty;
    const text = hero.isDead
        ? '已阵亡'
        : otherParty
            ? '其他队伍'
            : selected
            ? `取消 · ${selectedIndex + 1}`
            : '选择';
    const button = createButton(row, {
        name: 'SelectButton',
        text,
        x: 96,
        y: 2.5,
        width: 72,
        height: 28,
        enabled,
        primary: selected,
        onClick: () => toggleHero(hero),
    });
    configureExistingButton(button.node, {
        text, enabled, primary: selected, onClick: () => toggleHero(hero),
    });
}
