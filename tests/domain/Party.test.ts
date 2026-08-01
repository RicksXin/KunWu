import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    MIN_PARTY_PRESETS,
    createEmptyParty,
    createPreset,
    membersOf,
    partySize,
    isFull,
    assignToSlot,
    clearSlot,
    swapSlots,
    pruneDead,
    validateForExpedition,
    validatePresets,
} from 'db://assets/scripts/domain/Party';
import type { HeroSnapshot } from 'db://assets/scripts/domain/Party';
import { MAX_PARTY_SIZE } from 'db://assets/scripts/domain/CombatTypes';

const HEROES: readonly HeroSnapshot[] = [
    { instanceId: 'h1', isDead: false },
    { instanceId: 'h2', isDead: false },
    { instanceId: 'h3', isDead: false },
    { instanceId: 'h4', isDead: false },
    { instanceId: 'h5', isDead: false },
    { instanceId: 'dead1', isDead: true },
];

/** 便捷编队，逐个放入槽位。 */
function partyOf(...ids: (string | null)[]) {
    const slots = createEmptyParty() as (string | null)[];
    ids.forEach((id, i) => {
        if (i < MAX_PARTY_SIZE) {
            slots[i] = id;
        }
    });
    return slots as readonly (string | null)[];
}

describe('队伍规模（PRD-04 §2）', () => {
    test('固定 4 人', () => {
        assert.equal(MAX_PARTY_SIZE, 4);
        assert.equal(createEmptyParty().length, 4);
    });

    test('空队伍全为 null', () => {
        assert.deepEqual([...createEmptyParty()], [null, null, null, null]);
    });

    test('成员统计跳过空位', () => {
        const slots = partyOf('h1', null, 'h2', null);
        assert.deepEqual([...membersOf(slots)], ['h1', 'h2']);
        assert.equal(partySize(slots), 2);
    });

    test('满编判定', () => {
        assert.equal(isFull(partyOf('h1', 'h2', 'h3', 'h4')), true);
        assert.equal(isFull(partyOf('h1', 'h2', 'h3')), false);
    });
});

describe('上阵（PRD-04 §2）', () => {
    test('放入空槽位成功', () => {
        const result = assignToSlot({
            slots: createEmptyParty(),
            slotIndex: 0,
            heroId: 'h1',
            heroes: HEROES,
        });
        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.slots[0], 'h1');
        }
    });

    test('死亡修士不能上阵', () => {
        const result = assignToSlot({
            slots: createEmptyParty(),
            slotIndex: 0,
            heroId: 'dead1',
            heroes: HEROES,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.reason, 'hero_dead');
        }
    });

    test('同一修士不能占两个槽位', () => {
        const result = assignToSlot({
            slots: partyOf('h1', null, null, null),
            slotIndex: 2,
            heroId: 'h1',
            heroes: HEROES,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.reason, 'duplicate_in_party');
        }
    });

    test('放回自己原槽位视为合法（重复点击）', () => {
        const result = assignToSlot({
            slots: partyOf('h1', null, null, null),
            slotIndex: 0,
            heroId: 'h1',
            heroes: HEROES,
        });
        assert.equal(result.ok, true);
    });

    test('已在另一队伍的修士不能上阵', () => {
        // PRD-04 §2：同一角色不能出现在多个活动队伍
        const result = assignToSlot({
            slots: createEmptyParty(),
            slotIndex: 0,
            heroId: 'h2',
            heroes: HEROES,
            otherPartyMembers: ['h2', 'h3'],
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.reason, 'in_another_party');
        }
    });

    test('不存在的修士被拒', () => {
        const result = assignToSlot({
            slots: createEmptyParty(),
            slotIndex: 0,
            heroId: 'ghost',
            heroes: HEROES,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
            assert.equal(result.reason, 'hero_not_found');
        }
    });

    test('槽位越界被拒', () => {
        for (const index of [-1, MAX_PARTY_SIZE, 99, 1.5]) {
            const result = assignToSlot({
                slots: createEmptyParty(),
                slotIndex: index,
                heroId: 'h1',
                heroes: HEROES,
            });
            assert.equal(result.ok, false, `槽位 ${index} 应被拒`);
        }
    });

    test('覆盖已占用的槽位（换人）', () => {
        const result = assignToSlot({
            slots: partyOf('h1', null, null, null),
            slotIndex: 0,
            heroId: 'h2',
            heroes: HEROES,
        });
        assert.equal(result.ok, true);
        if (result.ok) {
            assert.equal(result.slots[0], 'h2');
        }
    });

    test('不修改原数组', () => {
        const original = createEmptyParty();
        assignToSlot({ slots: original, slotIndex: 0, heroId: 'h1', heroes: HEROES });
        assert.equal(original[0], null, '原数组被修改');
    });
});

