import type { GridCoord } from '../GridCoord';
import type { MapObjectDefinition, TileDefinition } from '../MapTypes';
import {
    isDemoMapObjectKind,
    parseDemoMapEventActions,
} from './DemoMapEvents';
import type { DemoMapEventActionId, DemoMapObjectKind } from './DemoMapEvents';

const WALKABLE_TILES: Readonly<Record<string, TileDefinition>> = {
    '.': {
        terrain: 'stone_floor',
        walkable: true,
        moveCost: 1,
        visionBlock: false,
        danger: 0,
        height: 0,
        tags: ['demo_floor'],
    },
    '~': {
        terrain: 'rubble',
        walkable: true,
        moveCost: 2,
        visionBlock: false,
        danger: 1,
        height: 0,
        tags: ['demo_rubble'],
    },
    'E': {
        terrain: 'active_teleporter',
        walkable: true,
        moveCost: 0,
        visionBlock: false,
        danger: 0,
        height: 0,
        tags: ['demo_entry'],
    },
};

const BLOCKED_TILE: TileDefinition = {
    terrain: 'sealed_wall',
    walkable: false,
    moveCost: 0,
    visionBlock: true,
    danger: 0,
    height: 1,
    tags: ['demo_wall'],
};

export interface DemoMapVisualConfig {
    readonly tiledMapAssetPath: string;
    readonly sourceTileSize: number;
    readonly logicalTileSize: number;
}

export interface DemoMapReward {
    readonly itemId: string;
    readonly itemName: string;
    readonly amount: number;
}

export interface DemoMapObjectDefinition extends MapObjectDefinition {
    readonly kind: DemoMapObjectKind;
    readonly title: string;
    readonly description: string;
    readonly eventActions: readonly DemoMapEventActionId[];
    readonly enemyId?: string;
    readonly inspectionText?: string;
    readonly dialogueText?: string;
    readonly smallTalkText?: string;
    readonly operationLabel?: string;
    readonly requiredItemId?: string;
    readonly requiredItemName?: string;
    readonly reward?: DemoMapReward;
}

export interface DemoMapDefinition {
    readonly id: string;
    readonly name: string;
    /** 正式地图坐标边界；D0 只开放左下角 active 区域。 */
    readonly width: number;
    readonly height: number;
    readonly activeWidth: number;
    readonly activeHeight: number;
    readonly entryX: number;
    readonly entryY: number;
    /** 自上而下存储，领域坐标仍以左下角为原点。 */
    readonly terrainRows: readonly string[];
    readonly objects: readonly DemoMapObjectDefinition[];
    readonly visual: DemoMapVisualConfig;
}

type UnknownRecord = Record<string, unknown>;

export function parseDemoMapDefinition(value: unknown): DemoMapDefinition {
    const raw = recordOf(value, 'map_01_demo');
    const width = positiveInteger(raw.width, 'map_01_demo.width');
    const height = positiveInteger(raw.height, 'map_01_demo.height');
    const activeWidth = positiveInteger(raw.activeWidth, 'map_01_demo.activeWidth');
    const activeHeight = positiveInteger(raw.activeHeight, 'map_01_demo.activeHeight');
    if (activeWidth > width || activeHeight > height) {
        throw new Error('map_01_demo 的 D0 开放区域不得超过正式地图边界');
    }

    const terrainRows = stringArrayOf(raw.terrainRows, 'map_01_demo.terrainRows');
    if (terrainRows.length !== activeHeight) {
        throw new Error(`map_01_demo.terrainRows 应有 ${activeHeight} 行`);
    }
    terrainRows.forEach((row, index) => {
        if (row.length !== activeWidth) {
            throw new Error(`map_01_demo.terrainRows[${index}] 应有 ${activeWidth} 列`);
        }
        for (const symbol of row) {
            if (symbol !== '#' && !WALKABLE_TILES[symbol]) {
                throw new Error(`map_01_demo 使用了未知地形符号 ${symbol}`);
            }
        }
    });

    const entryX = nonNegativeInteger(raw.entryX, 'map_01_demo.entryX');
    const entryY = nonNegativeInteger(raw.entryY, 'map_01_demo.entryY');
    const visual = recordOf(raw.visual, 'map_01_demo.visual');
    const objects = objectArrayOf(raw.objects);
    const definition: DemoMapDefinition = {
        id: stringOf(raw.id, 'map_01_demo.id'),
        name: stringOf(raw.name, 'map_01_demo.name'),
        width,
        height,
        activeWidth,
        activeHeight,
        entryX,
        entryY,
        terrainRows,
        objects,
        visual: {
            tiledMapAssetPath: stringOf(
                visual.tiledMapAssetPath,
                'map_01_demo.visual.tiledMapAssetPath',
            ),
            sourceTileSize: positiveInteger(
                visual.sourceTileSize,
                'map_01_demo.visual.sourceTileSize',
            ),
            logicalTileSize: positiveInteger(
                visual.logicalTileSize,
                'map_01_demo.visual.logicalTileSize',
            ),
        },
    };
    if (!demoTileAt(definition, { x: entryX, y: entryY }).walkable) {
        throw new Error('map_01_demo 入口必须位于可通行格');
    }
    const objectIds = new Set<string>();
    for (const object of definition.objects) {
        if (objectIds.has(object.id)) throw new Error(`map_01_demo 对象 ID 重复：${object.id}`);
        objectIds.add(object.id);
        if (object.x >= activeWidth || object.y >= activeHeight) {
            throw new Error(`map_01_demo 对象 ${object.id} 位于 D0 开放区域之外`);
        }
        if (!demoTileAt(definition, object).walkable) {
            throw new Error(`map_01_demo 对象 ${object.id} 必须位于可通行格`);
        }
    }
    return definition;
}

