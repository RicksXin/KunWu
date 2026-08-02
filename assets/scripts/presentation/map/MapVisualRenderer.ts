import {
    assetManager,
    Color,
    Graphics,
    JsonAsset,
    Node,
    TiledMap,
    TiledMapAsset,
    tween,
    UITransform,
    Vec3,
} from 'cc';
import { FogMap } from 'db://assets/scripts/domain/FogOfWar';
import { GridCoord } from 'db://assets/scripts/domain/GridCoord';
import {
    demoTileAt,
    parseDemoMapDefinition,
} from 'db://assets/scripts/domain/map/DemoMapDefinition';
import type {
    DemoMapDefinition,
    DemoMapObjectDefinition,
} from 'db://assets/scripts/domain/map/DemoMapDefinition';
import type { ExpeditionState } from 'db://assets/scripts/services/GameState';
import type { MapSceneNodes } from 'db://assets/scripts/presentation/map/MapSceneView';

export interface MapRenderOptions {
    readonly centerCamera?: boolean;
    readonly playerPosition?: GridCoord;
}

export async function loadDemoMapDefinition(): Promise<DemoMapDefinition> {
    const bundle = assetManager.getBundle('map_01');
    if (!bundle) throw new Error('map_01 Bundle 尚未加载');
    const value = await new Promise<unknown>((resolve, reject) => {
        bundle.load('map_01_demo', JsonAsset, (error, asset) => {
            if (error || !asset?.json) {
                reject(error ?? new Error('map_01_demo.json 为空'));
                return;
            }
            resolve(asset.json);
        });
    });
    return parseDemoMapDefinition(value);
}

export async function loadMapVisual(map: DemoMapDefinition, nodes: MapSceneNodes): Promise<void> {
    const bundle = assetManager.getBundle(map.id);
    if (!bundle) throw new Error(`${map.id} Bundle 尚未加载`);
    const asset = await new Promise<TiledMapAsset>((resolve, reject) => {
        bundle.load(map.visual.tiledMapAssetPath, TiledMapAsset, (error, loaded) => {
            if (error || !loaded) {
                reject(error ?? new Error('CC0 TiledMap 资源为空'));
                return;
            }
            resolve(loaded);
        });
    });

    nodes.terrainGraphics.clear();
    const component = nodes.tiledMapHost.getComponent(TiledMap) ?? nodes.tiledMapHost.addComponent(TiledMap);
    component.tmxAsset = asset;
    const transform = nodes.tiledMapHost.getComponent(UITransform);
    transform?.setAnchorPoint(0, 0);
    const scale = map.visual.logicalTileSize / map.visual.sourceTileSize;
    nodes.tiledMapHost.setScale(scale, scale, 1);
    nodes.tiledMapHost.setPosition(0, 0, 0);
}

export function resizeMapWorld(map: DemoMapDefinition, nodes: MapSceneNodes): void {
    const width = map.activeWidth * map.visual.logicalTileSize;
    const height = map.activeHeight * map.visual.logicalTileSize;
    const layers = [
        nodes.world,
        nodes.terrainGraphics.node,
        nodes.tiledMapHost,
        nodes.fogGraphics.node,
        nodes.markerGraphics.node,
    ];
    layers.forEach((node) => node.getComponent(UITransform)?.setContentSize(width, height));
}

/** 免费素材未完成导入时仍保留可操作的像素灰盒。 */
export function renderFallbackTerrain(map: DemoMapDefinition, graphics: Graphics): void {
    graphics.clear();
    const size = map.visual.logicalTileSize;
    for (let y = 0; y < map.activeHeight; y += 1) {
        for (let x = 0; x < map.activeWidth; x += 1) {
            const tile = demoTileAt(map, { x, y });
            graphics.fillColor = tile.walkable
                ? tile.moveCost === 2
                    ? new Color(85, 79, 65, 255)
                    : new Color(102, 103, 91, 255)
                : new Color(43, 48, 49, 255);
            graphics.rect(x * size, y * size, size, size);
            graphics.fill();
            graphics.strokeColor = new Color(25, 29, 29, 120);
            graphics.lineWidth = 1;
            graphics.rect(x * size, y * size, size, size);
            graphics.stroke();
        }
    }
}

export function renderMapState(
    map: DemoMapDefinition,
    expedition: ExpeditionState,
    completedObjects: Readonly<Record<string, boolean>>,
    nodes: MapSceneNodes,
    options: MapRenderOptions = {},
): FogMap {
    const fog = FogMap.fromRevealed(map.activeWidth, map.activeHeight, expedition.revealedTiles);
    fog.revealAround(expedition.position, 2);
    renderFog(map, fog, nodes.fogGraphics);
    renderMarkers(map, fog, completedObjects, nodes.markerGraphics);
    renderPlayer(map, options.playerPosition ?? expedition.position, nodes);
    if (options.centerCamera !== false) centerOnPlayer(map, expedition.position, nodes);
    return fog;
}

export async function animateMapMove(
    map: DemoMapDefinition,
    from: GridCoord,
    to: GridCoord,
    nodes: MapSceneNodes,
): Promise<void> {
    placePlayerMarker(map, from, nodes.playerMarker);
    await tweenPosition(nodes.playerMarker, markerPosition(map, to), 0.16);
    await tweenPosition(nodes.world, cameraPosition(map, to, nodes), 0.1);
}

