import { HorizontalTextAlignment, Node, UITransform } from 'cc';
import {
    EXPEDITION_ITEM_IDS,
    loadoutWeight,
    partyBurdenLimit,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import type {
    ExpeditionItemId,
    ExpeditionPreparationConfig,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import {
    CAMP_EXPEDITION_CONTENT_PATHS,
    CAMP_EXPEDITION_PATHS,
} from 'db://assets/scripts/domain/CampSceneContract';
import type { PartySlots } from 'db://assets/scripts/domain/Party';
import type {
    ExpeditionPreparationState,
    HeroInstance,
    Profile,
} from 'db://assets/scripts/services/GameState';
import { campLabel, campNode } from 'db://assets/scripts/presentation/camp/shared/CampViewUtils';
import { mountCampModalPanelFrame } from 'db://assets/scripts/presentation/camp/shared/CampModalPanelFrame';
import type { CampModalPanelFrame } from 'db://assets/scripts/presentation/camp/shared/CampModalPanelFrame';
import {
    availableExpeditionItemCount,
    currentExpeditionPreset,
    expeditionHeroSnapshots,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionState';
import {
    EXPEDITION_COLORS,
    expeditionText,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionTheme';
import type { ExpeditionVisualAssets } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionViewTypes';
import {
    clearChildren,
    configureExistingButton,
    configureExistingLabel,
    createButton,
    createLabel,
    styleExistingRect,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionUiFactory';
import {
    createItemGlyph,
    createSilhouette,
    createSpriteNode,
    drawSolidBackground,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionVisualNodes';

export interface ExpeditionPreparationActions {
    readonly editParty: () => void;
    readonly switchParty: (presetId: string) => void;
    readonly unlockParty: (index: number) => void;
    readonly adjustLoadout: (itemId: ExpeditionItemId, delta: number) => void;
    readonly restoreStamina: () => void;
}

export interface ExpeditionPreparationFooterActions {
    readonly adventure: () => void;
    readonly chooseMap: () => void;
    readonly close: () => void;
}

export interface ExpeditionPreparationShell {
    readonly frame: CampModalPanelFrame;
    readonly contentRoot: Node;
}

export async function mountExpeditionPreparationShell(
    root: Node,
    actions: ExpeditionPreparationFooterActions,
): Promise<ExpeditionPreparationShell | null> {
    const legacyAdventure = campNode(root, CAMP_EXPEDITION_PATHS.adventure);
    const legacyDepart = campNode(root, CAMP_EXPEDITION_PATHS.depart);
    const legacyClose = campNode(root, CAMP_EXPEDITION_PATHS.close);
    legacyAdventure && configureExistingButton(legacyAdventure, {
        text: '历练', enabled: false, onClick: actions.adventure,
    });
    legacyDepart && configureExistingButton(legacyDepart, {
        text: '启程', primary: true, onClick: actions.chooseMap,
    });
    legacyClose && configureExistingButton(legacyClose, {
        text: '离开', onClick: actions.close,
    });
    const frame = await mountCampModalPanelFrame(root, {
        panelWidth: 359,
        panelHeight: 570,
        footerBottomInset: 30,
        footerActions: [
            { text: '历练', enabled: false, onClick: actions.adventure },
            { text: '启程', primary: true, onClick: actions.chooseMap },
            { text: '离开', onClick: actions.close },
        ],
    });
    const contentRoot = frame?.contentMount ?? null;
    if (!frame || !contentRoot) return null;
    const contentPaths = [
        CAMP_EXPEDITION_PATHS.preparationTitle,
        CAMP_EXPEDITION_PATHS.heroCards,
        CAMP_EXPEDITION_PATHS.toolbar,
        CAMP_EXPEDITION_PATHS.burdenRow,
        CAMP_EXPEDITION_PATHS.loadoutRows,
    ];
    const contents = contentPaths.map((path) => campNode(root, path));
    const legacyNodes = [
        campNode(root, CAMP_EXPEDITION_PATHS.backdrop),
        campNode(root, CAMP_EXPEDITION_PATHS.preparationPanel),
        campNode(root, CAMP_EXPEDITION_PATHS.bottomActions),
    ];
    if (contents.some((node) => !node) || legacyNodes.some((node) => !node)) {
        frame.node.destroy();
        return null;
    }
    frame.mountContents(contents as Node[]);
    for (const node of legacyNodes) node!.active = false;
    return { frame, contentRoot };
}

export function renderExpeditionPreparation(
    contentRoot: Node,
    config: ExpeditionPreparationConfig,
    profile: Profile,
    assets: ExpeditionVisualAssets,
    actions: ExpeditionPreparationActions,
): void {
    const state = profile.expeditionPreparation;
    const preset = currentExpeditionPreset(state);
    const title = campLabel(contentRoot, CAMP_EXPEDITION_CONTENT_PATHS.title);
    const heroCards = campNode(contentRoot, CAMP_EXPEDITION_CONTENT_PATHS.heroCards);
    const partyTabs = campNode(contentRoot, CAMP_EXPEDITION_CONTENT_PATHS.partyTabs);
    const burdenRow = campNode(contentRoot, CAMP_EXPEDITION_CONTENT_PATHS.burdenRow);
    const burdenLabel = campLabel(contentRoot, CAMP_EXPEDITION_CONTENT_PATHS.burdenLabel);
    if (!title || !heroCards || !partyTabs || !burdenRow || !burdenLabel) {
        return;
    }
    configureExistingLabel(title, '入山整备', 20, EXPEDITION_COLORS.text);

    for (let index = 0; index < 4; index += 1) {
        const heroId = preset.slots[index] ?? null;
        const hero = profile.roster.find((candidate) => candidate.instanceId === heroId) ?? null;
        const card = heroCards.getChildByName(`HeroCard${index + 1}`);
        card && renderHeroCard(card, hero, assets);
    }

    const editParty = campNode(contentRoot, CAMP_EXPEDITION_CONTENT_PATHS.editParty);
    editParty && configureExistingButton(editParty, {
        text: '编辑队伍',
        onClick: actions.editParty,
    });
    renderPartyTabs(partyTabs, state, config.maxPartyPresets, assets, actions);
    const restore = campNode(contentRoot, CAMP_EXPEDITION_CONTENT_PATHS.restoreStamina);
    restore && configureExistingButton(restore, {
        text: '调息',
        enabled: false,
        onClick: actions.restoreStamina,
    });

    const weight = loadoutWeight(state.loadout, config);
    const limit = partyBurdenLimit(preset.slots, expeditionHeroSnapshots(profile), config);
    styleExistingRect(burdenRow, EXPEDITION_COLORS.panelAlt);
    configureExistingLabel(
        burdenLabel,
        `负重  ${weight}/${limit}`,
        15,
        weight > limit ? EXPEDITION_COLORS.warning : EXPEDITION_COLORS.text,
    );

    const paths: Readonly<Record<ExpeditionItemId, string>> = {
        spiritGrain: CAMP_EXPEDITION_CONTENT_PATHS.spiritGrainRow,
        pickaxe: CAMP_EXPEDITION_CONTENT_PATHS.pickaxeRow,
        lens: CAMP_EXPEDITION_CONTENT_PATHS.lensRow,
    };
    EXPEDITION_ITEM_IDS.forEach((itemId) => {
        const row = campNode(contentRoot, paths[itemId]);
        row && renderLoadoutRow(row, itemId, profile, preset.slots, config, assets, actions);
    });
}

function renderHeroCard(
    card: Node,
    hero: HeroInstance | null,
    assets: ExpeditionVisualAssets,
): void {
    const backgroundLayer = card.getChildByName('Background');
    for (const child of [...card.children]) {
        child !== backgroundLayer && child.destroy();
    }
    const size = card.getComponent(UITransform)?.contentSize;
    const width = size?.width ?? 79;
    const height = size?.height ?? 205;
    if (backgroundLayer) {
        drawSolidBackground(backgroundLayer, EXPEDITION_COLORS.row);
        backgroundLayer.setSiblingIndex(0);
    }
    const portrait = hero ? assets.portraitFrames.get(hero.nameKey) ?? null : null;
    if (portrait) {
        createSpriteNode(card, 'Portrait', portrait, 0, 0, width, height);
    } else if (!hero && assets.emptyHeroFrame) {
        const emptyPortrait = createSpriteNode(
            card,
            'EmptyPortrait',
            assets.emptyHeroFrame,
            0,
            15,
            96,
            168,
        );
        emptyPortrait.trim = false;
    } else {
        createSilhouette(card, 0, 25, hero === null);
    }
    assets.heroCardFrame && createSpriteNode(card, 'CardFrame', assets.heroCardFrame, 0, 0, 79, 205);
    if (!hero) {
        createLabel(card, 'Undecided', '人选未定', 0, -78, 72, 24, 13, EXPEDITION_COLORS.textSecondary);
        return;
    }
    const details = [
        `灵息 ${hero.stamina}`,
        expeditionText(hero.nameKey),
        `${expeditionText(`career.${hero.careerId}`)}·${hero.level}级`,
        `${expeditionText(`realm.${hero.realmId}`)}·${expeditionText(`spiritual_root.${hero.spiritualRootId}`)}`,
    ].join('\n');
    const label = createLabel(card, 'HeroInfo', details, 0, -50, width - 8, 76, 12, EXPEDITION_COLORS.text);
    label.lineHeight = 17;
}

function renderPartyTabs(
    parent: Node,
    state: ExpeditionPreparationState,
    maxPartyPresets: number,
    assets: ExpeditionVisualAssets,
    actions: ExpeditionPreparationActions,
): void {
    for (let index = 0; index < maxPartyPresets; index += 1) {
        const tab = parent.getChildByName(`PartyTab${index + 1}`);
        if (!tab) continue;
        const preset = state.partyPresets[index];
        const isCurrent = preset?.presetId === state.activePresetId;
        tab.getChildByName('LockIcon')?.destroy();
        const button = configureExistingButton(tab, {
            text: `${index + 1}队`,
            primary: isCurrent,
            onClick: () => preset ? actions.switchParty(preset.presetId) : actions.unlockParty(index),
        });
        button.label.fontSize = 11;
        if (!preset && assets.lockFrame) {
            createSpriteNode(button.node, 'LockIcon', assets.lockFrame, 13, 12, 14, 14);
        }
    }
}

function renderLoadoutRow(
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
    styleExistingRect(row, EXPEDITION_COLORS.row);
    const itemFrame = assets.itemFrames.get(itemId) ?? null;
    itemFrame
        ? createSpriteNode(row, 'ItemIcon', itemFrame, -137, 0, 24, 24)
        : createItemGlyph(row, itemId, -137, 0);
    createLabel(row, 'Name', expeditionText(item.nameKey), -91, 7, 75, 22, 14, EXPEDITION_COLORS.text, HorizontalTextAlignment.LEFT);
    createLabel(row, 'Count', `${carried}/${available}`, -91, -12, 75, 18, 11, EXPEDITION_COLORS.textSecondary, HorizontalTextAlignment.LEFT);
    createLabel(row, 'Weight', `重 ${item.weight}`, 7, 0, 48, 24, 11, EXPEDITION_COLORS.textSecondary);
    createButton(row, {
        name: 'MinusButton', text: '−', x: 91, y: 0, width: 44, height: 44,
        enabled: carried > 0, onClick: () => actions.adjustLoadout(itemId, -1),
    });
    createButton(row, {
        name: 'PlusButton', text: '+', x: 139, y: 0, width: 44, height: 44,
        enabled: carried < available && weight + item.weight <= limit,
        onClick: () => actions.adjustLoadout(itemId, 1),
    });
}
