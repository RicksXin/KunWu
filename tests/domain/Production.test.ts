import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    PRODUCTION_JOBS,
    JOB_RATES,
    SHUTDOWN_ORDER,
    BASE_CYCLE_SECONDS,
    createAssignment,
    totalWorkers,
    grainUpkeepPerCycle,
    resolveShutdown,
    settleProduction,
    applyYields,
} from 'db://assets/scripts/domain/Production';

describe('岗位费率（PRD-02 §3）', () => {
    test('灵粮岗无维护成本', () => {
        // 它是其它岗位的供给来源，自身收费会导致死锁
        assert.equal(JOB_RATES.spiritGrain.grainUpkeepPerWorker, 0);
    });

    test('维护成本递增：灵木 2、玄铁 3、灵石 4、庚精 9', () => {
        assert.equal(JOB_RATES.spiritWood.grainUpkeepPerWorker, 2);
        assert.equal(JOB_RATES.darkIron.grainUpkeepPerWorker, 3);
        assert.equal(JOB_RATES.spiritStone.grainUpkeepPerWorker, 4);
        assert.equal(JOB_RATES.gengJing.grainUpkeepPerWorker, 9);
    });

    test('单人单周期产出均为 1', () => {
        for (const job of PRODUCTION_JOBS) {
            assert.equal(JOB_RATES[job].outputPerWorker, 1);
        }
    });

    test('初始周期 30 秒', () => {
        assert.equal(BASE_CYCLE_SECONDS, 30);
    });

    test('停工顺序为庚精→灵石→玄铁→灵木', () => {
        assert.deepEqual([...SHUTDOWN_ORDER], [
            'gengJing',
            'spiritStone',
            'darkIron',
            'spiritWood',
        ]);
    });

    test('停工顺序按维护成本降序', () => {
        // 先停最贵的才能保住更多便宜岗位
        for (let i = 1; i < SHUTDOWN_ORDER.length; i += 1) {
            const prev = JOB_RATES[SHUTDOWN_ORDER[i - 1]!].grainUpkeepPerWorker;
            const curr = JOB_RATES[SHUTDOWN_ORDER[i]!].grainUpkeepPerWorker;
            assert.ok(prev > curr, `${SHUTDOWN_ORDER[i - 1]} 应比 ${SHUTDOWN_ORDER[i]} 贵`);
        }
    });
});

describe('岗位分配', () => {
    test('缺省全为 0', () => {
        const a = createAssignment();
        assert.equal(totalWorkers(a), 0);
    });

    test('部分指定，其余补 0', () => {
        const a = createAssignment({ spiritGrain: 3, darkIron: 2 });
        assert.equal(a.spiritGrain, 3);
        assert.equal(a.spiritWood, 0);
        assert.equal(totalWorkers(a), 5);
    });

    test('负人数抛错', () => {
        assert.throws(() => createAssignment({ spiritGrain: -1 }), /非负整数/);
    });

    test('非整数人数抛错', () => {
        assert.throws(() => createAssignment({ spiritGrain: 1.5 }), /非负整数/);
    });

    test('维护总量按人数与费率累加', () => {
        // 2 灵木 ×2 + 1 玄铁 ×3 = 7
        const a = createAssignment({ spiritGrain: 5, spiritWood: 2, darkIron: 1 });
        assert.equal(grainUpkeepPerCycle(a), 7);
    });

    test('只有灵粮岗时维护为 0', () => {
        assert.equal(grainUpkeepPerCycle(createAssignment({ spiritGrain: 10 })), 0);
    });
});

