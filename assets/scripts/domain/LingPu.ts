import {
    PRODUCTION_JOBS,
    createAssignment,
    totalWorkers,
} from './Production';
import type { ProductionJob, WorkerAssignment } from './Production';

/** P1 灵圃实际开放的三种岗位。 */
export const P1_LING_PU_JOBS = [
    'spiritGrain',
    'spiritWood',
    'darkIron',
] as const satisfies readonly ProductionJob[];
export type P1LingPuJob = (typeof P1_LING_PU_JOBS)[number];

export const LING_PU_CONFIG_TABLE = 'ling_pu_config';
export const LING_PU_CONFIG_ID = 'ling_pu';

export interface ResourceStorageConfig {
    /** 新档初始等级，从 1 开始。 */
    readonly initialLevel: number;
    /** 索引 0 对应 1 级容量。 */
    readonly capacities: readonly number[];
    /** 索引 0 对应 1→2 级费用，长度必须比 capacities 少 1。 */
    readonly upgradeSpiritWoodCosts: readonly number[];
}

export interface LingPuConfig {
    readonly initialWorkerCount: number;
    readonly workersPerRecruit: number;
    readonly recruitSpiritGrainCost: number;
    readonly resources: Readonly<Record<P1LingPuJob, ResourceStorageConfig>>;
}

export type ResourceStorageLevels = Readonly<Record<string, number>>;

export interface StorageUpgradePreview {
    readonly job: P1LingPuJob;
    readonly currentLevel: number;
    readonly maxLevel: number;
    readonly currentCapacity: number;
    readonly nextCapacity: number | null;
    readonly spiritWoodCost: number | null;
    readonly isMaxLevel: boolean;
    readonly canAfford: boolean;
}

export type LingPuMutationFailure =
    | 'no_idle_worker'
    | 'job_empty'
    | 'insufficient_spirit_grain'
    | 'insufficient_spirit_wood'
    | 'max_storage_level';

export interface LingPuMutationResult<T> {
    readonly ok: boolean;
    readonly value: T;
    readonly failure?: LingPuMutationFailure;
}

type UnknownRecord = Record<string, unknown>;

function recordOf(value: unknown, path: string): UnknownRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${path} 应为对象`);
    }
    return value as UnknownRecord;
}

function positiveIntegerOf(value: unknown, path: string): number {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
        throw new Error(`${path} 应为正安全整数`);
    }
    return value as number;
}

function nonNegativeIntegerOf(value: unknown, path: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new Error(`${path} 应为非负安全整数`);
    }
    return value as number;
}

function integerArrayOf(value: unknown, path: string, allowZero: boolean): number[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} 应为数组`);
    }
    return value.map((item, index) =>
        allowZero
            ? nonNegativeIntegerOf(item, `${path}[${index}]`)
            : positiveIntegerOf(item, `${path}[${index}]`),
    );
}

function resourceConfigOf(value: unknown, path: string): ResourceStorageConfig {
    const raw = recordOf(value, path);
    const capacities = integerArrayOf(raw.capacities, `${path}.capacities`, false);
    const upgradeSpiritWoodCosts = integerArrayOf(
        raw.upgradeSpiritWoodCosts,
        `${path}.upgradeSpiritWoodCosts`,
        false,
    );
    if (capacities.length === 0) {
        throw new Error(`${path}.capacities 至少需要 1 级`);
    }
    if (upgradeSpiritWoodCosts.length !== capacities.length - 1) {
        throw new Error(
            `${path}.upgradeSpiritWoodCosts 长度应为 ${capacities.length - 1}`,
        );
    }
    for (let index = 1; index < capacities.length; index += 1) {
        if (capacities[index]! <= capacities[index - 1]!) {
            throw new Error(`${path}.capacities 必须严格递增`);
        }
    }
    const initialLevel = positiveIntegerOf(raw.initialLevel, `${path}.initialLevel`);
    if (initialLevel > capacities.length) {
        throw new Error(`${path}.initialLevel 超过最高等级 ${capacities.length}`);
    }
    return { initialLevel, capacities, upgradeSpiritWoodCosts };
}

/** 运行时与构建前共用的数据表校验。 */
export function parseLingPuConfig(value: unknown): LingPuConfig {
    const raw = recordOf(value, 'ling_pu');
    const resourcesRaw = recordOf(raw.resources, 'ling_pu.resources');
    const resources = {} as Record<P1LingPuJob, ResourceStorageConfig>;
    for (const job of P1_LING_PU_JOBS) {
        resources[job] = resourceConfigOf(
            resourcesRaw[job],
            `ling_pu.resources.${job}`,
        );
    }
    return {
        initialWorkerCount: positiveIntegerOf(
            raw.initialWorkerCount,
            'ling_pu.initialWorkerCount',
        ),
        workersPerRecruit: positiveIntegerOf(
            raw.workersPerRecruit,
            'ling_pu.workersPerRecruit',
        ),
        recruitSpiritGrainCost: positiveIntegerOf(
            raw.recruitSpiritGrainCost,
            'ling_pu.recruitSpiritGrainCost',
        ),
        resources,
    };
}

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
