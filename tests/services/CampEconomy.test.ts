import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { CampEconomy, P1_OFFLINE_CAP_SECONDS } from 'db://assets/scripts/services/CampEconomy';
import type { CampEconomyState } from 'db://assets/scripts/services/CampEconomy';
import { createAssignment } from 'db://assets/scripts/domain/Production';
import { TimeService, OFFLINE_CAP_SECONDS_DEMO } from 'db://assets/scripts/services/TimeService';

/** 可控时钟，避免测试依赖真实时间。 */
function makeClock(start = 1_000) {
    let now = start;
    return {
        now: () => now,
        advance: (seconds: number) => {
            now += seconds;
        },
        setTo: (value: number) => {
            now = value;
        },
    };
}

function makeEconomy(clock: ReturnType<typeof makeClock>, cap = OFFLINE_CAP_SECONDS_DEMO) {
    const time = new TimeService();
    return new CampEconomy({
        computeWindow: (last, capSeconds) =>
            time.computeSettlementWindow(last, capSeconds, clock.now()),
        nowUtcSeconds: clock.now,
        offlineCapSeconds: cap,
    });
}

function makeState(overrides: Partial<CampEconomyState> = {}): CampEconomyState {
    return {
        stock: {
            spiritGrain: 100,
            spiritWood: 0,
            darkIron: 0,
            spiritStone: 0,
            gengJing: 0,
        },
        assignment: createAssignment({ spiritGrain: 5 }),
        lastSettledAtUtc: 1_000,
        ...overrides,
    };
}

describe('结算触发（PRD-02 §6）', () => {
    test('时间未推进时无产出', () => {
        const clock = makeClock();
        const result = makeEconomy(clock).settle(makeState());
        assert.equal(result.output.cycles, 0);
    });

    test('推进一个周期后有产出', () => {
        const clock = makeClock();
        const economy = makeEconomy(clock);
        clock.advance(30);
        const result = economy.settle(makeState());
        assert.equal(result.output.cycles, 1);
        assert.equal(result.output.yields.spiritGrain, 5);
    });

    test('结算后只推进完整周期并保留零头', () => {
        const clock = makeClock();
        const economy = makeEconomy(clock);
        clock.advance(45);
        const result = economy.settle(makeState());
        assert.equal(result.state.lastSettledAtUtc, 1_030);
    });

    test('不足一周期不推进时间戳，下一次继续累计', () => {
        const clock = makeClock();
        const economy = makeEconomy(clock);
        clock.advance(10);
        const result = economy.settle(makeState());
        assert.equal(result.output.cycles, 0);
        assert.equal(result.state.lastSettledAtUtc, 1_000);

        clock.advance(20);
        const completed = economy.settle(result.state);
        assert.equal(completed.output.cycles, 1);
        assert.equal(completed.state.lastSettledAtUtc, 1_030);
    });

    test('库存累加而非替换', () => {
        const clock = makeClock();
        const economy = makeEconomy(clock);
        clock.advance(30);
        const result = economy.settle(makeState());
        // 100 + 5 = 105
        assert.equal(result.state.stock.spiritGrain, 105);
    });
});

describe('时钟倒退（PRD-02 §6）', () => {
    test('倒退超容差时跳过结算并标记', () => {
        const clock = makeClock(10_000);
        const economy = makeEconomy(clock);
        // 系统时间被调回到结算点之前
        clock.setTo(1_000);
        const result = economy.settle(makeState({ lastSettledAtUtc: 10_000 }));

        assert.equal(result.clockRolledBack, true);
        assert.equal(result.output.cycles, 0);
    });

    test('倒退时保留原状态，不推进时间戳', () => {
        const clock = makeClock(10_000);
        const economy = makeEconomy(clock);
        const original = makeState({ lastSettledAtUtc: 10_000 });
        clock.setTo(1_000);
        const result = economy.settle(original);

        // 不能推进时间戳：否则改回正确时间后这段时长就凭空消失了
        assert.equal(result.state.lastSettledAtUtc, 10_000);
        assert.equal(result.state.stock.spiritGrain, original.stock.spiritGrain);
    });

    test('容差内的小幅倒退按 0 处理，不算作弊', () => {
        const clock = makeClock(1_000);
        const economy = makeEconomy(clock);
        // NTP 校正等正常抖动
        const result = economy.settle(makeState({ lastSettledAtUtc: 1_060 }));
        assert.equal(result.clockRolledBack, false);
        assert.equal(result.output.cycles, 0);
    });
});

describe('离线上限', () => {
    test('P1 上限为 0，不结算离线', () => {
        // PRD-02 §6：P1 不结算离线
        assert.equal(P1_OFFLINE_CAP_SECONDS, 0);

        const clock = makeClock();
        const economy = makeEconomy(clock, P1_OFFLINE_CAP_SECONDS);
        clock.advance(3600);
        const result = economy.settle(makeState());
        assert.equal(result.output.cycles, 0);
    });

    test('超出上限的时长被丢弃并记录', () => {
        const clock = makeClock();
        const economy = makeEconomy(clock, 60);
        clock.advance(300);
        const result = economy.settle(makeState());

        // 上限 60 秒 = 2 周期
        assert.equal(result.output.cycles, 2);
        assert.equal(result.discardedSeconds, 240);
        assert.equal(result.state.lastSettledAtUtc, clock.now());
    });

    test('未超上限时无丢弃', () => {
        const clock = makeClock();
        const economy = makeEconomy(clock, 3600);
        clock.advance(60);
        const result = economy.settle(makeState());
        assert.equal(result.discardedSeconds, 0);
    });
});

