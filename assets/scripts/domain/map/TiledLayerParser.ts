import { MAP_OBJECT_KINDS, MAP_OBJECT_STATES } from '../MapTypes';
import type { MapObjectDefinition, MapObjectKind, MapObjectState } from '../MapTypes';
import { TiledImportError } from './TiledTypes';
import type {
    ImportedTerrainGrid,
    TiledLayerJson,
    TiledMapJson,
    TiledObjectJson,
    TiledProperty,
} from './TiledTypes';

const FLIP_FLAGS_MASK = 0x1fffffff;

export function readTiledProperties(
    properties: readonly TiledProperty[] | undefined,
): Map<string, unknown> {
    const map = new Map<string, unknown>();
    for (const property of properties ?? []) map.set(property.name, property.value);
    return map;
}

function requireString(properties: Map<string, unknown>, key: string, context: string): string {
    const value = properties.get(key);
    if (typeof value !== 'string' || value.length === 0) {
        throw new TiledImportError(`${context} 缺少字符串属性 ${key}`);
    }
    return value;
}

export function tiledRowToDomainY(row: number, mapHeight: number): number {
    return mapHeight - 1 - row;
}

export function parseTerrainLayer(
    source: TiledMapJson,
    layer: TiledLayerJson,
): ImportedTerrainGrid {
    if (layer.encoding === 'base64' || layer.compression) {
        throw new TiledImportError(
            `图块层 ${layer.name} 使用了 ${layer.compression ?? layer.encoding} 编码，请在 Tiled 中改用 CSV 导出`,
        );
    }
    if (!layer.data) throw new TiledImportError(`图块层 ${layer.name} 缺少 data`);
    const width = layer.width ?? source.width;
    const height = layer.height ?? source.height;
    if (layer.data.length !== width * height) {
        throw new TiledImportError(`图块层 ${layer.name} 的 data 长度 ${layer.data.length} 与尺寸 ${width}×${height} 不符`);
    }
    const gids = new Array<number>(width * height).fill(0);
    for (let row = 0; row < height; row += 1) {
        const domainY = tiledRowToDomainY(row, height);
        for (let column = 0; column < width; column += 1) {
            const raw = layer.data[row * width + column] ?? 0;
            gids[domainY * width + column] = raw & FLIP_FLAGS_MASK;
        }
    }
    return { width, height, gids };
}

function pixelToGrid(object: TiledObjectJson, source: TiledMapJson): { x: number; y: number } {
    const column = Math.floor(object.x / source.tilewidth);
    const row = Math.floor(object.y / source.tileheight);
    return { x: column, y: tiledRowToDomainY(row, source.height) };
}

export function parseTiledObject(
    object: TiledObjectJson,
    source: TiledMapJson,
    warnings: string[],
): MapObjectDefinition {
    const properties = readTiledProperties(object.properties);
    const label = object.name ?? `#${object.id ?? '?'}`;
    const context = `对象 ${label}`;
    const id = requireString(properties, 'object_id', context);
    const kindRaw = properties.get('kind') ?? object.type;
    if (typeof kindRaw !== 'string') throw new TiledImportError(`${context} 缺少 kind 属性`);
    if (!MAP_OBJECT_KINDS.includes(kindRaw as MapObjectKind)) {
        throw new TiledImportError(`${context} 的 kind 非法: ${kindRaw}`);
    }
    const kind = kindRaw as MapObjectKind;
    const stateRaw = properties.get('initial_state') ?? 'HIDDEN';
    if (!MAP_OBJECT_STATES.includes(stateRaw as MapObjectState)) {
        throw new TiledImportError(`${context} 的 initial_state 非法: ${String(stateRaw)}`);
    }
    const initialState = stateRaw as MapObjectState;
    const { x, y } = pixelToGrid(object, source);
    if ((object.width ?? 0) > source.tilewidth || (object.height ?? 0) > source.tileheight) {
        warnings.push(`${context} 跨越多个格子，已按锚点所在格 (${x}, ${y}) 处理`);
    }
    const base = { id, kind, x, y, initialState };
    if (kind !== 'map_exit') return base;
    const targetMapId = requireString(properties, 'target_map_id', context);
    const isOneWayRaw = properties.get('is_one_way');
    if (typeof isOneWayRaw !== 'boolean') {
        warnings.push(`${context} 未声明 is_one_way，UI 无法提示能否返回`);
        return { ...base, targetMapId };
    }
    return { ...base, targetMapId, isOneWay: isOneWayRaw };
}
