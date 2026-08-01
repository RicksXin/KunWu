/**
 * 平衡数值表的解析与校验（技术方案 §1、PRD-10 §6）。
 *
 * 五张表覆盖原先硬编码在代码里的全部数值常数：
 *   growth_rates      七维每级成长率（PRD-03 §3）
 *   grade_multipliers 品级的初始与成长倍率（PRD-03 §3）
 *   combat_constants  生命系数、减伤 K 曲线、间隔边界（PRD-04 §5）
 *   production_rates  岗位产出与灵粮维护、停工顺序（PRD-02 §3）
 *   realm_ranges      境界等级区间（PRD-03 §9）
 *
 * 沿用 LingPu.parseLingPuConfig 建立的模式：**运行时与构建前共用同一份解析函数**。
 * validate-data.mjs 与 GameBootstrap 都调这里，避免两处校验漂移——
 * 漂移的症状是「构建过了但运行时崩」，比直接失败更难定位。
 *
 * 解析失败一律抛错而非返回默认值：数值表缺字段时静默兜底，
 * 会让错误表现为「数值不对但不崩」，只能靠玩发现。
 *
 * 曲线设计与验证见 Docs/13_数值设计方案.md。
 */

import { ATTRIBUTE_KEYS } from './Attributes';
import type { AttributeKey } from './Attributes';
import { HERO_GRADES } from './HeroGrowth';
import type { GrowthRates, HeroGrade, Realm } from './HeroGrowth';
import { PRODUCTION_JOBS } from './Production';
import type { ProductionJob } from './Production';

export const BALANCE_TABLE_NAMES = [
    'growth_rates',
    'grade_multipliers',
    'combat_constants',
    'production_rates',
    'realm_ranges',
] as const;
export type BalanceTableName = (typeof BALANCE_TABLE_NAMES)[number];

// 成长率的类型与千分位基数由 HeroGrowth 定义（消费方即定义方），此处仅转出，
// 避免两处各写一份 Record<AttributeKey, number> 而语义悄悄分叉。
export { GROWTH_RATE_SCALE } from './HeroGrowth';
export type { GrowthRates } from './HeroGrowth';

/** 品级倍率，百分比整数。 */
export interface GradeMultiplier {
    /** 乘初始七维。 */
    readonly basePercent: number;
    /** 乘每级成长。 */
    readonly growthPercent: number;
}

/**
 * 减伤等级常数曲线：K(L) = base + floor(perTenLevels × (L-1) / 10)。
 * 用两个数而非 60 项数组——曲线是线性的，展开成数组会让意图消失在数据里。
 */
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
    readonly id: Realm;
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
    readonly gradeMultipliers: Readonly<Record<HeroGrade, GradeMultiplier>>;
    readonly combat: CombatConstants;
    readonly production: ProductionRates;
    readonly realms: RealmRanges;
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
        throw new Error(`${path} 应为正安全整数，收到 ${String(value)}`);
    }
    return value as number;
}

function nonNegativeIntegerOf(value: unknown, path: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new Error(`${path} 应为非负安全整数，收到 ${String(value)}`);
    }
    return value as number;
}

/**
 * 剥掉以 // 开头的注释键。
 *
 * JSON 没有注释语法，故用 "//xxx" 键承载「为什么是这个数」——
 * 半年后回看时，一个孤零的 24 说明不了任何事。
 */
export function stripCommentKeys(raw: UnknownRecord): UnknownRecord {
    const out: UnknownRecord = {};
    for (const [key, value] of Object.entries(raw)) {
        if (!key.startsWith('//')) {
            out[key] = value;
        }
    }
    return out;
}

/**
 * 解析七维成长率表。
 *
 * 要求七维键完整且**均为正数**：任一维为 0（或缺键）会让该维从 1 级到满级
 * 一点不涨，而冻结的后果是减伤公式与生命上限对该职业整体失效——
 * 非坦职业护体锁死在个位数，减伤率恒为 4%–6%，等同于减伤机制不存在。
 * 这正是本次数值重构要解决的问题（Docs/13 §1.2 问题 1），故在解析层拦住，
 * 不给「先填 0 以后再说」留口子。
 *
 * 若某个维度真的不该成长，正确做法是给一个小值（200–400，即每级 0.2–0.4 点）：
 * 战力上可忽略，但保证公式对该职业保持有效。
 */