describe('岗位调整（PRD-02 §6：先结算后应用）', () => {
    test('调岗前先按旧岗位结算', () => {
        const clock = makeClock();
        const economy = makeEconomy(clock);
        clock.advance(30);

        const state = makeState({ assignment: createAssignment({ spiritGrain: 5 }) });
        const result = economy.reassign(state, createAssignment({ gengJing: 5 }));

        // 产出应来自旧的灵粮岗，不是新的庚精岗
        assert.equal(result.output.yields.spiritGrain, 5);
        assert.equal(result.output.yields.gengJing, 0);
    });

    test('调岗后新分配生效', () => {
        const clock = makeClock();
        const economy = makeEconomy(clock);
        clock.advance(30);

        const next = createAssignment({ darkIron: 3 });
        const result = economy.reassign(makeState(), next);
        assert.deepEqual(result.state.assignment, next);
    });

    test('无法用调岗刷高价资源', () => {
        const clock = makeClock();
        const economy = makeEconomy(clock);
        // 挂机一小时，全在灵粮岗
        clock.advance(3600);

        const state = makeState({ assignment: createAssignment({ spiritGrain: 10 }) });
        // 结算前把人调到庚精岗，试图领取一小时的庚精
        const result = economy.reassign(state, createAssignment({ gengJing: 10 }));

        // 若顺序写反，这里会产出大量庚精
        assert.equal(result.output.yields.gengJing, 0);
    });

    test('调岗时时间戳同样推进', () => {
        const clock = makeClock();
        const economy = makeEconomy(clock);
        clock.advance(30);
        const result = economy.reassign(makeState(), createAssignment({ spiritWood: 1 }));
        assert.equal(result.state.lastSettledAtUtc, clock.now());
    });

    test('时钟倒退时调岗仍生效，但无产出', () => {
        const clock = makeClock(10_000);
        const economy = makeEconomy(clock);
        clock.setTo(1_000);

        const next = createAssignment({ spiritWood: 2 });
        const result = economy.reassign(makeState({ lastSettledAtUtc: 10_000 }), next);

        // 玩家的操作意图应被尊重，只是不给这段时间的收益
        assert.deepEqual(result.state.assignment, next);
        assert.equal(result.clockRolledBack, true);
    });
});

describe('维护预览', () => {
    test('返回每周期灵粮维护，供 UI 显示收支', () => {
        const economy = makeEconomy(makeClock());
        const state = makeState({
            assignment: createAssignment({ spiritWood: 2, darkIron: 1 }),
        });
        // 2×2 + 1×3 = 7
        assert.equal(economy.upkeepPerCycle(state), 7);
    });
});

describe('停工联动', () => {
    test('灵粮不足时高价岗位停工', () => {
        const clock = makeClock();
        const economy = makeEconomy(clock);
        clock.advance(30);

        const state = makeState({
            stock: {
                spiritGrain: 0,
                spiritWood: 0,
                darkIron: 0,
                spiritStone: 0,
                gengJing: 0,
            },
            assignment: createAssignment({ gengJing: 1 }),
        });
        const result = economy.settle(state);

        assert.deepEqual([...result.output.shutdownJobs], ['gengJing']);
        assert.equal(result.state.stock.gengJing, 0);
    });

    test('库存始终非负（PRD-02 §8）', () => {
        const clock = makeClock();
        const economy = makeEconomy(clock, 3600);
        clock.advance(600);

        const state = makeState({
            stock: {
                spiritGrain: 1,
                spiritWood: 0,
                darkIron: 0,
                spiritStone: 0,
                gengJing: 0,
            },
            assignment: createAssignment({ spiritWood: 5, gengJing: 5 }),
        });
        const result = economy.settle(state);

        for (const value of Object.values(result.state.stock)) {
            assert.ok(value >= 0, `库存为负: ${value}`);
        }
    });
});

describe('资源储量上限', () => {
    test('新增产出不会超过配置上限', () => {
        const clock = makeClock();
        const economy = makeEconomy(clock);
        clock.advance(30);
        const result = economy.settle(
            makeState({
                stock: {
                    spiritGrain: 198,
                    spiritWood: 0,
                    darkIron: 0,
                    spiritStone: 0,
                    gengJing: 0,
                },
                assignment: createAssignment({ spiritGrain: 5 }),
                storageCaps: { spiritGrain: 200 },
            }),
        );
        assert.equal(result.state.stock.spiritGrain, 200);
    });

    test('旧档超额库存不会被一次结算没收', () => {
        const clock = makeClock();
        const economy = makeEconomy(clock);
        clock.advance(30);
        const result = economy.settle(
            makeState({
                stock: {
                    spiritGrain: 250,
                    spiritWood: 0,
                    darkIron: 0,
                    spiritStone: 0,
                    gengJing: 0,
                },
                assignment: createAssignment({ spiritGrain: 5 }),
                storageCaps: { spiritGrain: 200 },
            }),
        );
        assert.equal(result.state.stock.spiritGrain, 250);
    });
});
