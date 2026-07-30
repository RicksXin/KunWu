import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    importTiledMap,
    terrainAt,
    tiledRowToDomainY,
    TiledImportError,
} from 'db://assets/scripts/domain/TiledImport';
import type { TiledMapJson } from 'db://assets/scripts/domain/TiledImport';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
const SAMPLE_DIR = path.join(
    REPO_ROOT,
    'ThirdParty/DemoAssets/Environment/PunyDungeon_CC0/PUNY_DUNGEON_v1/Tiled',
);

/**
 * 3×2 的最小地图，图块号即「行号 * 10 + 列号」，
 * 便于直接断言 Y 翻转是否正确。
 *   Tiled 行 0（顶部）: 0, 1, 2
 *   Tiled 行 1（底部）: 10, 11, 12
 */
function makeTinyMap(overrides: Partial<TiledMapJson> = {}): TiledMapJson {
    return {
        width: 3,
        height: 2,
        tilewidth: 16,
        tileheight: 16,
        orientation: 'orthogonal',
        infinite: false,
        layers: [
            {
                name: 'terrain',
                type: 'tilelayer',
                width: 3,
                height: 2,
                data: [0, 1, 2, 10, 11, 12],
            },
        ],
        ...overrides,
    };
}

const OPTIONS = { mapId: 'map_01', nameKey: 'map.map_01' };

describe('tiledRowToDomainY', () => {
    test('顶行映射到最大 y', () => {
        assert.equal(tiledRowToDomainY(0, 64), 63);
    });

    test('底行映射到 y=0', () => {
        assert.equal(tiledRowToDomainY(63, 64), 0);
    });

    test('往返变换是自身的逆', () => {
        const height = 10;
        for (let row = 0; row < height; row += 1) {
            assert.equal(tiledRowToDomainY(tiledRowToDomainY(row, height), height), row);
        }
    });
});

describe('地形 Y 轴翻转', () => {
    test('Tiled 顶行成为领域层最高 y', () => {
        const { terrain } = importTiledMap(makeTinyMap(), OPTIONS);
        // Tiled 行 0 = [0,1,2]，height=2 故映射到 y=1
        assert.equal(terrainAt(terrain, 0, 1), 0);
        assert.equal(terrainAt(terrain, 1, 1), 1);
        assert.equal(terrainAt(terrain, 2, 1), 2);
    });

    test('Tiled 底行成为领域层 y=0', () => {
        const { terrain } = importTiledMap(makeTinyMap(), OPTIONS);
        assert.equal(terrainAt(terrain, 0, 0), 10);
        assert.equal(terrainAt(terrain, 1, 0), 11);
        assert.equal(terrainAt(terrain, 2, 0), 12);
    });

    test('越界访问抛错而非返回 0', () => {
        const { terrain } = importTiledMap(makeTinyMap(), OPTIONS);
        // 静默返回 0 会让「空格」与「越界」无法区分
        assert.throws(() => terrainAt(terrain, 3, 0), TiledImportError);
        assert.throws(() => terrainAt(terrain, 0, 2), TiledImportError);
        assert.throws(() => terrainAt(terrain, -1, 0), TiledImportError);
    });

    test('GID 的翻转标记被掩掉', () => {
        // 0x80000000 是水平翻转标记，实际图块号应为 5
        const source = makeTinyMap({
            layers: [
                {
                    name: 'terrain',
                    type: 'tilelayer',
                    width: 3,
                    height: 2,
                    data: [0x80000000 | 5, 0, 0, 0, 0, 0],
                },
            ],
        });
        const { terrain } = importTiledMap(source, OPTIONS);
        assert.equal(terrainAt(terrain, 0, 1), 5);
    });
});

