/**
 * Tiled TMJ 解析与固定对象导入（PRD-05 §2、任务 P0-MAP-001）。
 *
 * 纯函数、无引擎依赖：输入已解析的 JSON 对象，输出领域层地图模型，
 * 因此可直接单测，也可在构建期做校验。
 *
 * 两个坐标系差异必须在此处理干净，不能泄漏到领域层：
 *
 *   1. Y 轴方向
 *      Tiled 的第 0 行在顶部（y 向下）；本作 GridCoord 的 y+1 为上方
 *      （与 Cocos 一致，见 GridCoord.neighbors）。
 *      故 domainY = height - 1 - tiledRow。
 *
 *   2. 像素与格子
 *      Tiled 对象层用像素坐标，领域层只认格子（技术方案 §9.1）。
 *      换算在此完成，领域层不再见到像素值。
 */

import type { MapDefinition, MapObjectDefinition, MapObjectKind, MapObjectState } from './MapTypes';
import { MAP_OBJECT_KINDS, MAP_OBJECT_STATES } from './MapTypes';

/** Tiled GID 高三位是翻转标记，取实际图块号前必须掩掉。 */
const FLIP_FLAGS_MASK = 0x1fffffff;

/** TMJ 中与本作相关的字段。宽松定义：Tiled 会写入大量本作不用的字段。 */
export interface TiledMapJson {
    readonly width: number;
    readonly height: number;
    readonly tilewidth: number;
    readonly tileheight: number;
    readonly orientation?: string;
    readonly infinite?: boolean;
    readonly layers?: readonly TiledLayerJson[];
}

export interface TiledLayerJson {
    readonly name: string;
    readonly type: string;
    readonly width?: number;
    readonly height?: number;
    readonly data?: readonly number[];
    readonly encoding?: string;
    readonly compression?: string;
    readonly objects?: readonly TiledObjectJson[];
    readonly properties?: readonly TiledProperty[];
}

export interface TiledObjectJson {
    readonly id?: number;
    readonly name?: string;
    readonly type?: string;
    /** 像素坐标。Tiled 中 point 对象的锚点即该点。 */
    readonly x: number;
    readonly y: number;
    readonly width?: number;
    readonly height?: number;
    readonly point?: boolean;
    readonly properties?: readonly TiledProperty[];
}

export interface TiledProperty {
    readonly name: string;
    readonly type?: string;
    readonly value: unknown;
}

export interface TiledImportOptions {
    /** 地图 ID，由调用方给出——TMJ 文件里没有这个概念。 */
    readonly mapId: string;
    readonly nameKey: string;
    /** 作为地形来源的图块层名。缺省取第一个图块层。 */
    readonly terrainLayerName?: string;
    /** 存放固定对象的对象层名。缺省取第一个对象层。 */
    readonly objectLayerName?: string;
}

export interface ImportedTerrainGrid {
    readonly width: number;
    readonly height: number;
    /**
     * 按领域层坐标存放的图块号（已掩掉翻转标记，0 表示空）。
     * 索引方式见 terrainAt。
     */
    readonly gids: readonly number[];
}

export interface TiledImportResult {
    readonly map: MapDefinition;
    readonly terrain: ImportedTerrainGrid;
    /** 解析过程中的非致命问题，供构建日志展示。 */
    readonly warnings: readonly string[];
}

export class TiledImportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TiledImportError';
    }
}

/** 按领域层坐标取图块号。y 向上，(0,0) 在左下。 */
export function terrainAt(grid: ImportedTerrainGrid, x: number, y: number): number {
    if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) {
        throw new TiledImportError(`坐标 (${x}, ${y}) 超出地形范围 ${grid.width}×${grid.height}`);
    }
    return grid.gids[y * grid.width + x] ?? 0;
}

function readProperties(properties: readonly TiledProperty[] | undefined): Map<string, unknown> {
    const map = new Map<string, unknown>();
    for (const property of properties ?? []) {
        map.set(property.name, property.value);
    }
    return map;
}

function requireString(
    properties: Map<string, unknown>,
    key: string,
    context: string,
): string {
    const value = properties.get(key);
    if (typeof value !== 'string' || value.length === 0) {
        throw new TiledImportError(`${context} 缺少字符串属性 ${key}`);
    }
    return value;
}

/**
 * Tiled 行号 → 领域层 y。
 * 单独成函数并导出，便于测试直接验证翻转正确。
 */
export function tiledRowToDomainY(row: number, mapHeight: number): number {
    return mapHeight - 1 - row;
}