describe('停工判定（PRD-02 §3）', () => {
    test('灵粮充足时不停工', () => {
        const a = createAssignment({ spiritWood: 1, darkIron: 1 });
        assert.deepEqual(resolveShutdown(a, 100), []);
    });

    test('灵粮为 0 时全部有维护的岗位停工', () => {
        const a = createAssignment({ spiritWood: 1, darkIron: 1, gengJing: 1 });
        const shutdown = resolveShutdown(a, 0);
        assert.equal(shutdown.length, 3);
    });

    test('优先停庚精', () => {
        // 庚精 9 + 灵木 2 = 11，预算 5 只够灵木
        const a = createAssignment({ gengJing: 1, spiritWood: 1 });
        assert.deepEqual(resolveShutdown(a, 5), ['gengJing']);
    });

    test('停庚精仍不够则继续停灵石', () => {
        // 庚精 9 + 灵石 4 + 灵木 2 = 15，预算 2 只够灵木
        const a = createAssignment({ gengJing: 1, spiritStone: 1, spiritWood: 1 });
        assert.deepEqual(resolveShutdown(a, 2), ['gengJing', 'spiritStone']);
    });

    test('跳过无人的岗位', () => {
        // 庚精无人，应直接停灵石
        const a = createAssignment({ spiritStone: 1, spiritWood: 1 });
        assert.deepEqual(resolveShutdown(a, 2), ['spiritStone']);
    });

    test('恰好够时不停工', () => {
        const a = createAssignment({ spiritWood: 1 });
        assert.deepEqual(resolveShutdown(a, 2), []);
    });

    test('负可用灵粮抛错', () => {
        assert.throws(() => resolveShutdown(createAssignment(), -1), /不能为负/);
    });
});

describe('产出结算（PRD-02 §3）', () => {
    test('不足一周期时无产出', () => {
        const out = settleProduction({
            assignment: createAssignment({ spiritGrain: 5 }),
            effectiveSeconds: 29,
            grainStock: 100,
        });
        assert.equal(out.cycles, 0);
        assert.equal(out.yields.spiritGrain, 0);
    });

    test('周期数按 floor 计算', () => {
        const out = settleProduction({
            assignment: createAssignment({ spiritGrain: 1 }),
            effectiveSeconds: 95,
            grainStock: 0,
        });
        // 95 / 30 = 3.16 → 3
        assert.equal(out.cycles, 3);
        assert.equal(out.yields.spiritGrain, 3);
    });

    test('产出 = 周期 × 人数 × 单产', () => {
        const out = settleProduction({
            assignment: createAssignment({ spiritGrain: 4 }),
            effectiveSeconds: 60,
            grainStock: 0,
        });
        // 2 周期 × 4 人 × 1 = 8
        assert.equal(out.yields.spiritGrain, 8);
    });

    test('增益按百分比应用', () => {
        const out = settleProduction({
            assignment: createAssignment({ spiritGrain: 5 }),
            effectiveSeconds: 60,
            grainStock: 0,
            outputBonusPercent: 150,
        });
        // 2 × 5 × 1 × 150% = 15
        assert.equal(out.yields.spiritGrain, 15);
    });

    test('增益结果向下取整', () => {
        const out = settleProduction({
            assignment: createAssignment({ spiritGrain: 1 }),
            effectiveSeconds: 60,
            grainStock: 0,
            outputBonusPercent: 133,
        });
        // 2 × 1 × 133% = 2.66 → 2
        assert.equal(out.yields.spiritGrain, 2);
    });

    test('净灵粮 = 产出 - 维护', () => {
        const out = settleProduction({
            assignment: createAssignment({ spiritGrain: 10, spiritWood: 1 }),
            effectiveSeconds: 30,
            grainStock: 100,
        });
        // 产 10，维护 2 → 净 8
        assert.equal(out.yields.spiritGrain, 10);
        assert.equal(out.grainUpkeepSpent, 2);
        assert.equal(out.netGrainChange, 8);
    });

    test('灵粮不足时停工且不产该资源', () => {
        const out = settleProduction({
            assignment: createAssignment({ gengJing: 1 }),
            effectiveSeconds: 30,
            grainStock: 0,
        });
        assert.deepEqual([...out.shutdownJobs], ['gengJing']);
        assert.equal(out.yields.gengJing, 0);
        assert.equal(out.grainUpkeepSpent, 0);
    });

    test('本周期产的粮可支付本周期维护', () => {
        // 库存 0，但 3 个灵粮岗产 3，够 1 个灵木岗的 2
        const out = settleProduction({
            assignment: createAssignment({ spiritGrain: 3, spiritWood: 1 }),
            effectiveSeconds: 30,
            grainStock: 0,
        });
        assert.deepEqual([...out.shutdownJobs], []);
        assert.equal(out.yields.spiritWood, 1);
    });

    test('多周期时维护按周期累计', () => {
        const out = settleProduction({
            assignment: createAssignment({ spiritGrain: 10, spiritWood: 1 }),
            effectiveSeconds: 150,
            grainStock: 100,
        });
        // 5 周期 × 1 人 × 2 = 10
        assert.equal(out.cycles, 5);
        assert.equal(out.grainUpkeepSpent, 10);
    });

    test('零人时无产出无消耗', () => {
        const out = settleProduction({
            assignment: createAssignment(),
            effectiveSeconds: 300,
            grainStock: 50,
        });
        assert.equal(out.netGrainChange, 0);
        assert.equal(out.grainUpkeepSpent, 0);
    });

    test('可覆盖生产周期（建筑升级提效）', () => {
        const out = settleProduction({
            assignment: createAssignment({ spiritGrain: 1 }),
            effectiveSeconds: 60,
            grainStock: 0,
            cycleSeconds: 15,
        });
        // 60 / 15 = 4 周期
        assert.equal(out.cycles, 4);
    });

    test('非法周期抛错', () => {
        assert.throws(
            () =>
                settleProduction({
                    assignment: createAssignment(),
                    effectiveSeconds: 60,
                    grainStock: 0,
                    cycleSeconds: 0,
                }),
            /正整数秒/,
        );
    });

    test('负有效秒数抛错', () => {
        assert.throws(
            () =>
                settleProduction({
                    assignment: createAssignment(),
                    effectiveSeconds: -1,
                    grainStock: 0,
                }),
            /不能为负/,
        );
    });

    test('负库存抛错', () => {
        assert.throws(
            () =>
                settleProduction({
                    assignment: createAssignment(),
                    effectiveSeconds: 30,
                    grainStock: -1,
                }),
            /不能为负/,
        );
    });
});