describe('对象层像素 → 格子', () => {
    function withObjects(objects: readonly Record<string, unknown>[]): TiledMapJson {
        return makeTinyMap({
            width: 4,
            height: 4,
            layers: [
                {
                    name: 'terrain',
                    type: 'tilelayer',
                    width: 4,
                    height: 4,
                    data: new Array(16).fill(1),
                },
                { name: 'objects', type: 'objectgroup', objects: objects as never },
            ],
        });
    }

    test('像素坐标按格宽取整并翻转 Y', () => {
        const source = withObjects([
            {
                name: 'chest',
                x: 32,
                y: 16,
                point: true,
                properties: [
                    { name: 'object_id', value: 'chest_a' },
                    { name: 'kind', value: 'treasure_chest' },
                ],
            },
        ]);
        const { map } = importTiledMap(source, OPTIONS);
        // x: 32/16 = 列 2；y: 16/16 = 行 1 → height 4 故 y = 4-1-1 = 2
        assert.equal(map.objects[0]?.x, 2);
        assert.equal(map.objects[0]?.y, 2);
    });

    test('格内偏移的像素坐标归入同一格', () => {
        const source = withObjects([
            {
                name: 'chest',
                x: 40,
                y: 24,
                point: true,
                properties: [
                    { name: 'object_id', value: 'chest_a' },
                    { name: 'kind', value: 'treasure_chest' },
                ],
            },
        ]);
        const { map } = importTiledMap(source, OPTIONS);
        // 40/16 = 2.5 → 列 2；24/16 = 1.5 → 行 1 → y = 2
        assert.equal(map.objects[0]?.x, 2);
        assert.equal(map.objects[0]?.y, 2);
    });

    test('缺少 object_id 抛错', () => {
        const source = withObjects([
            {
                name: 'nameless',
                x: 0,
                y: 0,
                properties: [{ name: 'kind', value: 'resource_node' }],
            },
        ]);
        assert.throws(() => importTiledMap(source, OPTIONS), /缺少字符串属性 object_id/);
    });

    test('kind 非法抛错', () => {
        const source = withObjects([
            {
                name: 'weird',
                x: 0,
                y: 0,
                properties: [
                    { name: 'object_id', value: 'weird_a' },
                    { name: 'kind', value: 'dragon_lair' },
                ],
            },
        ]);
        assert.throws(() => importTiledMap(source, OPTIONS), /kind 非法/);
    });

    test('kind 可回退到 Tiled 的 type 字段', () => {
        const source = withObjects([
            {
                name: 'node',
                type: 'resource_node',
                x: 0,
                y: 0,
                properties: [{ name: 'object_id', value: 'node_a' }],
            },
        ]);
        const { map } = importTiledMap(source, OPTIONS);
        assert.equal(map.objects[0]?.kind, 'resource_node');
    });

    test('initial_state 缺省为 HIDDEN', () => {
        const source = withObjects([
            {
                name: 'node',
                x: 0,
                y: 0,
                properties: [
                    { name: 'object_id', value: 'node_a' },
                    { name: 'kind', value: 'resource_node' },
                ],
            },
        ]);
        const { map } = importTiledMap(source, OPTIONS);
        assert.equal(map.objects[0]?.initialState, 'HIDDEN');
    });

    test('initial_state 非法抛错', () => {
        const source = withObjects([
            {
                name: 'node',
                x: 0,
                y: 0,
                properties: [
                    { name: 'object_id', value: 'node_a' },
                    { name: 'kind', value: 'resource_node' },
                    { name: 'initial_state', value: 'SLEEPING' },
                ],
            },
        ]);
        assert.throws(() => importTiledMap(source, OPTIONS), /initial_state 非法/);
    });

    test('对象 ID 重复抛错', () => {
        const source = withObjects([
            {
                x: 0,
                y: 0,
                properties: [
                    { name: 'object_id', value: 'dup' },
                    { name: 'kind', value: 'resource_node' },
                ],
            },
            {
                x: 16,
                y: 0,
                properties: [
                    { name: 'object_id', value: 'dup' },
                    { name: 'kind', value: 'resource_node' },
                ],
            },
        ]);
        assert.throws(() => importTiledMap(source, OPTIONS), /对象 ID 在地图内重复/);
    });

    test('跨图出口必须声明 target_map_id', () => {
        const source = withObjects([
            {
                x: 0,
                y: 0,
                properties: [
                    { name: 'object_id', value: 'exit_a' },
                    { name: 'kind', value: 'map_exit' },
                ],
            },
        ]);
        assert.throws(() => importTiledMap(source, OPTIONS), /缺少字符串属性 target_map_id/);
    });

    test('跨图出口读取 target_map_id 与 is_one_way', () => {
        const source = withObjects([
            {
                x: 0,
                y: 0,
                properties: [
                    { name: 'object_id', value: 'exit_a' },
                    { name: 'kind', value: 'map_exit' },
                    { name: 'target_map_id', value: 'map_02' },
                    { name: 'is_one_way', value: true },
                ],
            },
        ]);
        const { map } = importTiledMap(source, OPTIONS);
        assert.equal(map.objects[0]?.targetMapId, 'map_02');
        assert.equal(map.objects[0]?.isOneWay, true);
    });

    test('出口未声明 is_one_way 时给警告', () => {
        const source = withObjects([
            {
                x: 0,
                y: 0,
                properties: [
                    { name: 'object_id', value: 'exit_a' },
                    { name: 'kind', value: 'map_exit' },
                    { name: 'target_map_id', value: 'map_02' },
                ],
            },
        ]);
        const { warnings } = importTiledMap(source, OPTIONS);
        assert.ok(warnings.some((line) => /is_one_way/.test(line)));
    });

    test('跨多格的矩形对象给警告并取锚点格', () => {
        const source = withObjects([
            {
                x: 0,
                y: 16,
                width: 48,
                height: 32,
                properties: [
                    { name: 'object_id', value: 'big_a' },
                    { name: 'kind', value: 'enemy_group' },
                ],
            },
        ]);
        const { map, warnings } = importTiledMap(source, OPTIONS);
        assert.ok(warnings.some((line) => /跨越多个格子/.test(line)));
        assert.equal(map.objects[0]?.x, 0);
    });
});