function parseTerrainLayer(
    source: TiledMapJson,
    layer: TiledLayerJson,
): ImportedTerrainGrid {
    if (layer.encoding === 'base64' || layer.compression) {
        // base64/zlib 需要额外解码，Tiled 导出时选 CSV 即可避免
        throw new TiledImportError(
            `图块层 ${layer.name} 使用了 ${layer.compression ?? layer.encoding} 编码，请在 Tiled 中改用 CSV 导出`,
        );
    }
    if (!layer.data) {
        throw new TiledImportError(`图块层 ${layer.name} 缺少 data`);
    }

    const width = layer.width ?? source.width;
    const height = layer.height ?? source.height;
    if (layer.data.length !== width * height) {
        throw new TiledImportError(
            `图块层 ${layer.name} 的 data 长度 ${layer.data.length} 与尺寸 ${width}×${height} 不符`,
        );
    }

    // 翻转 Y：Tiled 第 0 行在顶部，领域层 y=height-1 在顶部
    const gids = new Array<number>(width * height).fill(0);
    for (let row = 0; row < height; row += 1) {
        const domainY = tiledRowToDomainY(row, height);
        for (let col = 0; col < width; col += 1) {
            const raw = layer.data[row * width + col] ?? 0;
            gids[domainY * width + col] = raw & FLIP_FLAGS_MASK;
        }
    }

    return { width, height, gids };
}

/**
 * 像素坐标 → 格子坐标。
 *
 * Tiled 的矩形对象以左上角为锚点、point 对象就是该点本身，
 * 两者都按所在格取整，再翻转 Y。
 */
function pixelToGrid(
    object: TiledObjectJson,
    source: TiledMapJson,
): { x: number; y: number } {
    const col = Math.floor(object.x / source.tilewidth);
    const row = Math.floor(object.y / source.tileheight);
    return { x: col, y: tiledRowToDomainY(row, source.height) };
}

function parseObject(
    object: TiledObjectJson,
    source: TiledMapJson,
    warnings: string[],
): MapObjectDefinition {
    const properties = readProperties(object.properties);
    const label = object.name ?? `#${object.id ?? '?'}`;
    const context = `对象 ${label}`;

    // 对象 ID 用自定义属性 object_id 而非 Tiled 的数字 id：
    // 后者在编辑中会变，而存档依赖稳定 ID（PRD-05 §7）
    const id = requireString(properties, 'object_id', context);

    const kindRaw = properties.get('kind') ?? object.type;
    if (typeof kindRaw !== 'string') {
        throw new TiledImportError(`${context} 缺少 kind 属性`);
    }
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

    // 占多格的矩形对象只取锚点所在格：队伍只占一个格（PRD-05 §2），
    // 多格语义在本作没有定义，静默取整会让策划以为生效了
    if ((object.width ?? 0) > source.tilewidth || (object.height ?? 0) > source.tileheight) {
        warnings.push(`${context} 跨越多个格子，已按锚点所在格 (${x}, ${y}) 处理`);
    }

    const base = { id, kind, x, y, initialState };

    if (kind !== 'map_exit') {
        return base;
    }

    // 跨图出口的目标与单向标记必须显式给出（PRD-05 §9）
    const targetMapId = requireString(properties, 'target_map_id', context);
    const isOneWayRaw = properties.get('is_one_way');
    if (typeof isOneWayRaw !== 'boolean') {
        warnings.push(`${context} 未声明 is_one_way，UI 无法提示能否返回`);
        return { ...base, targetMapId };
    }

    return { ...base, targetMapId, isOneWay: isOneWayRaw };
}

/**
 * 解析 TMJ 为领域层地图。
 *
 * 遇到结构性问题直接抛错而非返回部分结果：
 * 坐标错位的地图能跑起来，但会在玩到那一格时才暴露。
 */
export function importTiledMap(
    source: TiledMapJson,
    options: TiledImportOptions,
): TiledImportResult {
    const warnings: string[] = [];

    if (source.orientation && source.orientation !== 'orthogonal') {
        throw new TiledImportError(
            `只支持正交地图，收到 ${source.orientation}（PRD-05 §2：方格大地图）`,
        );
    }
    if (source.infinite) {
        // 无限地图的图块数据存在 chunks 里，且与固定坐标原则冲突
        throw new TiledImportError('不支持无限地图，请在 Tiled 中设为固定尺寸');
    }
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
        throw new TiledImportError(
            options.terrainLayerName
                ? `找不到图块层 ${options.terrainLayerName}`
                : '地图不含任何图块层',
        );
    }

    const terrain = parseTerrainLayer(source, terrainLayer);

    const objectLayer = options.objectLayerName
        ? objectLayers.find((layer) => layer.name === options.objectLayerName)
        : objectLayers[0];
    if (options.objectLayerName && !objectLayer) {
        throw new TiledImportError(`找不到对象层 ${options.objectLayerName}`);
    }
    if (!objectLayer) {
        warnings.push('地图不含对象层，固定对象为空');
    }

    const objects = (objectLayer?.objects ?? []).map((object) =>
        parseObject(object, source, warnings),
    );

    // 对象 ID 在地图内必须唯一（PRD-05 §7）。此处即报，
    // 避免带着重复 ID 进入运行期后状态互相覆盖
    const seen = new Set<string>();
    for (const object of objects) {
        if (seen.has(object.id)) {
            throw new TiledImportError(`对象 ID 在地图内重复: ${object.id}`);
        }
        seen.add(object.id);
    }

    // 起始格由属性给出；缺省用地图中心，并给出警告
    const mapProperties = readProperties(terrainLayer.properties);
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
        warnings.push(
            `未声明 entry_x/entry_y，已取 (${resolvedEntryX}, ${resolvedEntryY})`,
        );
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
