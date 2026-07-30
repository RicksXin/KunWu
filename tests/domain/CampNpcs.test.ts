import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CEN_SHOUYI_INTRO_DIALOGUE,
    availableCampNpcs,
    completeCampNpcDialogue,
    dialogueForCampNpc,
} from 'db://assets/scripts/domain/CampNpcs';

describe('营地人物列表', () => {
    test('新档只显示岑守一', () => {
        const npcs = availableCampNpcs({ tutorial_started: false });
        assert.equal(npcs.length, 1);
        assert.equal(npcs[0]?.id, 'npc_cen_shouyi');
        assert.equal(npcs[0]?.name, '岑守一');
        assert.equal(npcs[0]?.status, '有任务');
    });

    test('初次对话完成后状态变为可交谈', () => {
        const flags = completeCampNpcDialogue('npc_cen_shouyi', {});
        assert.equal(flags.met_cen_shou_yi, true);
        assert.equal(flags.tutorial_started, true);
        assert.equal(availableCampNpcs(flags)[0]?.status, '可交谈');
    });
});

describe('岑守一对话', () => {
    test('新档进入初次交接对话', () => {
        assert.deepEqual(dialogueForCampNpc('npc_cen_shouyi', {}), CEN_SHOUYI_INTRO_DIALOGUE);
    });

    test('每句不超过 36 个字符', () => {
        for (const line of CEN_SHOUYI_INTRO_DIALOGUE) {
            assert.ok(line.length <= 36, `${line.length}: ${line}`);
        }
    });

    test('初次交接后使用简短重复对话', () => {
        const lines = dialogueForCampNpc('npc_cen_shouyi', { met_cen_shou_yi: true });
        assert.equal(lines.length, 1);
        assert.notDeepEqual(lines, CEN_SHOUYI_INTRO_DIALOGUE);
    });
});
