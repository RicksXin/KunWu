import {
    assetManager,
    Color,
    Graphics,
    Node,
    Sprite,
    SpriteFrame,
    UITransform,
} from 'cc';
import type { ExpeditionPreparationConfig } from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { ExpeditionState } from 'db://assets/scripts/services/GameState';
import {
    createMapLabel,
    createMapNode,
    createMapPanel,
} from 'db://assets/scripts/presentation/map/MapUiFactory';
import { setMapButtonEnabled } from 'db://assets/scripts/presentation/map/MapSceneView';
import type { MapSceneNodes } from 'db://assets/scripts/presentation/map/MapSceneView';
import { mapText } from 'db://assets/scripts/presentation/map/MapText';

const BACKPACK_COLUMNS = 5;
const BACKPACK_VISIBLE_SLOTS = 15;
const BACKPACK_SLOT_SIZE = 48;
const BACKPACK_SLOT_GAP = 8;
const BACKPACK_ITEM_ART: Readonly<Record<string, string>> = {
    pickaxe: 'ui/expedition/icon_expedition_pickaxe/spriteFrame',
    lens: 'ui/expedition/icon_expedition_lens/spriteFrame',
};
const itemFrameLoads = new Map<string, Promise<SpriteFrame | null>>();

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
    nodes: MapSceneNodes,
): void {
    const entries = Object.entries(expedition.temporaryLoot).filter(([, amount]) => amount > 0);
    clearGrid(nodes.backpackGridRoot);
    nodes.backpackEmptyLabel.node.active = entries.length === 0;
    entries.slice(0, BACKPACK_VISIBLE_SLOTS).forEach(([itemId, amount], index) => {
        createBackpackSlot(nodes.backpackGridRoot, itemId, amount, index);
    });
}

function clearGrid(root: Node): void {
    root.children.slice().forEach((child) => {
        child.removeFromParent();
        child.destroy();
    });
}

function createBackpackSlot(parent: Node, itemId: string, amount: number, index: number): void {
    const column = index % BACKPACK_COLUMNS;
    const row = Math.floor(index / BACKPACK_COLUMNS);
    const step = BACKPACK_SLOT_SIZE + BACKPACK_SLOT_GAP;
    const x = (column - (BACKPACK_COLUMNS - 1) / 2) * step;
    const y = 56 - row * step;
    const slot = createMapPanel(
        parent,
        `ItemSlot_${itemId}`,
        x,
        y,
        BACKPACK_SLOT_SIZE,
        BACKPACK_SLOT_SIZE,
        new Color(31, 34, 37, 255),
        new Color(126, 119, 91, 255),
    );
    const iconRoot = createMapNode(slot, `ItemIcon_${itemId}`, 0, 1, 36, 36);
    drawFallbackItemIcon(iconRoot, itemId);
    void applyItemFrame(iconRoot, itemId);
    const quantity = createMapPanel(
        slot, 'QuantityBadge', 14, -15, 25, 16,
        new Color(8, 10, 12, 235), new Color(196, 183, 137, 255),
    );
    createMapLabel(quantity, 'Quantity', `×${amount}`, 0, 0, 23, 14, 10, new Color(255, 244, 204));
}

function drawFallbackItemIcon(parent: Node, itemId: string): void {
    const graphics = parent.addComponent(Graphics);
    graphics.lineWidth = 2;
    graphics.strokeColor = new Color(224, 211, 168, 255);
    if (itemId === 'beast_meat') {
        graphics.fillColor = new Color(139, 62, 55, 255);
        graphics.roundRect(-13, -9, 26, 18, 7);
        graphics.fill();
        graphics.moveTo(8, 7);
        graphics.lineTo(15, 14);
        graphics.stroke();
        return;
    }
    if (itemId === 'bigu_cake') {
        graphics.fillColor = new Color(186, 145, 72, 255);
        graphics.roundRect(-13, -11, 26, 22, 5);
        graphics.fill();
        graphics.moveTo(-7, 0);
        graphics.lineTo(7, 0);
        graphics.moveTo(0, -6);
        graphics.lineTo(0, 6);
        graphics.stroke();
        return;
    }
    if (itemId === 'pickaxe') {
        graphics.moveTo(-12, -12);
        graphics.lineTo(11, 11);
        graphics.moveTo(-13, 8);
        graphics.lineTo(5, 14);
    } else if (itemId === 'lens') {
        graphics.circle(-2, 3, 10);
        graphics.moveTo(6, -5);
        graphics.lineTo(14, -13);
    } else {
        graphics.moveTo(0, 14);
        graphics.lineTo(14, 0);
        graphics.lineTo(0, -14);
        graphics.lineTo(-14, 0);
        graphics.close();
    }
    graphics.stroke();
}

async function applyItemFrame(target: Node, itemId: string): Promise<void> {
    const path = BACKPACK_ITEM_ART[itemId];
    if (!path) return;
    const frame = await loadItemFrame(path);
    if (!frame || !target.isValid) return;
    const graphics = target.getComponent(Graphics);
    if (graphics) graphics.enabled = false;
    const sprite = target.getComponent(Sprite) ?? target.addComponent(Sprite);
    sprite.spriteFrame = frame;
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    // 现有物品图标为 72×72 (@3x)，按 24×24 逻辑尺寸显示以保持像素对齐。
    target.getComponent(UITransform)?.setContentSize(24, 24);
}

function loadItemFrame(path: string): Promise<SpriteFrame | null> {
    const cached = itemFrameLoads.get(path);
    if (cached) return cached;
    const task = new Promise<SpriteFrame | null>((resolve) => {
        const bundle = assetManager.getBundle('camp');
        if (!bundle) {
            resolve(null);
            return;
        }
        bundle.load(path, SpriteFrame, (error, frame) => resolve(error ? null : frame ?? null));
    });
    itemFrameLoads.set(path, task);
    return task;
}
