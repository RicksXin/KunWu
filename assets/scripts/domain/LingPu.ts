import {
    PRODUCTION_JOBS,
    createAssignment,
    totalWorkers,
} from './Production';
import type { ProductionJob, WorkerAssignment } from './Production';
import { P1_LING_PU_JOBS } from './production/LingPuConfig';
import type {
    LingPuConfig,
    LingPuMutationResult,
    P1LingPuJob,
    ResourceStorageLevels,
    StorageUpgradePreview,
} from './production/LingPuConfig';

export {
    LING_PU_CONFIG_ID,
    LING_PU_CONFIG_TABLE,
    P1_LING_PU_JOBS,
    parseLingPuConfig,
} from './production/LingPuConfig';
export type {
    LingPuConfig,
    LingPuMutationFailure,
    LingPuMutationResult,
    P1LingPuJob,
    ResourceStorageConfig,
    ResourceStorageLevels,
    StorageUpgradePreview,
} from './production/LingPuConfig';

export function isP1LingPuJob(job: ProductionJob): job is P1LingPuJob {
    return (P1_LING_PU_JOBS as readonly ProductionJob[]).includes(job);
}

export function createInitialStorageLevels(config: LingPuConfig): Record<string, number> {
    const levels: Record<string, number> = {};
    for (const job of P1_LING_PU_JOBS) {
        levels[job] = config.resources[job].initialLevel;
    }
    return levels;
}

export function storageLevel(
    levels: ResourceStorageLevels,
    job: P1LingPuJob,
    config: LingPuConfig,
): number {
    const level = levels[job] ?? config.resources[job].initialLevel;
    const maxLevel = config.resources[job].capacities.length;
    if (!Number.isSafeInteger(level) || level < 1 || level > maxLevel) {
        throw new Error(`资源 ${job} 的存储等级非法：${level}`);
    }
    return level;
}

export function storageCapacity(
    levels: ResourceStorageLevels,
    job: P1LingPuJob,
    config: LingPuConfig,
): number {
    const level = storageLevel(levels, job, config);
    return config.resources[job].capacities[level - 1]!;
}

export function storageCapacities(
    levels: ResourceStorageLevels,
    config: LingPuConfig,
): Partial<Record<ProductionJob, number>> {
    const result: Partial<Record<ProductionJob, number>> = {};
    for (const job of P1_LING_PU_JOBS) {
        result[job] = storageCapacity(levels, job, config);
    }
    return result;
}

export function previewStorageUpgrade(
    levels: ResourceStorageLevels,
    job: P1LingPuJob,
    spiritWood: number,
    config: LingPuConfig,
): StorageUpgradePreview {
    const currentLevel = storageLevel(levels, job, config);
    const resource = config.resources[job];
    const maxLevel = resource.capacities.length;
    const isMaxLevel = currentLevel >= maxLevel;
    const spiritWoodCost = isMaxLevel
        ? null
        : resource.upgradeSpiritWoodCosts[currentLevel - 1]!;
    return {
        job,
        currentLevel,
        maxLevel,
        currentCapacity: resource.capacities[currentLevel - 1]!,
        nextCapacity: isMaxLevel ? null : resource.capacities[currentLevel]!,
        spiritWoodCost,
        isMaxLevel,
        canAfford: spiritWoodCost !== null && spiritWood >= spiritWoodCost,
    };
}

/** 单次 +/- 立即生效；失败时原分配保持不变。 */
export function adjustWorkerAssignment(
    assignment: WorkerAssignment,
    workerCount: number,
    job: P1LingPuJob,
    delta: -1 | 1,
): LingPuMutationResult<WorkerAssignment> {
    if (!Number.isSafeInteger(workerCount) || workerCount < 0) {
        throw new Error(`杂役总数必须为非负安全整数，收到 ${workerCount}`);
    }
    const current = assignment[job];
    if (delta < 0 && current === 0) {
        return { ok: false, value: assignment, failure: 'job_empty' };
    }
    if (delta > 0 && totalWorkers(assignment) >= workerCount) {
        return { ok: false, value: assignment, failure: 'no_idle_worker' };
    }
    return {
        ok: true,
        value: createAssignment({ ...assignment, [job]: current + delta }),
    };
}

export function recruitWorkers(
    workerCount: number,
    spiritGrain: number,
    config: LingPuConfig,
): LingPuMutationResult<{ readonly workerCount: number; readonly spiritGrain: number }> {
    if (spiritGrain < config.recruitSpiritGrainCost) {
        return {
            ok: false,
            value: { workerCount, spiritGrain },
            failure: 'insufficient_spirit_grain',
        };
    }
    return {
        ok: true,
        value: {
            workerCount: workerCount + config.workersPerRecruit,
            spiritGrain: spiritGrain - config.recruitSpiritGrainCost,
        },
    };
}

export function upgradeStorage(
    levels: ResourceStorageLevels,
    job: P1LingPuJob,
    spiritWood: number,
    config: LingPuConfig,
): LingPuMutationResult<{
    readonly levels: Record<string, number>;
    readonly spiritWood: number;
}> {
    const preview = previewStorageUpgrade(levels, job, spiritWood, config);
    if (preview.isMaxLevel) {
        return {
            ok: false,
            value: { levels: { ...levels }, spiritWood },
            failure: 'max_storage_level',
        };
    }
    if (!preview.canAfford || preview.spiritWoodCost === null) {
        return {
            ok: false,
            value: { levels: { ...levels }, spiritWood },
            failure: 'insufficient_spirit_wood',
        };
    }
    return {
        ok: true,
        value: {
            levels: { ...levels, [job]: preview.currentLevel + 1 },
            spiritWood: spiritWood - preview.spiritWoodCost,
        },
    };
}

/** 旧档迁移时至少容纳已经分配出去的杂役，避免迁移后产生非法状态。 */
export function migratedWorkerCount(
    workerAssignments: Readonly<Record<string, number>>,
    initialWorkerCount: number,
): number {
    let assigned = 0;
    for (const job of PRODUCTION_JOBS) {
        const count = workerAssignments[job] ?? 0;
        if (Number.isSafeInteger(count) && count > 0) {
            assigned += count;
        }
    }
    return Math.max(initialWorkerCount, assigned);
}