export function parseGrowthRates(value: unknown): Record<string, GrowthRates> {
    const raw = stripCommentKeys(recordOf(value, 'growth_rates'));
    const careerIds = Object.keys(raw);
    if (careerIds.length === 0) {
        throw new Error('growth_rates 至少需要一个职业');
    }

    const result: Record<string, GrowthRates> = {};
    for (const careerId of careerIds) {
        const path = `growth_rates.${careerId}`;
        const rates = recordOf(raw[careerId], path);
        const parsed = {} as Record<AttributeKey, number>;
        for (const key of ATTRIBUTE_KEYS) {
            const rate = nonNegativeIntegerOf(rates[key], `${path}.${key}`);
            if (rate === 0) {
                throw new Error(
                    `${path}.${key} 不得为 0：该维会终身冻结，使减伤与生命上限对本职业失效。` +
                        `无关维请填 200–400（每级 0.2–0.4 点）`,
                );
            }
            parsed[key] = rate;
        }
        const unknownKeys = Object.keys(rates).filter(
            (key) => !key.startsWith('//') && !(ATTRIBUTE_KEYS as readonly string[]).includes(key),
        );
        if (unknownKeys.length > 0) {
            // 拼错的字段名会静默变成「该维成长为 0」，故拦下而非忽略
            throw new Error(`${path} 含未知属性键：${unknownKeys.join(', ')}`);
        }
        result[careerId] = parsed;
    }
    return result;
}

/**
 * 解析品级倍率表。
 *
 * 要求两条倍率随品级严格递增：非递增意味着某个高品级不如低品级，
 * 那是配表笔误而非设计意图（若真要做「高品级低成长」的特殊角色，
 * 应通过独立字段表达，不能靠品级倍率倒挂）。
 */
export function parseGradeMultipliers(value: unknown): Record<HeroGrade, GradeMultiplier> {
    const raw = stripCommentKeys(recordOf(value, 'grade_multipliers'));
    const result = {} as Record<HeroGrade, GradeMultiplier>;

    for (const grade of HERO_GRADES) {
        const path = `grade_multipliers.${grade}`;
        const entry = recordOf(raw[grade], path);
        result[grade] = {
            basePercent: positiveIntegerOf(entry.basePercent, `${path}.basePercent`),
            growthPercent: positiveIntegerOf(entry.growthPercent, `${path}.growthPercent`),
        };
    }

    for (let i = 1; i < HERO_GRADES.length; i += 1) {
        const prev = result[HERO_GRADES[i - 1]!];
        const curr = result[HERO_GRADES[i]!];
        if (curr.basePercent <= prev.basePercent) {
            throw new Error(
                `grade_multipliers.basePercent 必须随品级严格递增：${HERO_GRADES[i]} 不高于 ${HERO_GRADES[i - 1]}`,
            );
        }
        if (curr.growthPercent <= prev.growthPercent) {
            throw new Error(
                `grade_multipliers.growthPercent 必须随品级严格递增：${HERO_GRADES[i]} 不高于 ${HERO_GRADES[i - 1]}`,
            );
        }
    }

    return result;
}

export function parseCombatConstants(value: unknown): CombatConstants {
    const raw = stripCommentKeys(recordOf(value, 'combat_constants'));
    const curvePath = 'combat_constants.defenseLevelConstant';
    const curve = recordOf(raw.defenseLevelConstant, curvePath);

    const minTicks = positiveIntegerOf(
        raw.minActionIntervalTicks,
        'combat_constants.minActionIntervalTicks',
    );
    const maxTicks = positiveIntegerOf(
        raw.maxActionIntervalTicks,
        'combat_constants.maxActionIntervalTicks',
    );
    if (minTicks > maxTicks) {
        throw new Error(
            `combat_constants 的行动间隔下限 ${minTicks} 不得高于上限 ${maxTicks}`,
        );
    }

    return {
        constitutionHpFactor: positiveIntegerOf(
            raw.constitutionHpFactor,
            'combat_constants.constitutionHpFactor',
        ),
        minActionIntervalTicks: minTicks,
        maxActionIntervalTicks: maxTicks,
        minDamage: positiveIntegerOf(raw.minDamage, 'combat_constants.minDamage'),
        defenseLevelConstant: {
            // base 必须为正：减伤公式的分母是 (防御 + K)，K 为 0 时满防御等于免伤 100%
            base: positiveIntegerOf(curve.base, `${curvePath}.base`),
            // perTenLevels 允许为 0，表示 K 不随等级变化（回到旧行为）
            perTenLevels: nonNegativeIntegerOf(curve.perTenLevels, `${curvePath}.perTenLevels`),
        },
    };
}

/** K(L) = base + floor(perTenLevels × (L-1) / 10)。 */
export function defenseLevelConstantAt(curve: DefenseLevelConstantCurve, level: number): number {
    if (!Number.isInteger(level) || level < 1) {
        throw new Error(`等级须为正整数，收到 ${level}`);
    }
    return curve.base + Math.floor((curve.perTenLevels * (level - 1)) / 10);
}

