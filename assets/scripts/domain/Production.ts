/**
 * 杂役生产与结算（PRD-02 §3、§6、§8、任务 P1-ECO-001／002）。
 *
 * 纯逻辑、无引擎依赖。三条硬约束：
 *
 *   1. **所有资源用安全整数，结算不允许出现负库存**（PRD-02 §8）。
 *      故除法一律先乘后除并取整，且扣减前必先校验。
 *
 *   2. **灵粮不足时按固定顺序停工**：庚精 → 灵石 → 玄铁 → 灵木（PRD-02 §3）。
 *      顺序固定才能让玩家预测行为；随机停工会让人以为是 bug。
 *
 *   3. **先按旧岗位结算，再应用新分配**（PRD-02 §6）。
 *      顺序反了等于让玩家用新岗位追溯领取旧时段的产出。
 */

/** 生产岗位。灵粮岗无维护成本，是其它岗位的供给来源。 */
export const PRODUCTION_JOBS = [
    'spiritGrain',
    'spiritWood',
    'darkIron',
    'spiritStone',
    'gengJing',
] as const;
export type ProductionJob = (typeof PRODUCTION_JOBS)[number];

/** 单人单周期产出与灵粮维护（PRD-02 §3）。 */
export interface JobRate {
    readonly outputPerWorker: number;
    readonly grainUpkeepPerWorker: number;
}

export const JOB_RATES: Readonly<Record<ProductionJob, JobRate>> = {
    spiritGrain: { outputPerWorker: 1, grainUpkeepPerWorker: 0 },
    spiritWood: { outputPerWorker: 1, grainUpkeepPerWorker: 2 },
    darkIron: { outputPerWorker: 1, grainUpkeepPerWorker: 3 },
    spiritStone: { outputPerWorker: 1, grainUpkeepPerWorker: 4 },
    gengJing: { outputPerWorker: 1, grainUpkeepPerWorker: 9 },
};

/**
 * 灵粮不足时的停工顺序（PRD-02 §3）。
 * 先停维护最贵的，保住便宜岗位能多产一些。
 */
export const SHUTDOWN_ORDER: readonly ProductionJob[] = [
    'gengJing',
    'spiritStone',
    'darkIron',
    'spiritWood',
];

/** 初始生产周期，秒（PRD-02 §3）。 */
export const BASE_CYCLE_SECONDS = 30;

/** 岗位 → 人数。 */
export type WorkerAssignment = Readonly<Record<ProductionJob, number>>;

/** 结算产出，各资源增量。 */
export type ProductionYield = Readonly<Record<ProductionJob, number>>;

export interface SettlementInput {
    readonly assignment: WorkerAssignment;
    /** 有效秒数，由 TimeService.computeSettlementWindow 给出。 */
    readonly effectiveSeconds: number;
    /** 当前灵粮库存，用于判断维护是否够。 */
    readonly grainStock: number;
    readonly cycleSeconds?: number;
    /** 产量增益，百分比整数。100 表示不加成。 */
    readonly outputBonusPercent?: number;
}

export interface SettlementOutput {
    readonly yields: ProductionYield;
    /** 完成的周期数。 */
    readonly cycles: number;
    /** 因灵粮不足而停工的岗位。 */
    readonly shutdownJobs: readonly ProductionJob[];
    /** 本次消耗的灵粮维护总量。 */
    readonly grainUpkeepSpent: number;
    /** 净灵粮变化 = 灵粮产出 - 维护消耗。可为负。 */
    readonly netGrainChange: number;
}

function emptyYield(): Record<ProductionJob, number> {
    return {
        spiritGrain: 0,
        spiritWood: 0,
        darkIron: 0,
        spiritStone: 0,
        gengJing: 0,
    };
}

export function createAssignment(init: Partial<WorkerAssignment> = {}): WorkerAssignment {
    const result = emptyYield();
    for (const job of PRODUCTION_JOBS) {
        const count = init[job] ?? 0;
        if (!Number.isInteger(count) || count < 0) {
            throw new Error(`岗位 ${job} 的人数必须为非负整数，收到 ${count}`);
        }
        result[job] = count;
    }
    return result;
}

export function totalWorkers(assignment: WorkerAssignment): number {
    return PRODUCTION_JOBS.reduce((sum, job) => sum + assignment[job], 0);
}

/**
 * 每周期的灵粮维护总量。
 * 灵粮岗自身不耗维护，故不计入。
 */
export function grainUpkeepPerCycle(assignment: WorkerAssignment): number {
    return PRODUCTION_JOBS.reduce(
        (sum, job) => sum + assignment[job] * JOB_RATES[job].grainUpkeepPerWorker,
        0,
    );
}