describe('移除与交换', () => {
    test('清空槽位', () => {
        const slots = clearSlot(partyOf('h1', 'h2', null, null), 0);
        assert.equal(slots[0], null);
        assert.equal(slots[1], 'h2');
    });

    test('越界清空原样返回，不抛错', () => {
        // 重复点击移除按钮很常见
        const slots = partyOf('h1', null, null, null);
        assert.deepEqual([...clearSlot(slots, 99)], [...slots]);
    });

    test('交换两个槽位', () => {
        const slots = swapSlots(partyOf('h1', 'h2', null, null), 0, 1);
        assert.equal(slots[0], 'h2');
        assert.equal(slots[1], 'h1');
    });

    test('与空位交换', () => {
        const slots = swapSlots(partyOf('h1', null, null, null), 0, 3);
        assert.equal(slots[0], null);
        assert.equal(slots[3], 'h1');
    });

    test('越界交换原样返回', () => {
        const slots = partyOf('h1', 'h2', null, null);
        assert.deepEqual([...swapSlots(slots, 0, 99)], [...slots]);
    });

    test('交换不改变成员集合', () => {
        // 「无站位承伤」：交换只影响显示顺序
        const before = partyOf('h1', 'h2', 'h3', null);
        const after = swapSlots(before, 0, 2);
        assert.deepEqual(
            [...membersOf(after)].sort(),
            [...membersOf(before)].sort(),
        );
    });
});

describe('清理死亡成员（PRD-03 §10）', () => {
    test('移除死亡的成员', () => {
        const slots = pruneDead(partyOf('h1', 'dead1', 'h2', null), HEROES);
        assert.equal(slots[1], null);
        assert.equal(slots[0], 'h1');
    });

    test('无死亡时不变', () => {
        const before = partyOf('h1', 'h2', null, null);
        assert.deepEqual([...pruneDead(before, HEROES)], [...before]);
    });

    test('全员死亡后队伍为空', () => {
        const allDead: readonly HeroSnapshot[] = [
            { instanceId: 'h1', isDead: true },
            { instanceId: 'h2', isDead: true },
        ];
        const slots = pruneDead(partyOf('h1', 'h2', null, null), allDead);
        assert.equal(partySize(slots), 0);
    });
});

describe('入山校验', () => {
    test('满编存活队伍通过', () => {
        const result = validateForExpedition(partyOf('h1', 'h2', 'h3', 'h4'), HEROES);
        assert.equal(result.isValid, true);
        assert.deepEqual([...result.problems], []);
    });

    test('空队伍被拒', () => {
        const result = validateForExpedition(createEmptyParty(), HEROES);
        assert.equal(result.isValid, false);
        assert.ok(result.problems.some((p) => /为空/.test(p)));
    });

    test('含死亡成员被拒', () => {
        const result = validateForExpedition(partyOf('h1', 'dead1', null, null), HEROES);
        assert.equal(result.isValid, false);
        assert.ok(result.problems.some((p) => /已死亡/.test(p)));
    });

    test('含不存在的修士被拒', () => {
        const result = validateForExpedition(partyOf('h1', 'ghost', null, null), HEROES);
        assert.ok(result.problems.some((p) => /不存在/.test(p)));
    });

    test('一次列出全部问题', () => {
        // 玩家应一次看到所有需要修的地方
        const result = validateForExpedition(partyOf('dead1', 'ghost', null, null), HEROES);
        assert.ok(result.problems.length >= 2, `只报告了 ${result.problems.length} 个问题`);
    });

    test('未满编但有存活成员可通过', () => {
        // PRD 未要求必须满编才能入山
        const result = validateForExpedition(partyOf('h1', null, null, null), HEROES);
        assert.equal(result.isValid, true);
    });
});

describe('预设（PRD-04 §2：初始 1 队）', () => {
    test('至少保留第 1 队', () => {
        assert.equal(MIN_PARTY_PRESETS, 1);
    });

    test('1 套通过校验', () => {
        const presets = [createPreset('p1', '1队')];
        assert.equal(validatePresets(presets).isValid, true);
    });

    test('没有任何队伍被拒', () => {
        const presets: ReturnType<typeof createPreset>[] = [];
        const result = validatePresets(presets);
        assert.equal(result.isValid, false);
        assert.ok(result.problems.some((p) => /至少 1 套/.test(p)));
    });

    test('预设 ID 重复被拒', () => {
        const presets = ['p1', 'p1', 'p3'].map((id) => createPreset(id, id));
        assert.ok(validatePresets(presets).problems.some((p) => /重复/.test(p)));
    });

    test('新建预设为空队伍', () => {
        const preset = createPreset('p1', '主力');
        assert.equal(partySize(preset.slots), 0);
        assert.equal(preset.name, '主力');
    });
});