/**
 * 解析生产速率表。
 *
 * 停工顺序不得含 spiritGrain：灵粮是其它岗位的供给来源，停它等于全盘停摆
 * （PRD-02 §3）。且必须覆盖全部有维护成本的岗位，否则灵粮耗尽时
 * 会出现「该停的岗位停不掉」，结算只能靠负库存兜底。
 */
export function parseProductionRates(value: unknown): ProductionRates {
    const raw = stripCommentKeys(recordOf(value, 'production_rates'));
    const jobsRaw = recordOf(raw.jobs, 'production_rates.jobs');

    const jobs = {} as Record<ProductionJob, JobRateConfig>;
    for (const job of PRODUCTION_JOBS) {
        const path = `production_rates.jobs.${job}`;
        const entry = recordOf(jobsRaw[job], path);
        jobs[job] = {
            outputPerWorker: positiveIntegerOf(entry.outputPerWorker, `${path}.outputPerWorker`),
            grainUpkeepPerWorker: nonNegativeIntegerOf(
                entry.grainUpkeepPerWorker,
                `${path}.grainUpkeepPerWorker`,
            ),
        };
    }

    if (jobs.spiritGrain.grainUpkeepPerWorker !== 0) {
        throw new Error('production_rates.jobs.spiritGrain.grainUpkeepPerWorker 必须为 0：灵粮岗不消耗灵粮');
    }

    const orderRaw = raw.shutdownOrder;
    if (!Array.isArray(orderRaw)) {
        throw new Error('production_rates.shutdownOrder 应为数组');
    }
    const shutdownOrder: ProductionJob[] = [];
    for (const [index, item] of orderRaw.entries()) {
        const path = `production_rates.shutdownOrder[${index}]`;
        if (!(PRODUCTION_JOBS as readonly unknown[]).includes(item)) {
            throw new Error(`${path} 不是合法岗位：${String(item)}`);
        }
        const job = item as ProductionJob;
        if (job === 'spiritGrain') {
            throw new Error(`${path} 不得为 spiritGrain：灵粮岗是供给来源，停它等于全盘停摆`);
        }
        if (shutdownOrder.includes(job)) {
            throw new Error(`${path} 重复出现岗位 ${job}`);
        }
        shutdownOrder.push(job);
    }

    const needShutdown = PRODUCTION_JOBS.filter(
        (job) => job !== 'spiritGrain' && jobs[job].grainUpkeepPerWorker > 0,
    );
    const missing = needShutdown.filter((job) => !shutdownOrder.includes(job));
    if (missing.length > 0) {
        throw new Error(
            `production_rates.shutdownOrder 未覆盖有维护成本的岗位：${missing.join(', ')}`,
        );
    }

    return {
        cycleSeconds: positiveIntegerOf(raw.cycleSeconds, 'production_rates.cycleSeconds'),
        jobs,
        shutdownOrder,
    };
}

/**
 * 解析境界区间表。
 *
 * 要求区间连续、无重叠、完整覆盖 1–maxLevel：
 * 缺口会让 realmOf 抛「未落入任何境界区间」，症状是角色升到某级后崩，
 * 而不是配表时就被拦下。
 */
export function parseRealmRanges(value: unknown): RealmRanges {
    const raw = stripCommentKeys(recordOf(value, 'realm_ranges'));
    const maxLevel = positiveIntegerOf(raw.maxLevel, 'realm_ranges.maxLevel');
    const tier1UnlockLevel = positiveIntegerOf(
        raw.tier1UnlockLevel,
        'realm_ranges.tier1UnlockLevel',
    );
    if (tier1UnlockLevel > maxLevel) {
        throw new Error(
            `realm_ranges.tier1UnlockLevel ${tier1UnlockLevel} 超过 maxLevel ${maxLevel}`,
        );
    }

    const realmsRaw = raw.realms;
    if (!Array.isArray(realmsRaw) || realmsRaw.length === 0) {
        throw new Error('realm_ranges.realms 应为非空数组');
    }

    const realms: RealmRange[] = [];
    for (const [index, item] of realmsRaw.entries()) {
        const path = `realm_ranges.realms[${index}]`;
        const entry = recordOf(item, path);
        const id = entry.id;
        if (typeof id !== 'string' || id.length === 0) {
            throw new Error(`${path}.id 应为非空字符串`);
        }
        const min = positiveIntegerOf(entry.min, `${path}.min`);
        const max = positiveIntegerOf(entry.max, `${path}.max`);
        if (min > max) {
            throw new Error(`${path} 的 min ${min} 大于 max ${max}`);
        }
        realms.push({ id: id as Realm, min, max });
    }

    const sorted = [...realms].sort((a, b) => a.min - b.min);
    if (sorted[0]!.min !== 1) {
        throw new Error(`realm_ranges.realms 必须从 1 级开始，当前起点 ${sorted[0]!.min}`);
    }
    for (let i = 1; i < sorted.length; i += 1) {
        const prev = sorted[i - 1]!;
        const curr = sorted[i]!;
        if (curr.min !== prev.max + 1) {
            throw new Error(
                `realm_ranges.realms 区间不连续：${prev.id} 止于 ${prev.max}，${curr.id} 起于 ${curr.min}`,
            );
        }
    }
    const last = sorted[sorted.length - 1]!;
    if (last.max !== maxLevel) {
        throw new Error(
            `realm_ranges.realms 未覆盖到 maxLevel ${maxLevel}，最高区间止于 ${last.max}`,
        );
    }

    const ids = new Set<string>();
    for (const realm of realms) {
        if (ids.has(realm.id)) {
            throw new Error(`realm_ranges.realms 境界 id 重复：${realm.id}`);
        }
        ids.add(realm.id);
    }

    return { maxLevel, tier1UnlockLevel, realms: sorted };
}