describe('结构性校验', () => {
    test('非正交地图被拒', () => {
        assert.throws(
            () => importTiledMap(makeTinyMap({ orientation: 'isometric' }), OPTIONS),
            /只支持正交地图/,
        );
    });

    test('无限地图被拒', () => {
        assert.throws(() => importTiledMap(makeTinyMap({ infinite: true }), OPTIONS), /无限地图/);
    });

    test('缺少图块层被拒', () => {
        assert.throws(
            () => importTiledMap(makeTinyMap({ layers: [] }), OPTIONS),
            /不含任何图块层/,
        );
    });

    test('data 长度与尺寸不符被拒', () => {
        const source = makeTinyMap({
            layers: [
                { name: 'terrain', type: 'tilelayer', width: 3, height: 2, data: [1, 2, 3] },
            ],
        });
        assert.throws(() => importTiledMap(source, OPTIONS), /与尺寸 3×2 不符/);
    });

    test('base64 编码被拒并提示改用 CSV', () => {
        const source = makeTinyMap({
            layers: [
                {
                    name: 'terrain',
                    type: 'tilelayer',
                    width: 3,
                    height: 2,
                    encoding: 'base64',
                    data: [],
                },
            ],
        });
        assert.throws(() => importTiledMap(source, OPTIONS), /改用 CSV/);
    });

    test('指定的图块层不存在时抛错', () => {
        assert.throws(
            () => importTiledMap(makeTinyMap(), { ...OPTIONS, terrainLayerName: 'ground' }),
            /找不到图块层 ground/,
        );
    });

    test('尺寸非正整数被拒', () => {
        assert.throws(() => importTiledMap(makeTinyMap({ width: 0 }), OPTIONS), /width 必须为正整数/);
    });

    test('无对象层时给警告且对象为空', () => {
        const { map, warnings } = importTiledMap(makeTinyMap(), OPTIONS);
        assert.deepEqual(map.objects, []);
        assert.ok(warnings.some((line) => /不含对象层/.test(line)));
    });
});

describe('真实 Tiled 样例', () => {
    /** 样例来自 ThirdParty CC0 素材，确认解析器能吃真实导出文件。 */
    function loadSample(name: string): TiledMapJson {
        return JSON.parse(readFileSync(path.join(SAMPLE_DIR, name), 'utf8')) as TiledMapJson;
    }

    test('五张样例地图全部可解析', () => {
        for (let index = 1; index <= 5; index += 1) {
            const source = loadSample(`sample-map${index}.tmj`);
            const result = importTiledMap(source, {
                mapId: `sample_${index}`,
                nameKey: `map.sample_${index}`,
            });
            assert.equal(result.map.width, source.width);
            assert.equal(result.map.height, source.height);
            assert.equal(result.terrain.gids.length, source.width * source.height);
        }
    });

    test('样例地图的图块数据完整搬运', () => {
        const source = loadSample('sample-map1.tmj');
        const { terrain } = importTiledMap(source, OPTIONS);
        const layer = source.layers?.find((item) => item.type === 'tilelayer');
        const originalTopLeft = layer?.data?.[0] ?? 0;
        // Tiled 行 0 列 0 → 领域层 (0, height-1)
        assert.equal(terrainAt(terrain, 0, source.height - 1), originalTopLeft);
    });

    test('缺少 entry 属性时给警告', () => {
        const source = loadSample('sample-map1.tmj');
        const { warnings } = importTiledMap(source, OPTIONS);
        assert.ok(warnings.some((line) => /entry_x/.test(line)));
    });
});
