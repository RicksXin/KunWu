import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    runBootSequence,
    BOOT_STAGES,
    BOOT_STAGE_MESSAGE_KEYS,
} from 'db://assets/scripts/services/BootSequence';
import type { BootDeps } from 'db://assets/scripts/services/BootSequence';
import type { SaveLoadResult } from 'db://assets/scripts/services/SaveRepository';

function emptySave(): SaveLoadResult {
    return { status: 'empty', envelope: null, diagnostics: [] };
}

function okSave(): SaveLoadResult {
    return {
        status: 'ok',
        envelope: {
            schema_version: 1,
            game_version: '0.1.0',
            saved_at_utc: 1000,
            checksum: 'abcd1234',
            payload: {},
        },
        diagnostics: [],
    };
}

/** 全部成功的依赖，测试按需覆盖单项。 */
function makeDeps(overrides: Partial<BootDeps> = {}) {
    const calls: string[] = [];
    const stages: string[] = [];
    const deps: BootDeps = {
        loadBootBundles: async () => {
            calls.push('loadBootBundles');
        },
        loadBundle: async (name) => {
            calls.push(`loadBundle:${name}`);
        },
        preloadFor: (id) => {
            calls.push(`preloadFor:${id}`);
        },
        loadSave: async () => {
            calls.push('loadSave');
            return emptySave();
        },
        enterCamp: async () => {
            calls.push('enterCamp');
        },
        onStage: (stage) => stages.push(stage),
        ...overrides,
    };
    return { deps, calls, stages };
}

describe('启动流程顺序（PRD-10 §3、§4）', () => {
    test('成功路径按序执行全部步骤', async () => {
        const { deps, calls } = makeDeps();
        const result = await runBootSequence(deps);

        assert.equal(result.ok, true);
        assert.deepEqual(calls, [
            'loadBootBundles',
            'loadSave',
            'loadBundle:camp',
            'enterCamp',
            'preloadFor:camp',
        ]);
    });

    test('阶段回调按序广播，供启动画面更新文案', async () => {
        const { deps, stages } = makeDeps();
        await runBootSequence(deps);
        assert.deepEqual(stages, [
            'loadingBoot',
            'loadingSave',
            'loadingCamp',
            'enteringCamp',
            'done',
        ]);
    });

    test('先加载首屏包再读存档', async () => {
        const { deps, calls } = makeDeps();
        await runBootSequence(deps);
        // 存档层的代码可能在 shared 包里，顺序反了会找不到
        assert.ok(calls.indexOf('loadBootBundles') < calls.indexOf('loadSave'));
    });

    test('预载在进营地之后，不阻塞玩家操作', async () => {
        const { deps, calls } = makeDeps();
        await runBootSequence(deps);
        assert.ok(calls.indexOf('enterCamp') < calls.indexOf('preloadFor:camp'));
    });

    test('营地包在切场景前加载完成', async () => {
        const { deps, calls } = makeDeps();
        await runBootSequence(deps);
        assert.ok(calls.indexOf('loadBundle:camp') < calls.indexOf('enterCamp'));
    });
});

describe('启动失败处理（PRD-10 §8）', () => {
    test('首屏包失败时中止并返回错误码', async () => {
        const { deps, calls } = makeDeps({
            loadBootBundles: async () => {
                throw new Error('Bundle shared 加载失败（TECH-003-BUNDLE）');
            },
        });
        const result = await runBootSequence(deps);

        assert.equal(result.ok, false);
        assert.equal(result.failure?.kind, 'bootBundleFailed');
        assert.match(result.failure?.message ?? '', /TECH-003-BUNDLE/);
        // 后续步骤不该执行
        assert.equal(calls.includes('loadSave'), false);
    });

    test('营地包失败时保留已读到的存档', async () => {
        const { deps } = makeDeps({
            loadSave: async () => okSave(),
            loadBundle: async () => {
                throw new Error('camp 包不可用');
            },
        });
        const result = await runBootSequence(deps);

        assert.equal(result.ok, false);
        assert.equal(result.failure?.kind, 'campBundleFailed');
        // 存档已读到，不该丢——玩家可据此导出备份
        assert.equal(result.save?.status, 'ok');
    });

    test('存档准备失败时不进入营地', async () => {
        const { deps, calls } = makeDeps({
            loadSave: async () => {
                throw new Error('新档数据种子损坏');
            },
        });
        const result = await runBootSequence(deps);

        assert.equal(result.ok, false);
        assert.equal(result.failure?.kind, 'saveFailed');
        assert.match(result.failure?.message ?? '', /数据种子/);
        assert.equal(calls.includes('enterCamp'), false);
    });

    test('场景切换失败时报 sceneFailed', async () => {
        const { deps, calls } = makeDeps({
            enterCamp: async () => {
                throw new Error('找不到场景 Camp');
            },
        });
        const result = await runBootSequence(deps);

        assert.equal(result.failure?.kind, 'sceneFailed');
        // 失败后不该继续预载
        assert.equal(calls.includes('preloadFor:camp'), false);
    });

    test('失败时 stagesCompleted 记录已完成到哪一步', async () => {
        const { deps } = makeDeps({
            loadBundle: async () => {
                throw new Error('boom');
            },
        });
        const result = await runBootSequence(deps);
        // 便于诊断卡在哪个阶段
        assert.deepEqual([...result.stagesCompleted], ['loadingBoot', 'loadingSave']);
    });
});

describe('存档诊断', () => {
    test('回退备份时通知 UI，但不阻断启动', async () => {
        const diagnostics: string[][] = [];
        const { deps } = makeDeps({
            loadSave: async () => ({
                status: 'recovered_from_backup',
                envelope: okSave().envelope,
                diagnostics: ['主档校验值不匹配（期望 aaaa，实际 bbbb）'],
            }),
            onSaveDiagnostics: (d) => diagnostics.push([...d]),
        });
        const result = await runBootSequence(deps);

        // 坏档不该让玩家进不去游戏，但必须告知
        assert.equal(result.ok, true);
        assert.equal(diagnostics.length, 1);
        assert.match(diagnostics[0]![0]!, /校验值不匹配/);
    });

    test('无诊断信息时不触发回调', async () => {
        let called = 0;
        const { deps } = makeDeps({ onSaveDiagnostics: () => (called += 1) });
        await runBootSequence(deps);
        assert.equal(called, 0);
    });

    test('新档（empty）也能正常进入营地', async () => {
        const { deps, calls } = makeDeps();
        const result = await runBootSequence(deps);
        assert.equal(result.ok, true);
        assert.equal(result.save?.status, 'empty');
        assert.ok(calls.includes('enterCamp'));
    });
});

describe('阶段常量', () => {
    test('每个阶段都有对应文案 Key', () => {
        for (const stage of BOOT_STAGES) {
            const key = BOOT_STAGE_MESSAGE_KEYS[stage];
            assert.ok(key, `${stage} 缺少文案 Key`);
            assert.match(key, /^splash\./);
        }
    });

    test('阶段无重复', () => {
        assert.equal(new Set(BOOT_STAGES).size, BOOT_STAGES.length);
    });

    test('onStage 缺省时不报错', async () => {
        const { deps } = makeDeps();
        const withoutCallback = { ...deps, onStage: undefined };
        const result = await runBootSequence(withoutCallback);
        assert.equal(result.ok, true);
    });
});
