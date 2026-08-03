import { fieldItemNameKey } from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { ExpeditionPreparationConfig } from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { ExpeditionState } from 'db://assets/scripts/services/GameState';
import { setMapButtonEnabled } from 'db://assets/scripts/presentation/map/MapSceneView';
import type { MapSceneNodes } from 'db://assets/scripts/presentation/map/MapSceneView';
import { mapText } from 'db://assets/scripts/presentation/map/MapText';

export function renderRestOverlay(
    expedition: ExpeditionState,
    config: ExpeditionPreparationConfig,
    nodes: MapSceneNodes,
): void {
    nodes.restRoot.active = expedition.isResting;
    if (!expedition.isResting) return;
    nodes.restChanceLabel.string = `后续剩余休整：${expedition.restUsesRemaining} 次`;
    const foods = config.field.foodItems
        .map((food) => `${mapText(food.nameKey)} ×${expedition.temporaryLoot[food.itemId] ?? 0}`)
        .join('  ·  ');
    nodes.restFoodLabel.string = `野外食材：${foods}`;
    nodes.restHealLabel.string = expedition.restHealingUsed
        ? '运功疗伤：本次已使用'
        : `运功疗伤：恢复 ${config.field.healingPercent}% 最大生命`;
    const hasFood = config.field.foodItems.some(
        (food) => (expedition.temporaryLoot[food.itemId] ?? 0) > 0,
    );
    setMapButtonEnabled(
        nodes.replenishButton,
        hasFood && expedition.remainingGrain < expedition.grainCapacity,
    );
    setMapButtonEnabled(nodes.healButton, !expedition.restHealingUsed);
}

export function renderBackpackOverlay(
    expedition: ExpeditionState,
    config: ExpeditionPreparationConfig,
    nodes: MapSceneNodes,
): void {
    const entries = Object.entries(expedition.temporaryLoot).filter(([, amount]) => amount > 0);
    nodes.backpackItemsLabel.string = entries.length === 0
        ? '尚未获得临时战利品'
        : entries.map(([itemId, amount]) => (
            `${mapText(fieldItemNameKey(itemId, config))} ×${amount}`
        )).join('\n');
}
