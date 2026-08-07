import { HorizontalTextAlignment, Label, Node, Sprite, UITransform } from 'cc';
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
import type { Profile } from 'db://assets/scripts/services/GameState';
import { campLabel, campNode } from 'db://assets/scripts/presentation/camp/shared/CampViewUtils';
import { mountCampModalPanelFrame } from 'db://assets/scripts/presentation/camp/shared/CampModalPanelFrame';
import type { CampModalPanelFrame } from 'db://assets/scripts/presentation/camp/shared/CampModalPanelFrame';
import {
    currentExpeditionPreset,
    expeditionHeroSnapshots,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionState';
import {
    EXPEDITION_COLORS,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionTheme';
import type { ExpeditionVisualAssets } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionViewTypes';
import {
    configureExistingButton,
    configureExistingLabel,
    createLabel,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionUiFactory';
import {
    renderExpeditionHeroCard,
    renderExpeditionPartyTabs,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionPreparationCards';
import { renderExpeditionLoadoutRow } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionLoadoutRow';

export interface ExpeditionPreparationActions {
    readonly editParty: () => void;
    readonly switchParty: (presetId: string) => void;
    readonly unlockParty: (index: number) => void;
    readonly adjustLoadout: (itemId: ExpeditionItemId, delta: number) => void;
    readonly restoreStamina: () => void;
}

export interface ExpeditionPreparationFooterActions {
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
    if (legacyAdventure) legacyAdventure.active = false;
    legacyDepart && configureExistingButton(legacyDepart, {
        text: '传送', primary: true, onClick: actions.chooseMap,
    });
    legacyClose && configureExistingButton(legacyClose, {
        text: '返回', onClick: actions.close,
    });
    const frame = await mountCampModalPanelFrame(root, {
        panelWidth: 359,
        panelHeight: 607,
        footerBottomInset: 28.5,
        footerButtonWidth: 132,
        footerButtonHeight: 44,
        footerButtonPositions: [-83.5, 71.5],
        footerActions: [
            { text: '传送', primary: true, onClick: actions.chooseMap },
            { text: '返回', onClick: actions.close },
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
    configureExistingLabel(
        title,
        '入山整备',
        20,
        EXPEDITION_COLORS.text,
        HorizontalTextAlignment.CENTER,
        { lineHeight: 24 },
    );
    let subtitle = contentRoot.getChildByName('Subtitle')?.getComponent(Label) ?? null;
    if (!subtitle) {
        subtitle = createLabel(
            contentRoot,
            'Subtitle',
            '传送阵 · 昆吾山外缘',
            0,
            219.5,
            180,
            16,
            12,
            EXPEDITION_COLORS.text,
            HorizontalTextAlignment.CENTER,
            { lineHeight: 16 },
        );
    } else {
        configureExistingLabel(
            subtitle,
            '传送阵 · 昆吾山外缘',
            12,
            EXPEDITION_COLORS.text,
            HorizontalTextAlignment.CENTER,
            { lineHeight: 16 },
        );
    }

    for (let index = 0; index < 4; index += 1) {
        const heroId = preset.slots[index] ?? null;
        const hero = profile.roster.find((candidate) => candidate.instanceId === heroId) ?? null;
        const card = heroCards.getChildByName(`HeroCard${index + 1}`);
        card && renderExpeditionHeroCard(card, hero, assets);
    }

    const editParty = campNode(contentRoot, CAMP_EXPEDITION_CONTENT_PATHS.editParty);
    editParty && configureExistingButton(editParty, {
        text: '编辑队伍',
        onClick: actions.editParty,
    });
    renderExpeditionPartyTabs(partyTabs, state, config.maxPartyPresets, assets, actions);
    const toolbar = campNode(contentRoot, CAMP_EXPEDITION_CONTENT_PATHS.toolbar);
    toolbar?.setPosition(-30.5, 16.5, 0);
    partyTabs.setPosition(0, 0, 0);
    const restore = campNode(contentRoot, CAMP_EXPEDITION_CONTENT_PATHS.restoreStamina);
    restore && configureExistingButton(restore, {
        text: '调息',
        enabled: false,
        onClick: actions.restoreStamina,
    });
    if (restore) restore.opacity = 0.72;

    const weight = loadoutWeight(state.loadout, config);
    const limit = partyBurdenLimit(preset.slots, expeditionHeroSnapshots(profile), config);
    const burdenSprite = burdenRow.getComponent(Sprite);
    if (burdenSprite) burdenSprite.enabled = false;
    burdenRow.setPosition(1, -20.5, 0);
    burdenRow.getComponent(UITransform)?.setContentSize(93, 20);
    burdenLabel.node.setPosition(-25, 0, 0);
    burdenLabel.node.getComponent(UITransform)?.setContentSize(43, 20);
    configureExistingLabel(
        burdenLabel,
        '负重：',
        16,
        EXPEDITION_COLORS.textSecondary,
        HorizontalTextAlignment.LEFT,
        { lineHeight: 16 },
    );
    const burdenValue = burdenRow.getChildByName('BurdenValue')?.getComponent(Label)
        ?? createLabel(
            burdenRow,
            'BurdenValue',
            '',
            21.5,
            0,
            50,
            20,
            16,
            EXPEDITION_COLORS.text,
            HorizontalTextAlignment.LEFT,
            { lineHeight: 20 },
        );
    burdenValue.node.setPosition(21.5, 0, 0);
    burdenValue.node.getComponent(UITransform)?.setContentSize(50, 20);
    configureExistingLabel(
        burdenValue,
        `${weight} / ${limit}`,
        16,
        weight > limit ? EXPEDITION_COLORS.warning : EXPEDITION_COLORS.text,
        HorizontalTextAlignment.LEFT,
        { lineHeight: 20 },
    );

    const paths: Readonly<Record<ExpeditionItemId, string>> = {
        spiritGrain: CAMP_EXPEDITION_CONTENT_PATHS.spiritGrainRow,
        pickaxe: CAMP_EXPEDITION_CONTENT_PATHS.pickaxeRow,
        lens: CAMP_EXPEDITION_CONTENT_PATHS.lensRow,
    };
    EXPEDITION_ITEM_IDS.forEach((itemId) => {
        const row = campNode(contentRoot, paths[itemId]);
        row && renderExpeditionLoadoutRow(row, itemId, profile, preset.slots, config, assets, actions);
    });
}
