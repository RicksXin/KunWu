/** Tiled TMJ → 领域地图的稳定公共入口（PRD-05 §2）。 */

import type { MapDefinition } from './MapTypes';
import {
    parseTerrainLayer,
    parseTiledObject,
    readTiledProperties,
} from './map/TiledLayerParser';
import { TiledImportError } from './map/TiledTypes';
import type {
    ImportedTerrainGrid,
    TiledImportOptions,
    TiledImportResult,
    TiledMapJson,
} from './map/TiledTypes';

export { tiledRowToDomainY } from './map/TiledLayerParser';
export { TiledImportError } from './map/TiledTypes';
export type {
    ImportedTerrainGrid,
    TiledImportOptions,
    TiledImportResult,
    TiledLayerJson,
    TiledMapJson,
    TiledObjectJson,
    TiledProperty,
} from './map/TiledTypes';

/** 按领域层坐标取图块号。y 向上，(0,0) 在左下。 */
export function terrainAt(grid: ImportedTerrainGrid, x: number, y: number): number {
    if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) {
        throw new TiledImportError(`坐标 (${x}, ${y}) 超出地形范围 ${grid.width}×${grid.height}`);
    }
    return grid.gids[y * grid.width + x] ?? 0;
}

export function importTiledMap(
    source: TiledMapJson,
    options: TiledImportOptions,
): TiledImportResult {
    const warnings: string[] = [];
    if (source.orientation && source.orientation !== 'orthogonal') {
        throw new TiledImportError(`只支持正交地图，收到 ${source.orientation}（PRD-05 §2：方格大地图）`);
    }
    if (source.infinite) throw new TiledImportError('不支持无限地图，请在 Tiled 中设为固定尺寸');
    for (const [field, value] of [
        ['width', source.width],
        ['height', source.height],
        ['tilewidth', source.tilewidth],
        ['tileheight', source.tileheight],
    ] as const) {
        if (!Number.isInteger(value) || value <= 0) {
            throw new TiledImportError(`${field} 必须为正整数，收到 ${value}`);
        }
    }

    const layers = source.layers ?? [];
    const tileLayers = layers.filter((layer) => layer.type === 'tilelayer');
    const objectLayers = layers.filter((layer) => layer.type === 'objectgroup');
    const terrainLayer = options.terrainLayerName
        ? tileLayers.find((layer) => layer.name === options.terrainLayerName)
        : tileLayers[0];
    if (!terrainLayer) {
        throw new TiledImportError(options.terrainLayerName
            ? `找不到图块层 ${options.terrainLayerName}`
            : '地图不含任何图块层');
    }
    const terrain = parseTerrainLayer(source, terrainLayer);
    const objectLayer = options.objectLayerName
        ? objectLayers.find((layer) => layer.name === options.objectLayerName)
        : objectLayers[0];
    if (options.objectLayerName && !objectLayer) {
        throw new TiledImportError(`找不到对象层 ${options.objectLayerName}`);
    }
    if (!objectLayer) warnings.push('地图不含对象层，固定对象为空');
    const objects = (objectLayer?.objects ?? []).map((object) => parseTiledObject(object, source, warnings));
    const seen = new Set<string>();
    for (const object of objects) {
        if (seen.has(object.id)) throw new TiledImportError(`对象 ID 在地图内重复: ${object.id}`);
        seen.add(object.id);
    }

    const mapProperties = readTiledProperties(terrainLayer.properties);
    const entryX = mapProperties.get('entry_x');
    const entryY = mapProperties.get('entry_y');
    let resolvedEntryX: number;
    let resolvedEntryY: number;
    if (typeof entryX === 'number' && typeof entryY === 'number') {
        resolvedEntryX = entryX;
        resolvedEntryY = entryY;
    } else {
        resolvedEntryX = Math.floor(source.width / 2);
        resolvedEntryY = 0;
        warnings.push(`未声明 entry_x/entry_y，已取 (${resolvedEntryX}, ${resolvedEntryY})`);
    }
    const map: MapDefinition = {
        id: options.mapId,
        nameKey: options.nameKey,
        width: source.width,
        height: source.height,
        entryX: resolvedEntryX,
        entryY: resolvedEntryY,
        objects,
    };
    return { map, terrain, warnings };
}