export function demoTileAt(map: DemoMapDefinition, coord: Pick<GridCoord, 'x' | 'y'>): TileDefinition {
    if (coord.x < 0 || coord.y < 0 || coord.x >= map.activeWidth || coord.y >= map.activeHeight) {
        return BLOCKED_TILE;
    }
    const dataRow = map.activeHeight - 1 - coord.y;
    const symbol = map.terrainRows[dataRow]?.[coord.x] ?? '#';
    return WALKABLE_TILES[symbol] ?? BLOCKED_TILE;
}

export function demoObjectAt(
    map: DemoMapDefinition,
    coord: Pick<GridCoord, 'x' | 'y'>,
): DemoMapObjectDefinition | null {
    return map.objects.find((object) => object.x === coord.x && object.y === coord.y) ?? null;
}

function objectArrayOf(value: unknown): DemoMapObjectDefinition[] {
    if (!Array.isArray(value)) throw new Error('map_01_demo.objects 应为数组');
    return value.map((entry, index) => {
        const path = `map_01_demo.objects[${index}]`;
        const raw = recordOf(entry, path);
        const kindValue = stringOf(raw.kind, `${path}.kind`);
        if (!isDemoMapObjectKind(kindValue)) {
            throw new Error(`${path}.kind 当前不支持 ${kindValue}`);
        }
        const kind = kindValue;
        const reward = rewardOf(raw.reward, path);
        if (kind === 'treasure_chest' && !reward) {
            throw new Error(`${path}.reward 宝箱必须配置奖励`);
        }
        const object: DemoMapObjectDefinition = {
            id: stringOf(raw.id, `${path}.id`),
            kind,
            x: nonNegativeInteger(raw.x, `${path}.x`),
            y: nonNegativeInteger(raw.y, `${path}.y`),
            initialState: 'AVAILABLE',
            title: stringOf(raw.title, `${path}.title`),
            description: stringOf(raw.description, `${path}.description`),
            eventActions: parseDemoMapEventActions(raw.eventActions, kind, path),
            enemyId: optionalStringOf(raw.enemyId, `${path}.enemyId`),
            inspectionText: optionalStringOf(raw.inspectionText, `${path}.inspectionText`),
            dialogueText: optionalStringOf(raw.dialogueText, `${path}.dialogueText`),
            smallTalkText: optionalStringOf(raw.smallTalkText, `${path}.smallTalkText`),
            operationLabel: optionalStringOf(raw.operationLabel, `${path}.operationLabel`),
            requiredItemId: optionalStringOf(raw.requiredItemId, `${path}.requiredItemId`),
            requiredItemName: optionalStringOf(raw.requiredItemName, `${path}.requiredItemName`),
        };
        return reward ? { ...object, reward } : object;
    });
}

function rewardOf(value: unknown, path: string): DemoMapReward | undefined {
    if (value === undefined) return undefined;
    const reward = recordOf(value, `${path}.reward`);
    return {
        itemId: stringOf(reward.itemId, `${path}.reward.itemId`),
        itemName: stringOf(reward.itemName, `${path}.reward.itemName`),
        amount: positiveInteger(reward.amount, `${path}.reward.amount`),
    };
}

function recordOf(value: unknown, path: string): UnknownRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${path} 应为对象`);
    }
    return value as UnknownRecord;
}

function stringOf(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${path} 应为非空字符串`);
    return value;
}

function optionalStringOf(value: unknown, path: string): string | undefined {
    return value === undefined ? undefined : stringOf(value, path);
}

function stringArrayOf(value: unknown, path: string): string[] {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
        throw new Error(`${path} 应为字符串数组`);
    }
    return value as string[];
}

function nonNegativeInteger(value: unknown, path: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new Error(`${path} 应为非负整数`);
    }
    return value as number;
}

function positiveInteger(value: unknown, path: string): number {
    const result = nonNegativeInteger(value, path);
    if (result === 0) throw new Error(`${path} 应为正整数`);
    return result;
}