describe('库存应用（PRD-02 §8：不允许负库存）', () => {
    const emptyStock = {
        spiritGrain: 0,
        spiritWood: 0,
        darkIron: 0,
        spiritStone: 0,
        gengJing: 0,
    };

    test('增量累加到库存', () => {
        const out = settleProduction({
            assignment: createAssignment({ spiritGrain: 5, spiritWood: 1 }),
            effectiveSeconds: 30,
            grainStock: 10,
        });
        const next = applyYields({ ...emptyStock, spiritGrain: 10 }, out);
        // 10 + (5 产 - 2 维护) = 13
        assert.equal(next.spiritGrain, 13);
        assert.equal(next.spiritWood, 1);
    });

    test('净灵粮为负时不产生负库存', () => {
        // 构造维护大于产出的情形
        const out = settleProduction({
            assignment: createAssignment({ spiritGrain: 1, spiritWood: 3 }),
            effectiveSeconds: 30,
            grainStock: 6,
        });
        const next = applyYields({ ...emptyStock, spiritGrain: 0 }, out);
        assert.ok(next.spiritGrain >= 0, '库存不得为负');
    });

    test('所有资源均非负', () => {
        const out = settleProduction({
            assignment: createAssignment({ gengJing: 5 }),
            effectiveSeconds: 300,
            grainStock: 0,
        });
        const next = applyYields(emptyStock, out);
        for (const job of PRODUCTION_JOBS) {
            assert.ok(next[job] >= 0, `${job} 为负: ${next[job]}`);
        }
    });

    test('不修改入参', () => {
        const stock = { ...emptyStock, spiritGrain: 100 };
        const out = settleProduction({
            assignment: createAssignment({ spiritGrain: 1 }),
            effectiveSeconds: 30,
            grainStock: 100,
        });
        applyYields(stock, out);
        assert.equal(stock.spiritGrain, 100, '入参被修改');
    });
});
