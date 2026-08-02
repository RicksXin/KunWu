import type { Realm } from '../HeroGrowth';
import { PRODUCTION_JOBS } from '../Production';
import type { ProductionJob } from '../Production';
import { nonNegativeIntegerOf, positiveIntegerOf, recordOf, stripCommentKeys } from './BalanceReaders';
import type {
    CombatConstants,
    DefenseLevelConstantCurve,
    JobRateConfig,
    ProductionRates,
    RealmRange,
    RealmRanges,
} from './BalanceTypes';

export function parseCombatConstants(value: unknown): CombatConstants {
    const raw = stripCommentKeys(recordOf(value, 'combat_constants'));
    const curvePath = 'combat_constants.defenseLevelConstant';
    const curve = recordOf(raw.defenseLevelConstant, curvePath);
    const minTicks = positiveIntegerOf(raw.minActionIntervalTicks, 'combat_constants.minActionIntervalTicks');
    const maxTicks = positiveIntegerOf(raw.maxActionIntervalTicks, 'combat_constants.maxActionIntervalTicks');
    if (minTicks > maxTicks) {
        throw new Error(`combat_constants 的行动间隔下限 ${minTicks} 不得高于上限 ${maxTicks}`);
    }
    return {
        constitutionHpFactor: positiveIntegerOf(raw.constitutionHpFactor, 'combat_constants.constitutionHpFactor'),
        minActionIntervalTicks: minTicks,
        maxActionIntervalTicks: maxTicks,
        minDamage: positiveIntegerOf(raw.minDamage, 'combat_constants.minDamage'),
        defenseLevelConstant: {
            base: positiveIntegerOf(curve.base, `${curvePath}.base`),
            perTenLevels: nonNegativeIntegerOf(curve.perTenLevels, `${curvePath}.perTenLevels`),
        },
    };
}

export function defenseLevelConstantAt(curve: DefenseLevelConstantCurve, level: number): number {
    if (!Number.isInteger(level) || level < 1) throw new Error(`等级须为正整数，收到 ${level}`);
    return curve.base + Math.floor((curve.perTenLevels * (level - 1)) / 10);
}

export function parseProductionRates(value: unknown): ProductionRates {
    const raw = stripCommentKeys(recordOf(value, 'production_rates'));
    const jobsRaw = recordOf(raw.jobs, 'production_rates.jobs');
    const jobs = {} as Record<ProductionJob, JobRateConfig>;
    for (const job of PRODUCTION_JOBS) {
        const path = `production_rates.jobs.${job}`;
        const entry = recordOf(jobsRaw[job], path);
        jobs[job] = {
            outputPerWorker: positiveIntegerOf(entry.outputPerWorker, `${path}.outputPerWorker`),
            grainUpkeepPerWorker: nonNegativeIntegerOf(entry.grainUpkeepPerWorker, `${path}.grainUpkeepPerWorker`),
        };
    }
    if (jobs.spiritGrain.grainUpkeepPerWorker !== 0) {
        throw new Error('production_rates.jobs.spiritGrain.grainUpkeepPerWorker 必须为 0：灵粮岗不消耗灵粮');
    }
    if (!Array.isArray(raw.shutdownOrder)) throw new Error('production_rates.shutdownOrder 应为数组');
    const shutdownOrder: ProductionJob[] = [];
    for (const [index, item] of raw.shutdownOrder.entries()) {
        const path = `production_rates.shutdownOrder[${index}]`;
        if (!(PRODUCTION_JOBS as readonly unknown[]).includes(item)) {
            throw new Error(`${path} 不是合法岗位：${String(item)}`);
        }
        const job = item as ProductionJob;
        if (job === 'spiritGrain') throw new Error(`${path} 不得为 spiritGrain：灵粮岗是供给来源，停它等于全盘停摆`);
        if (shutdownOrder.includes(job)) throw new Error(`${path} 重复出现岗位 ${job}`);
        shutdownOrder.push(job);
    }
    const missing = PRODUCTION_JOBS
        .filter((job) => job !== 'spiritGrain' && jobs[job].grainUpkeepPerWorker > 0)
        .filter((job) => !shutdownOrder.includes(job));
    if (missing.length > 0) {
        throw new Error(`production_rates.shutdownOrder 未覆盖有维护成本的岗位：${missing.join(', ')}`);
    }
    return {
        cycleSeconds: positiveIntegerOf(raw.cycleSeconds, 'production_rates.cycleSeconds'),
        jobs,
        shutdownOrder,
    };
}

export function parseRealmRanges(value: unknown): RealmRanges {
    const raw = stripCommentKeys(recordOf(value, 'realm_ranges'));
    const maxLevel = positiveIntegerOf(raw.maxLevel, 'realm_ranges.maxLevel');
    const tier1UnlockLevel = positiveIntegerOf(raw.tier1UnlockLevel, 'realm_ranges.tier1UnlockLevel');
    if (tier1UnlockLevel > maxLevel) {
        throw new Error(`realm_ranges.tier1UnlockLevel ${tier1UnlockLevel} 超过 maxLevel ${maxLevel}`);
    }
    if (!Array.isArray(raw.realms) || raw.realms.length === 0) {
        throw new Error('realm_ranges.realms 应为非空数组');
    }
    const realms: RealmRange[] = raw.realms.map((item, index) => {
        const path = `realm_ranges.realms[${index}]`;
        const entry = recordOf(item, path);
        if (typeof entry.id !== 'string' || entry.id.length === 0) throw new Error(`${path}.id 应为非空字符串`);
        const min = positiveIntegerOf(entry.min, `${path}.min`);
        const max = positiveIntegerOf(entry.max, `${path}.max`);
        if (min > max) throw new Error(`${path} 的 min ${min} 大于 max ${max}`);
        return { id: entry.id as Realm, min, max };
    });
    const sorted = [...realms].sort((a, b) => a.min - b.min);
    if (sorted[0]!.min !== 1) throw new Error(`realm_ranges.realms 必须从 1 级开始，当前起点 ${sorted[0]!.min}`);
    for (let index = 1; index < sorted.length; index += 1) {
        const previous = sorted[index - 1]!;
        const current = sorted[index]!;
        if (current.min !== previous.max + 1) {
            throw new Error(`realm_ranges.realms 区间不连续：${previous.id} 止于 ${previous.max}，${current.id} 起于 ${current.min}`);
        }
    }
    const last = sorted[sorted.length - 1]!;
    if (last.max !== maxLevel) throw new Error(`realm_ranges.realms 未覆盖到 maxLevel ${maxLevel}，最高区间止于 ${last.max}`);
    const ids = new Set<string>();
    for (const realm of realms) {
        if (ids.has(realm.id)) throw new Error(`realm_ranges.realms 境界 id 重复：${realm.id}`);
        ids.add(realm.id);
    }
    return { maxLevel, tier1UnlockLevel, realms: sorted };
}
