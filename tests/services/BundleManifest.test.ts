import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    BUNDLE_NAMES,
    BOOT_BUNDLES,
    PRELOAD_RULES,
    CONDITIONAL_PRELOAD,
    MAP_BUNDLES,
    isMapBundle,
    isBootBundle,
    validateManifest,
} from 'db://assets/scripts/services/BundleManifest';

describe('Bundle 清单自洽', () => {
    test('清单无内部矛盾', () => {
        const problems = validateManifest();
        assert.deepEqual(problems, [], `清单存在问题：\n${problems.join('\n')}`);
    });

    test('包含 PRD-10 §3 列出的全部包', () => {
        // 清单缺包会导致运行期才报「找不到 Bundle」
        for (const expected of [
            'start-scene',
            'shared',
            'camp',
            'career_base',
            'career_tier_1',
            'map_01',
            'map_02',
            'map_03',
            'map_04',
            'map_05',
        ]) {
            assert.ok(
                (BUNDLE_NAMES as readonly string[]).includes(expected),
                `缺少包 ${expected}`,
            );
        }
    });

    test('包名无重复', () => {
        assert.equal(new Set(BUNDLE_NAMES).size, BUNDLE_NAMES.length);
    });
});

describe('首屏包', () => {
    test('只含启动与 shared（PRD-10 §3）', () => {
        assert.deepEqual([...BOOT_BUNDLES], ['start-scene', 'shared']);
    });

    test('不含任何地图包', () => {
        // 地图资源进首包会直接击穿 25MB 首屏预算（PRD-10 §7）
        for (const bundle of BOOT_BUNDLES) {
            assert.equal(isMapBundle(bundle), false, `${bundle} 不该在首屏`);
        }
    });

    test('不含营地或职业包', () => {
        for (const bundle of ['camp', 'career_base', 'career_tier_1'] as const) {
            assert.equal(isBootBundle(bundle), false, `${bundle} 不该在首屏`);
        }
    });
});

describe('预载规则', () => {
    test('营地预载 map_01（PRD-10 §3）', () => {
        assert.deepEqual([...(PRELOAD_RULES.camp ?? [])], ['map_01']);
    });

    test('预载目标均为已声明的包', () => {
        for (const [trigger, targets] of Object.entries(PRELOAD_RULES)) {
            for (const target of targets) {
                assert.ok(
                    (BUNDLE_NAMES as readonly string[]).includes(target),
                    `${trigger} 指向未声明的包 ${target}`,
                );
            }
        }
    });

    test('地图 2 到地图 4 是条件预载而非无条件', () => {
        // PRD-05 §3：地图 2 至地图 4 是隐藏条件出口
        const fromMap02 = PRELOAD_RULES.map_02 ?? [];
        assert.equal(
            (fromMap02 as readonly string[]).includes('map_04'),
            false,
            'map_02 不应无条件预载 map_04',
        );

        const rule = CONDITIONAL_PRELOAD.find(
            (item) => item.bundle === 'map_04' && item.fromMapId === 'map_02',
        );
        assert.ok(rule, '缺少 map_02 → map_04 的条件预载规则');
    });

    test('地图 3 到地图 4 是常规出口，无条件预载', () => {
        // PRD-05 §3：地图 3 至地图 4 是常规跨图
        assert.ok((PRELOAD_RULES.map_03 ?? []).includes('map_04'));
    });

    test('条件预载不与同来源的无条件预载重叠', () => {
        for (const rule of CONDITIONAL_PRELOAD) {
            const sameSource = PRELOAD_RULES[rule.fromMapId] ?? [];
            assert.equal(
                (sameSource as readonly string[]).includes(rule.bundle),
                false,
                `${rule.fromMapId} 对 ${rule.bundle} 的条件会被无条件预载抹掉`,
            );
        }
    });
});

describe('地图包判定', () => {
    test('五张地图全部识别为地图包', () => {
        assert.equal(MAP_BUNDLES.length, 5);
        for (const bundle of MAP_BUNDLES) {
            assert.equal(isMapBundle(bundle), true);
        }
    });

    test('非地图包不误判', () => {
        for (const name of ['shared', 'camp', 'start-scene', 'career_base']) {
            assert.equal(isMapBundle(name), false, `${name} 被误判为地图包`);
        }
    });

    test('未知包名不误判', () => {
        assert.equal(isMapBundle('map_99'), false);
        assert.equal(isBootBundle('nonexistent'), false);
    });
});
