import type { ProductionJob } from '../Production';

export const P1_LING_PU_JOBS = [
    'spiritGrain',
    'spiritWood',
    'darkIron',
] as const satisfies readonly ProductionJob[];
export type P1LingPuJob = (typeof P1_LING_PU_JOBS)[number];

export const LING_PU_CONFIG_TABLE = 'ling_pu_config';
export const LING_PU_CONFIG_ID = 'ling_pu';

export interface ResourceStorageConfig {
    readonly initialLevel: number;
    readonly capacities: readonly number[];
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
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} 应为对象`);
    return value as UnknownRecord;
}

function positiveIntegerOf(value: unknown, path: string): number {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) throw new Error(`${path} 应为正安全整数`);
    return value as number;
}

function integerArrayOf(value: unknown, path: string): number[] {
    if (!Array.isArray(value)) throw new Error(`${path} 应为数组`);
    return value.map((item, index) => positiveIntegerOf(item, `${path}[${index}]`));
}

function resourceConfigOf(value: unknown, path: string): ResourceStorageConfig {
    const raw = recordOf(value, path);
    const capacities = integerArrayOf(raw.capacities, `${path}.capacities`);
    const upgradeSpiritWoodCosts = integerArrayOf(raw.upgradeSpiritWoodCosts, `${path}.upgradeSpiritWoodCosts`);
    if (capacities.length === 0) throw new Error(`${path}.capacities 至少需要 1 级`);
    if (upgradeSpiritWoodCosts.length !== capacities.length - 1) {
        throw new Error(`${path}.upgradeSpiritWoodCosts 长度应为 ${capacities.length - 1}`);
    }
    for (let index = 1; index < capacities.length; index += 1) {
        if (capacities[index]! <= capacities[index - 1]!) throw new Error(`${path}.capacities 必须严格递增`);
    }
    const initialLevel = positiveIntegerOf(raw.initialLevel, `${path}.initialLevel`);
    if (initialLevel > capacities.length) throw new Error(`${path}.initialLevel 超过最高等级 ${capacities.length}`);
    return { initialLevel, capacities, upgradeSpiritWoodCosts };
}

export function parseLingPuConfig(value: unknown): LingPuConfig {
    const raw = recordOf(value, 'ling_pu');
    const resourcesRaw = recordOf(raw.resources, 'ling_pu.resources');
    const resources = {} as Record<P1LingPuJob, ResourceStorageConfig>;
    for (const job of P1_LING_PU_JOBS) {
        resources[job] = resourceConfigOf(resourcesRaw[job], `ling_pu.resources.${job}`);
    }
    return {
        initialWorkerCount: positiveIntegerOf(raw.initialWorkerCount, 'ling_pu.initialWorkerCount'),
        workersPerRecruit: positiveIntegerOf(raw.workersPerRecruit, 'ling_pu.workersPerRecruit'),
        recruitSpiritGrainCost: positiveIntegerOf(raw.recruitSpiritGrainCost, 'ling_pu.recruitSpiritGrainCost'),
        resources,
    };
}
