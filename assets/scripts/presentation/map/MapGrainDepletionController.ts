import { AppRoot } from 'db://assets/scripts/AppRoot';
import type { ExpeditionState } from 'db://assets/scripts/services/GameState';
import type { MapSceneNodes } from 'db://assets/scripts/presentation/map/MapSceneView';

export function hasPendingGrainDepletionDeath(
    expedition: ExpeditionState,
    depletionStepLimit: number,
): boolean {
    return expedition.remainingGrain === 0
        && expedition.grainDepletionSteps >= depletionStepLimit;
}

export async function finishGrainDepletionDeath(
    mapId: string,
    nodes: MapSceneNodes,
): Promise<void> {
    nodes.loadingLabel.string = '生机将绝，正在结算阵亡状态……';
    nodes.loadingRoot.active = true;
    const result = await AppRoot.instance.map.settleGrainDepletionDeath(mapId);
    if (!result.ok) {
        nodes.loadingLabel.string = `${result.message}\n请刷新后重试`;
        AppRoot.instance.showFeedback(result.message, 3);
        return;
    }
    await AppRoot.instance.router.replaceRoot({ pageId: 'camp' }, 'fade');
    AppRoot.instance.showFeedback('队伍生机断绝，阵亡修士已送入还魂殿', 4);
}