export function showMapObjectOverlay(
    nodes: MapSceneNodes,
    object: DemoMapObjectDefinition,
): void {
    nodes.encounterTitle.string = object.title;
    if (object.kind === 'enemy_group') {
        nodes.encounterMessage.string = `${object.description}\n战斗表现将在下一阶段接入。`;
    } else if (object.kind === 'treasure_chest' && object.reward) {
        nodes.encounterMessage.string = [
            object.description,
            `获得：${object.reward.itemName} ×${object.reward.amount}`,
            '临时战利品，安全返营后入库。',
        ].join('\n');
    } else {
        nodes.encounterMessage.string = object.description;
    }
    nodes.encounterRoot.active = true;
}

function renderFog(map: DemoMapDefinition, fog: FogMap, graphics: Graphics): void {
    graphics.clear();
    const size = map.visual.logicalTileSize;
    for (let y = 0; y < map.activeHeight; y += 1) {
        for (let x = 0; x < map.activeWidth; x += 1) {
            const state = fog.stateAt(new GridCoord(x, y));
            if (state !== 'VISIBLE') {
                graphics.fillColor = state === 'UNKNOWN'
                    ? new Color(4, 7, 10, 245)
                    : new Color(8, 11, 14, 150);
                graphics.rect(x * size, y * size, size, size);
                graphics.fill();
            }
            graphics.strokeColor = new Color(175, 183, 157, state === 'VISIBLE' ? 30 : 12);
            graphics.lineWidth = 1;
            graphics.rect(x * size, y * size, size, size);
            graphics.stroke();
        }
    }
}

function renderMarkers(
    map: DemoMapDefinition,
    fog: FogMap,
    completedObjects: Readonly<Record<string, boolean>>,
    graphics: Graphics,
): void {
    graphics.clear();
    const size = map.visual.logicalTileSize;
    const center = (value: number): number => (value + 0.5) * size;

    graphics.fillColor = new Color(77, 213, 192, 210);
    drawDiamond(graphics, center(map.entryX), center(map.entryY), 13);

    for (const object of map.objects) {
        const fogState = fog.stateAt(new GridCoord(object.x, object.y));
        if (object.kind === 'enemy_group') {
            if (fogState !== 'VISIBLE') continue;
            graphics.fillColor = new Color(204, 75, 61, 245);
            drawDiamond(graphics, center(object.x), center(object.y), 16);
        } else if (fogState !== 'UNKNOWN' && !completedObjects[`${map.id}.${object.id}`]) {
            if (object.kind === 'treasure_chest') {
                drawTreasureChest(graphics, center(object.x), center(object.y));
            } else {
                graphics.fillColor = new Color(174, 105, 214, 245);
                drawDiamond(graphics, center(object.x), center(object.y), 14);
            }
        }
    }
}

function renderPlayer(map: DemoMapDefinition, player: GridCoord, nodes: MapSceneNodes): void {
    const graphics = nodes.playerGraphics;
    graphics.clear();
    graphics.fillColor = new Color(93, 193, 235, 255);
    graphics.circle(0, 0, 14);
    graphics.fill();
    graphics.strokeColor = new Color(225, 245, 238, 255);
    graphics.lineWidth = 2;
    graphics.circle(0, 0, 14);
    graphics.stroke();
    placePlayerMarker(map, player, nodes.playerMarker);
}

function centerOnPlayer(map: DemoMapDefinition, player: GridCoord, nodes: MapSceneNodes): void {
    nodes.world.setPosition(cameraPosition(map, player, nodes));
}

function cameraPosition(map: DemoMapDefinition, player: GridCoord, nodes: MapSceneNodes): Vec3 {
    const tile = map.visual.logicalTileSize;
    const viewport = nodes.viewport.getComponent(UITransform)!.contentSize;
    const worldWidth = map.activeWidth * tile;
    const worldHeight = map.activeHeight * tile;
    const desiredX = -(player.x + 0.5) * tile;
    const desiredY = -(player.y + 0.5) * tile;
    const minX = viewport.width / 2 - worldWidth;
    const maxX = -viewport.width / 2;
    const minY = viewport.height / 2 - worldHeight;
    const maxY = -viewport.height / 2;
    return new Vec3(
        worldWidth <= viewport.width ? -worldWidth / 2 : clamp(desiredX, minX, maxX),
        worldHeight <= viewport.height ? -worldHeight / 2 : clamp(desiredY, minY, maxY),
        0,
    );
}

function markerPosition(map: DemoMapDefinition, player: GridCoord): Vec3 {
    const size = map.visual.logicalTileSize;
    return new Vec3((player.x + 0.5) * size, (player.y + 0.5) * size, 0);
}

function placePlayerMarker(map: DemoMapDefinition, player: GridCoord, marker: Node): void {
    marker.setPosition(markerPosition(map, player));
}

function tweenPosition(node: Node, position: Vec3, duration: number): Promise<void> {
    if (Vec3.squaredDistance(node.position, position) < 0.01) return Promise.resolve();
    return new Promise((resolve) => {
        tween(node)
            .to(duration, { position }, { easing: 'cubicOut' })
            .call(() => resolve())
            .start();
    });
}

function drawTreasureChest(graphics: Graphics, x: number, y: number): void {
    graphics.fillColor = new Color(221, 167, 60, 250);
    graphics.roundRect(x - 14, y - 10, 28, 21, 3);
    graphics.fill();
    graphics.strokeColor = new Color(255, 224, 136, 255);
    graphics.lineWidth = 2;
    graphics.moveTo(x - 14, y + 2);
    graphics.lineTo(x + 14, y + 2);
    graphics.moveTo(x, y - 10);
    graphics.lineTo(x, y + 11);
    graphics.stroke();
}

function drawDiamond(graphics: Graphics, x: number, y: number, radius: number): void {
    graphics.moveTo(x, y + radius);
    graphics.lineTo(x + radius, y);
    graphics.lineTo(x, y - radius);
    graphics.lineTo(x - radius, y);
    graphics.close();
    graphics.fill();
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}
