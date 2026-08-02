import { Node, UITransform } from 'cc';
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
    prepareExistingScrollViewport,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionUiFactory';
import {
    applyPanelBackground,
    createSpriteNode,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionVisualNodes';

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
    if (!layer || !panel || !title || !hint || !list || !close) {
        return;
    }
    layer.active = true;
    applyPanelBackground(panel, assets.panelFrame);
    configureExistingLabel(title, '选择禁地区域', 20, EXPEDITION_COLORS.text);
    configureExistingLabel(hint, '点击地图项目即发起传送', 12, EXPEDITION_COLORS.textSecondary);

    const viewport = prepareExistingScrollViewport(list);
    viewport.getComponent(UITransform)?.setContentSize(331, Math.max(612, maps.length * 101 + 8));
    maps.forEach((map, index) => renderMapRow(viewport, map, index, profile, assets, actions.selectMap));
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
        text: unlocked
            ? `${map.mapNumber}. ${expeditionText(map.nameKey)}\n灵息 ${map.staminaCost} · 灵粮/步 ${map.grainPerStep} · 最低携带 ${map.minimumCarriedGrain}`
            : `${map.mapNumber}. ${expeditionText(map.nameKey)}  ·  尚未解锁`,
        x: 0,
        y: -49 - index * 101,
        width: 319,
        height: 91,
        enabled: unlocked,
        onClick: () => selectMap(map),
    });
    button.label.fontSize = 13;
    button.label.lineHeight = 23;
    if (!unlocked && assets.lockFrame) {
        createSpriteNode(button.node, 'LockIcon', assets.lockFrame, -138, 0, 14, 14);
    }
}
