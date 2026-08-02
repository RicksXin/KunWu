import type { AttributeKey } from '../Attributes';
import type { GrowthRates, RealmId, SpiritualRootId } from '../HeroGrowth';
import type { ProductionJob } from '../Production';

export const BALANCE_TABLE_NAMES = [
    'growth_rates',
    'spiritual_root_multipliers',
    'combat_constants',
    'production_rates',
    'realm_ranges',
] as const;
export type BalanceTableName = (typeof BALANCE_TABLE_NAMES)[number];

export interface SpiritualRootMultiplier {
    readonly basePercent: number;
    readonly growthPercent: number;
}

export interface DefenseLevelConstantCurve {
    readonly base: number;
    readonly perTenLevels: number;
}

export interface CombatConstants {
    readonly constitutionHpFactor: number;
    readonly minActionIntervalTicks: number;
    readonly maxActionIntervalTicks: number;
    readonly minDamage: number;
    readonly defenseLevelConstant: DefenseLevelConstantCurve;
}

export interface JobRateConfig {
    readonly outputPerWorker: number;
    readonly grainUpkeepPerWorker: number;
}

export interface ProductionRates {
    readonly cycleSeconds: number;
    readonly jobs: Readonly<Record<ProductionJob, JobRateConfig>>;
    readonly shutdownOrder: readonly ProductionJob[];
}

export interface RealmRange {
    readonly id: RealmId;
    readonly min: number;
    readonly max: number;
}

export interface RealmRanges {
    readonly maxLevel: number;
    readonly tier1UnlockLevel: number;
    readonly realms: readonly RealmRange[];
}

export interface BalanceTables {
    readonly growthRates: Readonly<Record<string, GrowthRates>>;
    readonly spiritualRootMultipliers: Readonly<
        Record<SpiritualRootId, SpiritualRootMultiplier>
    >;
    readonly combat: CombatConstants;
    readonly production: ProductionRates;
    readonly realms: RealmRanges;
}

export interface CareerPrimaryAttribute {
    readonly id: string;
    readonly primaryAttribute: AttributeKey;
}
