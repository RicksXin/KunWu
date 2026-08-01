import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PageStack } from 'db://assets/scripts/services/PageStack';

function makeStack(): PageStack {
    const stack = new PageStack();
    // 大厅是根页面，永远在栈底
    stack.push({ pageId: 'camp' });
    return stack;
}

describe('PageStack 页面栈', () => {
    test('初始只有根页面', () => {
        const stack = makeStack();
        assert.equal(stack.depth(), 1);
        assert.equal(stack.current()?.pageId, 'camp');
    });

    test('push 后 current 指向新页面', () => {
        const stack = makeStack();
        stack.push({ pageId: 'party' });
        assert.equal(stack.current()?.pageId, 'party');
        assert.equal(stack.depth(), 2);
    });

    test('pop 回到上一页', () => {
        const stack = makeStack();
        stack.push({ pageId: 'party' });
        const popped = stack.pop();
        assert.equal(popped?.pageId, 'party');
        assert.equal(stack.current()?.pageId, 'camp');
    });

    test('栈底页面不可弹出', () => {
        const stack = makeStack();
        // 弹掉根页面后就没有可显示的页面了
        assert.equal(stack.pop(), null);
        assert.equal(stack.depth(), 1);
    });

    test('params 原样保留', () => {
        const stack = makeStack();
        stack.push({ pageId: 'building', params: { buildingId: 'ling_pu' } });
        assert.deepEqual(stack.current()?.params, { buildingId: 'ling_pu' });
    });

    test('contains 能查出页面是否在栈中', () => {
        const stack = makeStack();
        stack.push({ pageId: 'map' });
        assert.equal(stack.contains('map'), true);
        assert.equal(stack.contains('combat'), false);
    });
});

describe('PageStack replaceRoot', () => {
    test('清空历史并设新根', () => {
        const stack = makeStack();
        stack.push({ pageId: 'party' });
        stack.push({ pageId: 'building' });

        stack.replaceRoot({ pageId: 'map' });

        // 入山后按返回不该退回营地大厅的旧实例
        assert.equal(stack.depth(), 1);
        assert.equal(stack.current()?.pageId, 'map');
        assert.equal(stack.pop(), null);
    });

    test('同时清空弹窗', () => {
        const stack = makeStack();
        stack.openModal({ modalId: 'confirm_expedition' });
        stack.replaceRoot({ pageId: 'map' });
        assert.equal(stack.modalDepth(), 0);
        assert.equal(stack.hasModal, false);
    });
});

describe('PageStack 弹窗', () => {
    test('打开与关闭', () => {
        const stack = makeStack();
        stack.openModal({ modalId: 'item_detail' });
        assert.equal(stack.hasModal, true);
        assert.equal(stack.currentModal()?.modalId, 'item_detail');

        const closed = stack.closeModal();
        assert.equal(closed?.modalId, 'item_detail');
        assert.equal(stack.hasModal, false);
    });

    test('可叠多层弹窗，后开先关', () => {
        const stack = makeStack();
        stack.openModal({ modalId: 'storehouse' });
        stack.openModal({ modalId: 'item_detail' });

        assert.equal(stack.closeModal()?.modalId, 'item_detail');
        assert.equal(stack.closeModal()?.modalId, 'storehouse');
        assert.equal(stack.closeModal(), null);
    });

    test('无弹窗时 closeModal 返回 null', () => {
        assert.equal(makeStack().closeModal(), null);
    });
});

describe('PageStack.goBack（PRD-09 §4）', () => {
    test('有弹窗时先关弹窗，不动页面', () => {
        const stack = makeStack();
        stack.push({ pageId: 'party' });
        stack.openModal({ modalId: 'hero_detail' });

        const result = stack.goBack();

        assert.equal(result.kind, 'closedModal');
        // 页面栈必须保持原样
        assert.equal(stack.current()?.pageId, 'party');
        assert.equal(stack.depth(), 2);
    });

    test('无弹窗时弹出页面', () => {
        const stack = makeStack();
        stack.push({ pageId: 'party' });

        const result = stack.goBack();

        assert.equal(result.kind, 'poppedPage');
        if (result.kind === 'poppedPage') {
            assert.equal(result.from.pageId, 'party');
            assert.equal(result.to.pageId, 'camp');
        }
    });

    test('栈底且无弹窗时返回 atRoot', () => {
        const result = makeStack().goBack();
        // 调用方据此决定提示退出还是忽略
        assert.equal(result.kind, 'atRoot');
    });

    test('多层弹窗逐层关闭后才弹页面', () => {
        const stack = makeStack();
        stack.push({ pageId: 'party' });
        stack.openModal({ modalId: 'a' });
        stack.openModal({ modalId: 'b' });

        assert.equal(stack.goBack().kind, 'closedModal');
        assert.equal(stack.goBack().kind, 'closedModal');
        assert.equal(stack.goBack().kind, 'poppedPage');
        assert.equal(stack.goBack().kind, 'atRoot');
    });

    test('连续 goBack 最终停在根页面而非清空', () => {
        const stack = makeStack();
        stack.push({ pageId: 'party' });
        stack.push({ pageId: 'building' });

        for (let i = 0; i < 10; i += 1) {
            stack.goBack();
        }

        assert.equal(stack.depth(), 1);
        assert.equal(stack.current()?.pageId, 'camp');
    });
});

describe('PageStack 输入层（技术方案 §12）', () => {
    test('无弹窗时页面层接收输入', () => {
        assert.equal(makeStack().activeLayer(), 'page');
    });

    test('有弹窗时切到弹窗层', () => {
        const stack = makeStack();
        stack.openModal({ modalId: 'confirm' });
        // 否则玩家能穿过遮罩误触页面按钮
        assert.equal(stack.activeLayer(), 'modal');
    });

    test('关闭弹窗后回到页面层', () => {
        const stack = makeStack();
        stack.openModal({ modalId: 'confirm' });
        stack.closeModal();
        assert.equal(stack.activeLayer(), 'page');
    });
});

describe('PageStack 快照', () => {
    test('列出页面与弹窗 ID', () => {
        const stack = makeStack();
        stack.push({ pageId: 'party' });
        stack.openModal({ modalId: 'hero_detail' });

        assert.deepEqual(stack.snapshot(), {
            pages: ['camp', 'party'],
            modals: ['hero_detail'],
        });
    });
});