/**
 * 校验 careers 表声明的主属性确实是成长率最高的那一维。
 *
 * 两处各写一遍职业定位（careers 的 primaryAttribute、growth_rates 的数值分布），
 * 不一致时症状很隐蔽：UI 显示「主属性：力道」而实际每级涨的是法力。
 * 允许并列最高——体修的肉身与护体同为 3000 是设计意图，坦克的身份就是这两维。
 */
export function assertPrimaryAttributeMatchesGrowth(
    growthRates: Readonly<Record<string, GrowthRates>>,
    careers: readonly { readonly id: string; readonly primaryAttribute: AttributeKey }[],
): void {
    for (const career of careers) {
        const rates = growthRates[career.id];
        if (!rates) {
            // 覆盖性由 assertGrowthRatesCoverCareers 负责，此处不重复报错
            continue;
        }
        const highest = Math.max(...ATTRIBUTE_KEYS.map((key) => rates[key]));
        if (rates[career.primaryAttribute] < highest) {
            const actual = ATTRIBUTE_KEYS.filter((key) => rates[key] === highest);
            throw new Error(
                `职业 ${career.id} 声明主属性为 ${career.primaryAttribute}，` +
                    `但 growth_rates 中成长最高的是 ${actual.join('/')}`,
            );
        }
    }
}

/**
 * 校验成长率表的职业集合与 careers 表一致。
 *
 * 单独成函数而非塞进 parseGrowthRates：解析只看单表内部合法性，
 * 跨表一致性需要 careers 表在手，两者调用时机不同。
 * 少一个职业的后果是该职业实例化时抛错，多一个则是无声的死配置。
 */
export function assertGrowthRatesCoverCareers(
    growthRates: Readonly<Record<string, GrowthRates>>,
    careerIds: readonly string[],
): void {
    const configured = new Set(Object.keys(growthRates));
    const expected = new Set(careerIds);

    const missing = [...expected].filter((id) => !configured.has(id)).sort();
    const extra = [...configured].filter((id) => !expected.has(id)).sort();

    if (missing.length > 0 || extra.length > 0) {
        const parts: string[] = [];
        if (missing.length > 0) {
            parts.push(`缺少职业 ${missing.join(', ')}`);
        }
        if (extra.length > 0) {
            parts.push(`多出未知职业 ${extra.join(', ')}`);
        }
        throw new Error(`growth_rates 与 careers 表不一致：${parts.join('；')}`);
    }
}

/**
 * 从五份原始 JSON 解析出完整平衡表。
 *
 * 入参是「表名 → 该 JSON 的顶层对象」，因为各表的包裹层不同：
 * growth_rates 与 grade_multipliers 直接是内容，其余包了一层同名键。
 * 这个不一致来自表的可读性取舍，在此统一吸收，不外溢给调用方。
 */
export function parseBalanceTables(raw: {
    readonly growth_rates: unknown;
    readonly grade_multipliers: unknown;
    readonly combat_constants: unknown;
    readonly production_rates: unknown;
    readonly realm_ranges: unknown;
}): BalanceTables {
    const unwrap = (value: unknown, key: string, table: string): unknown => {
        const record = recordOf(value, table);
        if (!(key in record)) {
            throw new Error(`${table} 缺少顶层键 ${key}`);
        }
        return record[key];
    };

    return {
        growthRates: parseGrowthRates(raw.growth_rates),
        gradeMultipliers: parseGradeMultipliers(raw.grade_multipliers),
        combat: parseCombatConstants(
            unwrap(raw.combat_constants, 'combat_constants', 'combat_constants'),
        ),
        production: parseProductionRates(
            unwrap(raw.production_rates, 'production_rates', 'production_rates'),
        ),
        realms: parseRealmRanges(unwrap(raw.realm_ranges, 'realm_ranges', 'realm_ranges')),
    };
}