/**
 * 决定哪些岗位需停工（PRD-02 §3）。
 *
 * 按 SHUTDOWN_ORDER 逐个停，直到剩余维护成本能被灵粮覆盖。
 * 返回停工岗位列表；调用方据此计算实际产出。
 */
export function resolveShutdown(
    assignment: WorkerAssignment,
    availableGrain: number,
): readonly ProductionJob[] {
    if (availableGrain < 0) {
        throw new Error(`可用灵粮不能为负，收到 ${availableGrain}`);
    }

    const shutdown: ProductionJob[] = [];
    let upkeep = grainUpkeepPerCycle(assignment);

    for (const job of SHUTDOWN_ORDER) {
        if (upkeep <= availableGrain) {
            break;
        }
        if (assignment[job] === 0) {
            continue;
        }
        shutdown.push(job);
        upkeep -= assignment[job] * JOB_RATES[job].grainUpkeepPerWorker;
    }

    return shutdown;
}

/**
 * 结算一段时间的产出（PRD-02 §3）：
 *   周期数 = floor(有效秒数 / 当前周期)
 *   产出   = 周期数 × 岗位人数 × 单周期产出 × 增益
 *   净灵粮 = 灵粮产出 - 其他岗位维护
 *
 * 不允许负库存（PRD-02 §8）：维护不足时先停工再算，
 * 而非算完发现灵粮成负数。
 */
export function settleProduction(input: SettlementInput): SettlementOutput {
    const cycleSeconds = input.cycleSeconds ?? BASE_CYCLE_SECONDS;
    if (!Number.isInteger(cycleSeconds) || cycleSeconds <= 0) {
        throw new Error(`生产周期必须为正整数秒，收到 ${cycleSeconds}`);
    }
    if (input.effectiveSeconds < 0) {
        throw new Error(`有效秒数不能为负，收到 ${input.effectiveSeconds}`);
    }
    if (input.grainStock < 0) {
        throw new Error(`灵粮库存不能为负，收到 ${input.grainStock}`);
    }

    const cycles = Math.floor(input.effectiveSeconds / cycleSeconds);
    const yields = emptyYield();

    if (cycles === 0) {
        return {
            yields,
            cycles: 0,
            shutdownJobs: [],
            grainUpkeepSpent: 0,
            netGrainChange: 0,
        };
    }

    // 灵粮岗先产出：本周期产的粮可用于支付本周期维护
    const grainWorkers = input.assignment.spiritGrain;
    const bonus = input.outputBonusPercent ?? 100;
    if (bonus < 0) {
        throw new Error(`产量增益不能为负，收到 ${bonus}`);
    }

    // 先乘后除保持整数精度：cycles × workers × rate × bonus / 100
    const grainProduced = Math.floor(
        (cycles * grainWorkers * JOB_RATES.spiritGrain.outputPerWorker * bonus) / 100,
    );

    // 可用于维护的灵粮 = 库存 + 本次产出
    const availableForUpkeep = input.grainStock + grainProduced;
    // 按单周期维护判断停工，再乘周期数——避免"前几周期够、后几周期不够"
    // 这种半停工状态，那会让产出难以向玩家解释
    const perCycleBudget = Math.floor(availableForUpkeep / cycles);
    const shutdownJobs = resolveShutdown(input.assignment, perCycleBudget);
    const shutdownSet = new Set(shutdownJobs);

    let upkeepSpent = 0;
    for (const job of PRODUCTION_JOBS) {
        if (job === 'spiritGrain') {
            continue;
        }
        if (shutdownSet.has(job)) {
            continue;
        }
        const workers = input.assignment[job];
        yields[job] = Math.floor(
            (cycles * workers * JOB_RATES[job].outputPerWorker * bonus) / 100,
        );
        upkeepSpent += cycles * workers * JOB_RATES[job].grainUpkeepPerWorker;
    }

    yields.spiritGrain = grainProduced;

    return {
        yields,
        cycles,
        shutdownJobs,
        grainUpkeepSpent: upkeepSpent,
        netGrainChange: grainProduced - upkeepSpent,
    };
}

/**
 * 应用结算到库存，保证不出现负值（PRD-02 §8）。
 * 返回新库存，不修改入参。
 */
export function applyYields(
    stock: Readonly<Record<ProductionJob, number>>,
    output: SettlementOutput,
): Record<ProductionJob, number> {
    const next = emptyYield();
    for (const job of PRODUCTION_JOBS) {
        const base = stock[job] ?? 0;
        const delta = job === 'spiritGrain' ? output.netGrainChange : output.yields[job];
        // clamp 到 0：停工逻辑本应保证不为负，这里是最后一道防线
        next[job] = Math.max(0, base + delta);
    }
    return next;
}
