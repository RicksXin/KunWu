import { HorizontalTextAlignment, Mask, Node, UITransform } from 'cc';
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
    applyPanelBackground,
    createSilhouette,
    createSpriteNode,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionVisualNodes';

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
    layer.active = true;
    applyPanelBackground(panel, assets.panelFrame);
    configureExistingLabel(title, '选择入山修士', 20, EXPEDITION_COLORS.text);
    configureExistingLabel(hint, '已拥有修士 · 最多上阵 4 名', 12, EXPEDITION_COLORS.textSecondary);

    const viewport = prepareExistingScrollViewport(list);
    const contentHeight = Math.max(620, profile.roster.length * 116 + 8);
    viewport.getComponent(UITransform)?.setContentSize(331, contentHeight);
    profile.roster.forEach((hero, index) => {
        renderHeroSelectionRow(viewport, hero, index, profile, assets, actions.toggleHero);
    });

    configureExistingButton(close, {
        text: `完成  ${membersOf(currentExpeditionPreset(profile.expeditionPreparation).slots).length}/4`,
        primary: true,
        onClick: actions.close,
    });
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
    const row = createRect(
        parent,
        `Hero_${hero.instanceId}`,
        0,
        -58 - index * 116,
        319,
        106,
        selected ? EXPEDITION_COLORS.rowSelected : EXPEDITION_COLORS.row,
        selected ? EXPEDITION_COLORS.border : EXPEDITION_COLORS.borderSoft,
    );
    const avatar = createRect(
        row,
        'Avatar',
        -127,
        7,
        50,
        50,
        EXPEDITION_CAREER_CARD_COLORS[hero.careerId] ?? EXPEDITION_COLORS.panelAlt,
        EXPEDITION_COLORS.borderSoft,
    );
    const mask = avatar.addComponent(Mask);
    mask.type = Mask.Type.RECT;
    const portrait = assets.portraitFrames.get(hero.nameKey) ?? null;
    portrait
        ? createSpriteNode(avatar, 'Portrait', portrait, 0, -44, 50, 130)
        : createSilhouette(avatar, 0, -7, false, 0.43);
    assets.avatarFrame && createSpriteNode(avatar, 'AvatarFrame', assets.avatarFrame, 0, 0, 50, 50);
    createLabel(
        row,
        'Realm',
        `${expeditionText(`realm.${hero.realmId}`)}·${expeditionText(`spiritual_root.${hero.spiritualRootId}`)}`,
        -127,
        -42,
        86,
        18,
        9,
        EXPEDITION_COLORS.text,
    );

    const rating = Object.values(hero.attributes).reduce((sum, value) => sum + value, 0);
    const info = [
        `${expeditionText(hero.nameKey)} · ${expeditionText(`career.${hero.careerId}`)}`,
        `等级 ${hero.level}    灵息 ${hero.stamina}`,
        `战力 ${rating}`,
    ].join('\n');
    const infoLabel = createLabel(
        row,
        'Info',
        info,
        -30,
        4,
        142,
        78,
        12,
        EXPEDITION_COLORS.text,
        HorizontalTextAlignment.LEFT,
    );
    infoLabel.lineHeight = 24;

    const enabled = !hero.isDead && !otherParty;
    const text = hero.isDead
        ? '已阵亡'
        : otherParty
          ? '其他队伍'
          : selected
            ? `取消 ${selectedIndex + 1}`
            : '选择';
    const button = createButton(row, {
        name: 'SelectButton',
        text,
        x: 123,
        y: 0,
        width: 70,
        height: 48,
        enabled,
        primary: selected,
        onClick: () => toggleHero(hero),
    });
    button.label.fontSize = 11;
}
