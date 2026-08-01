import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BUILDING_IDS } from '../../assets/scripts/domain/HallBadges.ts';
import { CAMP_SYSTEM_ENTRY_IDS } from '../../assets/scripts/domain/CampBottomHud.ts';
import {
    CAMP_MODULES,
    CAMP_LING_PU_RESOURCE_ROW_IDS,
    CAMP_LING_PU_ROW_CHILD_PATHS,
    CAMP_PREFAB_PATHS,
    CAMP_SYSTEM_ENTRY_NODE_NAMES,
    campBuildingPath,
    campLingPuResourceRowPath,
    campModule,
    campSystemEntryPath,
} from '../../assets/scripts/domain/CampSceneContract.ts';

describe('CampSceneContract', () => {
    it('七个模块的 id 唯一', () => {
        const ids = CAMP_MODULES.map((module) => module.id);
        assert.equal(new Set(ids).size, ids.length);
        assert.equal(ids.length, 7);
    });

    it('每个模块都声明了 Presenter 与至少一条路径', () => {
        for (const module of CAMP_MODULES) {
            assert.match(module.presenter, /^assets\/scripts\/presentation\/.+\.ts$/);
            assert.match(module.prefabPath, /^assets\/bundles\/camp\/prefabs\/.+\.prefab$/);
            assert.ok(module.rootNode.length > 0, `${module.id} 缺少 rootNode`);
            assert.ok(module.sceneParent.length > 0, `${module.id} 缺少 sceneParent`);
            assert.ok(module.presenterPaths.length > 0, `${module.id} 没有声明任何节点路径`);
        }
    });

    it('模块根节点名互不重复，否则场景内按名查找会取错节点', () => {
        const roots = CAMP_MODULES.map((module) => module.rootNode);
        assert.equal(new Set(roots).size, roots.length);
    });

    it('同一模块内的路径不重复，且都是相对路径', () => {
        for (const module of CAMP_MODULES) {
            const paths = [...module.presenterPaths];
            assert.equal(
                new Set(paths).size,
                paths.length,
                `${module.id} 存在重复路径`,
            );
            for (const relPath of paths) {
                assert.ok(!relPath.startsWith('/'), `${relPath} 不应以 / 开头`);
                assert.ok(!relPath.endsWith('/'), `${relPath} 不应以 / 结尾`);
                assert.ok(
                    !relPath.startsWith(`${module.rootNode}/`),
                    `${relPath} 不应重复包含根节点名`,
                );
            }
        }
    });

    it('CAMP_PREFAB_PATHS 去重后覆盖全部模块', () => {
        const declared = new Set(CAMP_MODULES.map((module) => module.prefabPath));
        assert.deepEqual([...CAMP_PREFAB_PATHS].sort(), [...declared].sort());
        // WorldViewport 与 BuildingLayer 同属一个 Prefab，故文件数少于模块数
        assert.ok(CAMP_PREFAB_PATHS.length < CAMP_MODULES.length);
    });

    it('建筑模块覆盖全部七座建筑的主节点、状态与红点', () => {
        const paths = new Set(campModule('buildings').presenterPaths);
        for (const buildingId of BUILDING_IDS) {
            assert.ok(paths.has(campBuildingPath(buildingId)), `缺少 ${buildingId}`);
            assert.ok(paths.has(campBuildingPath(buildingId, 'State')), `缺少 ${buildingId} 状态`);
            assert.ok(paths.has(campBuildingPath(buildingId, 'Badge')), `缺少 ${buildingId} 红点`);
        }
    });

    it('底部模块覆盖全部系统入口，且节点名一一对应', () => {
        const paths = new Set(campModule('bottomHud').presenterPaths);
        for (const entryId of CAMP_SYSTEM_ENTRY_IDS) {
            assert.ok(paths.has(campSystemEntryPath(entryId)), `缺少入口 ${entryId}`);
        }
        const nodeNames = CAMP_SYSTEM_ENTRY_IDS.map((id) => CAMP_SYSTEM_ENTRY_NODE_NAMES[id]);
        assert.equal(new Set(nodeNames).size, nodeNames.length, '入口节点名重复');
    });

    it('灵圃模块声明五条可编辑资源栏及其全部内部节点', () => {
        const paths = new Set(campModule('lingPuPage').presenterPaths);
        assert.equal(CAMP_LING_PU_RESOURCE_ROW_IDS.length, 5);
        for (const resourceId of CAMP_LING_PU_RESOURCE_ROW_IDS) {
            assert.ok(paths.has(campLingPuResourceRowPath(resourceId)));
            for (const child of Object.keys(CAMP_LING_PU_ROW_CHILD_PATHS)) {
                assert.ok(
                    paths.has(
                        campLingPuResourceRowPath(
                            resourceId,
                            child as keyof typeof CAMP_LING_PU_ROW_CHILD_PATHS,
                        ),
                    ),
                    `缺少 ${resourceId}/${child}`,
                );
            }
        }
    });

    it('campModule 对未知 id 抛错，避免静默返回 undefined', () => {
        assert.throws(() => campModule('not_a_module'), /未知营地模块/);
    });
});
