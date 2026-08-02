/**
 * 五份平衡数值表的稳定公共入口。
 *
 * 单表解析按成长类与系统类拆在 domain/balance/，运行时与构建前仍共用这里
 * 导出的同一组函数，避免校验口径漂移。
 */

import { recordOf } from './balance/BalanceReaders';
import { parseGrowthRates, parseSpiritualRootMultipliers } from './balance/GrowthBalance';
import { parseCombatConstants, parseProductionRates, parseRealmRanges } from './balance/SystemBalance';
import type { BalanceTables } from './balance/BalanceTypes';

export { GROWTH_RATE_SCALE } from './HeroGrowth';
export type { GrowthRates } from './HeroGrowth';
export { stripCommentKeys } from './balance/BalanceReaders';
export {
    assertGrowthRatesCoverCareers,
    assertPrimaryAttributeMatchesGrowth,
    parseGrowthRates,
    parseSpiritualRootMultipliers,
} from './balance/GrowthBalance';
export {
    defenseLevelConstantAt,
    parseCombatConstants,
    parseProductionRates,
    parseRealmRanges,
} from './balance/SystemBalance';
export {
    BALANCE_TABLE_NAMES,
} from './balance/BalanceTypes';
export type {
    BalanceTableName,
    BalanceTables,
    CombatConstants,
    DefenseLevelConstantCurve,
    SpiritualRootMultiplier,
    JobRateConfig,
    ProductionRates,
    RealmRange,
    RealmRanges,
} from './balance/BalanceTypes';

export function parseBalanceTables(raw: {
    readonly growth_rates: unknown;
    readonly spiritual_root_multipliers: unknown;
    readonly combat_constants: unknown;
    readonly production_rates: unknown;
    readonly realm_ranges: unknown;
}): BalanceTables {
    const unwrap = (value: unknown, key: string, table: string): unknown => {
        const record = recordOf(value, table);
        if (!(key in record)) throw new Error(`${table} 缺少顶层键 ${key}`);
        return record[key];
    };
    return {
        growthRates: parseGrowthRates(raw.growth_rates),
        spiritualRootMultipliers: parseSpiritualRootMultipliers(
            raw.spiritual_root_multipliers,
        ),
        combat: parseCombatConstants(unwrap(raw.combat_constants, 'combat_constants', 'combat_constants')),
        production: parseProductionRates(unwrap(raw.production_rates, 'production_rates', 'production_rates')),
        realms: parseRealmRanges(unwrap(raw.realm_ranges, 'realm_ranges', 'realm_ranges')),
    };
}
