import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    adjustWorkerAssignment,
    createInitialStorageLevels,
    migratedWorkerCount,
    parseLingPuConfig,
    previewStorageUpgrade,
    recruitWorkers,
    storageCapacities,
    upgradeStorage,
} from 'db://assets/scripts/domain/LingPu';
import { createAssignment } from 'db://assets/scripts/domain/Production';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

function loadConfig() {
    const raw = JSON.parse(
        readFileSync(
            path.join(REPO_ROOT, 'assets/bundles/shared/ling_pu_config.json'),
            'utf8',
        ),
    ) as { ling_pu: unknown };
    return parseLingPuConfig(raw.ling_pu);
}

describe('灵圃数据配置', () => {
    test('新档杂役、招募和三种资源容量均来自数据表', () => {
        const config = loadConfig();
        assert.equal(config.initialWorkerCount, 6);
        assert.equal(config.workersPerRecruit, 5);
        assert.ok(config.recruitSpiritGrainCost > 0);
        const levels = createInitialStorageLevels(config);
        const capacities = storageCapacities(levels, config);
        assert.ok((capacities.spiritGrain ?? 0) > 0);
        assert.ok((capacities.spiritWood ?? 0) > 0);
        assert.ok((capacities.darkIron ?? 0) > 0);
    });

    test('容量不递增时拒绝配置', () => {
        assert.throws(
            () =>
                parseLingPuConfig({
                    initialWorkerCount: 6,
                    workersPerRecruit: 5,
                    recruitSpiritGrainCost: 50,
                    resources: {
                        spiritGrain: {
                            initialLevel: 1,
                            capacities: [100, 100],
                            upgradeSpiritWoodCosts: [20],
                        },
                        spiritWood: {
                            initialLevel: 1,
                            capacities: [100],
                            upgradeSpiritWoodCosts: [],
                        },
                        darkIron: {
                            initialLevel: 1,
                            capacities: [100],
                            upgradeSpiritWoodCosts: [],
                        },
                    },
                }),
            /严格递增/,
        );
    });
});

describe('杂役分配与招募', () => {
    test('有空闲杂役时 +1 立即生效', () => {
        const result = adjustWorkerAssignment(
            createAssignment({ spiritGrain: 2 }),
            6,
            'spiritWood',
            1,
        );
        assert.equal(result.ok, true);
        assert.equal(result.value.spiritWood, 1);
    });

    test('没有空闲杂役时拒绝继续增加', () => {
        const assignment = createAssignment({ spiritGrain: 6 });
        const result = adjustWorkerAssignment(assignment, 6, 'spiritWood', 1);
        assert.equal(result.ok, false);
        assert.equal(result.failure, 'no_idle_worker');
        assert.equal(result.value, assignment);
    });

    test('岗位为 0 时拒绝减少', () => {
        const assignment = createAssignment();
        const result = adjustWorkerAssignment(assignment, 6, 'darkIron', -1);
        assert.equal(result.ok, false);
        assert.equal(result.failure, 'job_empty');
    });

    test('灵粮充足时原子扣粮并增加 5 名杂役', () => {
        const config = loadConfig();
        const result = recruitWorkers(6, config.recruitSpiritGrainCost, config);
        assert.equal(result.ok, true);
        assert.equal(result.value.workerCount, 11);
        assert.equal(result.value.spiritGrain, 0);
    });

    test('灵粮不足时数据完全不变', () => {
        const config = loadConfig();
        const result = recruitWorkers(6, config.recruitSpiritGrainCost - 1, config);
        assert.equal(result.ok, false);
        assert.deepEqual(result.value, {
            workerCount: 6,
            spiritGrain: config.recruitSpiritGrainCost - 1,
        });
    });
});

describe('资源储量升级', () => {
    test('预览显示当前上限、下一级上限和灵木费用', () => {
        const config = loadConfig();
        const levels = createInitialStorageLevels(config);
        const preview = previewStorageUpgrade(levels, 'spiritGrain', 999, config);
        assert.equal(preview.currentLevel, 1);
        assert.ok((preview.nextCapacity ?? 0) > preview.currentCapacity);
        assert.ok((preview.spiritWoodCost ?? 0) > 0);
        assert.equal(preview.canAfford, true);
    });

    test('升级灵木自身也会扣除灵木', () => {
        const config = loadConfig();
        const levels = createInitialStorageLevels(config);
        const preview = previewStorageUpgrade(levels, 'spiritWood', 999, config);
        const result = upgradeStorage(levels, 'spiritWood', 999, config);
        assert.equal(result.ok, true);
        assert.equal(result.value.levels.spiritWood, 2);
        assert.equal(result.value.spiritWood, 999 - preview.spiritWoodCost!);
    });

    test('灵木不足时等级和库存不变', () => {
        const config = loadConfig();
        const levels = createInitialStorageLevels(config);
        const result = upgradeStorage(levels, 'darkIron', 0, config);
        assert.equal(result.ok, false);
        assert.equal(result.failure, 'insufficient_spirit_wood');
        assert.deepEqual(result.value.levels, levels);
        assert.equal(result.value.spiritWood, 0);
    });

    test('满级后不可继续升级', () => {
        const config = loadConfig();
        const maxLevel = config.resources.spiritGrain.capacities.length;
        const result = upgradeStorage(
            { spiritGrain: maxLevel },
            'spiritGrain',
            99999,
            config,
        );
        assert.equal(result.ok, false);
        assert.equal(result.failure, 'max_storage_level');
    });
});

describe('旧档杂役迁移', () => {
    test('无分配时补为初始 6 人', () => {
        assert.equal(migratedWorkerCount({}, 6), 6);
    });

    test('旧档已分配超过初始数时保留足够总人数', () => {
        assert.equal(
            migratedWorkerCount({ spiritGrain: 5, spiritWood: 4 }, 6),
            9,
        );
    });
});
