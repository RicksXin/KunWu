import { Color } from 'cc';
import {
    currentExpeditionBurden,
    currentExpeditionBurdenLimit,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { ExpeditionPreparationConfig } from 'db://assets/scripts/domain/ExpeditionPreparation';
import { GridCoord } from 'db://assets/scripts/domain/GridCoord';
import {
    grainDepletionStage,
    grainDepletionStepsRemaining,
} from 'db://assets/scripts/domain/GrainDepletion';
import { tryMove } from 'db://assets/scripts/domain/Movement';
import { demoTileAt } from 'db://assets/scripts/domain/map/DemoMapDefinition';
import type { DemoMapDefinition } from 'db://assets/scripts/domain/map/DemoMapDefinition';
import type { ExpeditionState, Profile } from 'db://assets/scripts/services/GameState';
import { renderMapState } from 'db://assets/scripts/presentation/map/MapVisualRenderer';
import type { MapRenderOptions } from 'db://assets/scripts/presentation/map/MapVisualRenderer';
import { setMapButtonEnabled } from 'db://assets/scripts/presentation/map/MapSceneView';
import type { MapSceneNodes } from 'db://assets/scripts/presentation/map/MapSceneView';

export interface MapGrainDisplaySnapshot {
    readonly remainingGrain: number;
    readonly grainDepletionSteps: number;
}

export interface MapHudRenderOptions extends MapRenderOptions {
    readonly grainDisplay?: MapGrainDisplaySnapshot;
}

export function captureMapGrainDisplay(expedition: ExpeditionState): MapGrainDisplaySnapshot {
    return {
        remainingGrain: expedition.remainingGrain,
        grainDepletionSteps: expedition.grainDepletionSteps,
    };
}

export function renderMapHud(
    map: DemoMapDefinition,
    profile: Profile,
    config: ExpeditionPreparationConfig,
    nodes: MapSceneNodes,
    options?: MapHudRenderOptions,
): void {
    const expedition = profile.expedition;
    if (!expedition) return;
    renderMapState(map, expedition, profile.completedMapObjects ?? {}, nodes, options);
    nodes.titlePositionLabel.string = `${map.name}（${expedition.position.x},${expedition.position.y}）`;
    const heroes = profile.roster.map((hero) => ({
        instanceId: hero.instanceId,
        isDead: hero.isDead,
        stamina: hero.stamina,
        attributes: hero.attributes,
    }));
    const burden = currentExpeditionBurden(expedition, config);
    const burdenLimit = currentExpeditionBurdenLimit(expedition, heroes, config);
    nodes.burdenLabel.string = `负重 ${burden}/${burdenLimit}`;
    renderGrainState(
        options?.grainDisplay ?? captureMapGrainDisplay(expedition),
        config.field.grainDepletionStepLimit,
        nodes,
    );
    const talismanCount = profile.inventory[config.field.returnTalismanItemId] ?? 0;
    nodes.returnButtonLabel.string = '归营';
    nodes.hintLabel.string = `归营符 ${talismanCount} · 休整 ${expedition.restUsesRemaining}`;

    const inputEnabled = !expedition.isResting;
    setMapButtonEnabled(nodes.restButton, inputEnabled && expedition.restUsesRemaining > 0);
    setMapButtonEnabled(nodes.returnButton, inputEnabled);
    setMapButtonEnabled(nodes.upButton, inputEnabled && canMove(map, expedition, 0, 1, config.field.grainDepletionStepLimit));
    setMapButtonEnabled(nodes.downButton, inputEnabled && canMove(map, expedition, 0, -1, config.field.grainDepletionStepLimit));
    setMapButtonEnabled(nodes.leftButton, inputEnabled && canMove(map, expedition, -1, 0, config.field.grainDepletionStepLimit));
    setMapButtonEnabled(nodes.rightButton, inputEnabled && canMove(map, expedition, 1, 0, config.field.grainDepletionStepLimit));
}

function renderGrainState(
    display: MapGrainDisplaySnapshot,
    stepLimit: number,
    nodes: MapSceneNodes,
): void {
    const stage = grainDepletionStage(
        display.remainingGrain,
        display.grainDepletionSteps,
        stepLimit,
    );
    const labels = {
        supplied: `灵粮：${display.remainingGrain}`,
        grain_exhausted: '断粮',
        vitality_deficit: '气血亏空',
        labored_step: '步履维艰',
        life_exhausted: '生机将绝',
    } as const;
    nodes.grainLabel.string = labels[stage];
    nodes.grainLabel.color = stage === 'supplied'
        ? new Color(219, 203, 132)
        : new Color(237, 137, 91);
    nodes.grainWarningRoot.active = stage !== 'supplied';
    if (stage !== 'supplied') {
        const steps = grainDepletionStepsRemaining(display.grainDepletionSteps, stepLimit);
        nodes.grainWarningLabel.string = `警告：灵粮已尽，护体灵息仅可支撑 ${steps} 步`;
    }
}

function canMove(
    map: DemoMapDefinition,
    expedition: ExpeditionState,
    dx: number,
    dy: number,
    grainDepletionStepLimit: number,
): boolean {
    const from = expedition.position;
    const to = new GridCoord(from.x + dx, from.y + dy);
    return tryMove({
        from,
        to,
        bounds: { width: map.width, height: map.height },
        tile: demoTileAt(map, to),
        remainingGrain: expedition.remainingGrain,
        grainDepletionSteps: expedition.grainDepletionSteps,
        grainDepletionStepLimit,
    }).ok;
}
