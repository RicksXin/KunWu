import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateDataBundle } from 'db://assets/scripts/domain/DataValidator';
import type { DataBundle } from 'db://assets/scripts/domain/DataValidator';
import { SKILLS_PER_CAREER } from 'db://assets/scripts/domain/CareerTypes';
import {
    makeValidBundle,
    makeSkill,
    makeCareer,
    makeMap,
} from './fixtures/dataBundle.ts';

/** 断言恰好命中预期规则，且没有夹带其它错误。 */
function assertSingleError(bundle: DataBundle, pattern: RegExp): void {
    const report = validateDataBundle(bundle);
    const matched = report.errors.filter((issue) => pattern.test(issue.message));
    assert.equal(
        matched.length,
        1,
        `期望恰好 1 条匹配 ${pattern} 的错误，实际 ${matched.length} 条。全部错误：\n${report.errors
            .map((issue) => `${issue.table}.${issue.rowKey}: ${issue.message}`)
            .join('\n')}`,
    );
}

describe('基线数据', () => {
    test('合法数据集无错误', () => {
        const report = validateDataBundle(makeValidBundle());
        assert.equal(
            report.hasErrors,
            false,
            `基线数据应无错误，实际：\n${report.format()}`,
        );
    });

    test('合法数据集也无警告，保证测试信噪比', () => {
        const report = validateDataBundle(makeValidBundle());
        assert.deepEqual(
            report.warnings.map((issue) => issue.message),
            [],
        );
    });
});

describe('规则一：ID 唯一', () => {
    test('技能 ID 重复被拒', () => {
        const bundle = makeValidBundle();
        assertSingleError(
            { ...bundle, skills: [...bundle.skills, makeSkill('slash')] },
            /ID 重复/,
        );
    });

    test('地图 ID 重复被拒', () => {
        const bundle = makeValidBundle();
        assertSingleError({ ...bundle, maps: [...bundle.maps, makeMap('map_01')] }, /ID 重复/);
    });

    test('同一地图内对象 ID 重复被拒', () => {
        const bundle = makeValidBundle();
        const map = makeMap('map_03', {
            objects: [
                { id: 'node_a', kind: 'resource_node', x: 1, y: 1, initialState: 'HIDDEN' },
                { id: 'node_a', kind: 'resource_node', x: 2, y: 2, initialState: 'HIDDEN' },
            ],
        });
        const localizationKeys = new Set([...bundle.localizationKeys, map.nameKey]);
        assertSingleError(
            { ...bundle, maps: [...bundle.maps, map], localizationKeys },
            /对象 ID 重复/,
        );
    });

    test('ID 不符合小写蛇形被拒', () => {
        const bundle = makeValidBundle();
        const bad = makeSkill('BadSkill');
        assertSingleError(
            {
                ...bundle,
                skills: [...bundle.skills, bad],
                careers: [
                    ...bundle.careers,
                    makeCareer('ti_xiu', ['BadSkill', 'x_a', 'x_b']),
                ],
                localizationKeys: new Set([
                    ...bundle.localizationKeys,
                    bad.nameKey,
                    'career.ti_xiu',
                ]),
            },
            /小写蛇形/,
        );
    });
});

describe('规则二：引用存在', () => {
    test('职业引用不存在的技能被拒', () => {
        const bundle = makeValidBundle();
        assertSingleError(
            {
                ...bundle,
                careers: [
                    makeCareer('wu_xiu', ['slash', 'taunt', 'ghost_skill']),
                    ...bundle.careers.slice(1),
                ],
            },
            /不存在的技能/,
        );
    });

    test('掉落表引用不存在的物品被拒', () => {
        const bundle = makeValidBundle();
        assertSingleError(
            {
                ...bundle,
                dropTables: [
                    { id: 'drop_common_enemy', entries: [{ itemId: 'ghost_item', weight: 10 }] },
                ],
            },
            /不存在的物品/,
        );
    });

    test('出口条件引用不存在的任务被拒', () => {
        const bundle = makeValidBundle();
        assertSingleError({ ...bundle, quests: [] }, /不存在的任务/);
    });
});

describe('规则三：每职业恰好三技能', () => {
    test('少于三个被拒', () => {
        const bundle = makeValidBundle();
        assertSingleError(
            {
                ...bundle,
                careers: [makeCareer('wu_xiu', ['slash', 'taunt']), ...bundle.careers.slice(1)],
            },
            new RegExp(`必须恰好 ${SKILLS_PER_CAREER} 个`),
        );
    });

    test('多于三个被拒', () => {
        const bundle = makeValidBundle();
        // 复用已有技能会触发「被多个职业共用」，故新增专属技能
        const extra = makeSkill('extra_strike');
        assertSingleError(
            {
                ...bundle,
                skills: [...bundle.skills, extra],
                careers: [
                    makeCareer('wu_xiu', ['slash', 'taunt', 'charge', 'extra_strike']),
                    ...bundle.careers.slice(1),
                ],
                localizationKeys: new Set([...bundle.localizationKeys, extra.nameKey]),
            },
            new RegExp(`必须恰好 ${SKILLS_PER_CAREER} 个`),
        );
    });

    test('同一职业内技能重复被拒', () => {
        const bundle = makeValidBundle();
        const report = validateDataBundle({
            ...bundle,
            careers: [makeCareer('wu_xiu', ['slash', 'slash', 'charge']), ...bundle.careers.slice(1)],
        });
        assert.ok(report.errors.some((issue) => /技能重复/.test(issue.message)));
    });

    test('技能被多个职业共用被拒（PRD-03 §6）', () => {
        const bundle = makeValidBundle();
        const report = validateDataBundle({
            ...bundle,
            careers: [
                bundle.careers[0]!,
                makeCareer('hu_shan_wei', ['slash', 'shield_wall', 'iron_body'], {
                    tier: 'tier_1',
                    parentCareerId: 'wu_xiu',
                }),
            ],
        });
        assert.ok(report.errors.some((issue) => /被多个职业节点共用/.test(issue.message)));
    });
});

describe('规则四：地图对象坐标合法', () => {
    test('坐标超出地图边界被拒', () => {
        const bundle = makeValidBundle();
        const map = makeMap('map_05', {
            width: 10,
            height: 10,
            objects: [{ id: 'far_node', kind: 'resource_node', x: 50, y: 3, initialState: 'HIDDEN' }],
        });
        assertSingleError(
            {
                ...bundle,
                maps: [...bundle.maps, map],
                localizationKeys: new Set([...bundle.localizationKeys, map.nameKey]),
            },
            /超出地图范围/,
        );
    });

    test('负坐标被拒', () => {
        const bundle = makeValidBundle();
        const map = makeMap('map_05', {
            objects: [{ id: 'neg_node', kind: 'resource_node', x: -1, y: 3, initialState: 'HIDDEN' }],
        });
        assertSingleError(
            {
                ...bundle,
                maps: [...bundle.maps, map],
                localizationKeys: new Set([...bundle.localizationKeys, map.nameKey]),
            },
            /超出地图范围/,
        );
    });

    test('非整数坐标被拒（技术方案 §9.1）', () => {
        const bundle = makeValidBundle();
        const map = makeMap('map_05', {
            objects: [{ id: 'frac_node', kind: 'resource_node', x: 1.5, y: 3, initialState: 'HIDDEN' }],
        });
        assertSingleError(
            {
                ...bundle,
                maps: [...bundle.maps, map],
                localizationKeys: new Set([...bundle.localizationKeys, map.nameKey]),
            },
            /坐标必须为整数/,
        );
    });

    test('起始格超出边界被拒', () => {
        const bundle = makeValidBundle();
        const map = makeMap('map_05', { width: 8, height: 8, entryX: 99, entryY: 0 });
        assertSingleError(
            {
                ...bundle,
                maps: [...bundle.maps, map],
                localizationKeys: new Set([...bundle.localizationKeys, map.nameKey]),
            },
            /起始格/,
        );
    });

    test('同格重叠对象给警告而非错误', () => {
        const bundle = makeValidBundle();
        const map = makeMap('map_05', {
            objects: [
                { id: 'node_a', kind: 'resource_node', x: 5, y: 5, initialState: 'HIDDEN' },
                { id: 'node_b', kind: 'treasure_chest', x: 5, y: 5, initialState: 'HIDDEN' },
            ],
        });
        const report = validateDataBundle({
            ...bundle,
            maps: [...bundle.maps, map],
            localizationKeys: new Set([...bundle.localizationKeys, map.nameKey]),
        });
        assert.equal(report.hasErrors, false);
        assert.ok(report.warnings.some((issue) => /占用同一格/.test(issue.message)));
    });
});

describe('规则五：出口目标存在', () => {
    test('目标地图不存在被拒', () => {
        const bundle = makeValidBundle();
        // 移除 map_04，使 map_02 的条件出口悬空
        assertSingleError(
            { ...bundle, maps: bundle.maps.filter((map) => map.id !== 'map_04') },
            /出口目标地图不存在/,
        );
    });

    test('出口缺少 targetMapId 被拒', () => {
        const bundle = makeValidBundle();
        const map = makeMap('map_05', {
            objects: [{ id: 'broken_exit', kind: 'map_exit', x: 1, y: 1, initialState: 'HIDDEN' }],
        });
        const report = validateDataBundle({
            ...bundle,
            maps: [...bundle.maps, map],
            localizationKeys: new Set([...bundle.localizationKeys, map.nameKey]),
        });
        assert.ok(report.errors.some((issue) => /必须声明 targetMapId/.test(issue.message)));
    });

    test('出口指向自身被拒', () => {
        const bundle = makeValidBundle();
        const map = makeMap('map_05', {
            objects: [
                {
                    id: 'self_exit',
                    kind: 'map_exit',
                    x: 1,
                    y: 1,
                    initialState: 'HIDDEN',
                    targetMapId: 'map_05',
                    isOneWay: false,
                },
            ],
        });
        assertSingleError(
            {
                ...bundle,
                maps: [...bundle.maps, map],
                localizationKeys: new Set([...bundle.localizationKeys, map.nameKey]),
            },
            /不能指向所属地图自身/,
        );
    });

    test('未声明 isOneWay 给警告（PRD-05 §9）', () => {
        const bundle = makeValidBundle();
        const map = makeMap('map_05', {
            objects: [
                {
                    id: 'vague_exit',
                    kind: 'map_exit',
                    x: 1,
                    y: 1,
                    initialState: 'HIDDEN',
                    targetMapId: 'map_01',
                },
            ],
        });
        const report = validateDataBundle({
            ...bundle,
            maps: [...bundle.maps, map],
            localizationKeys: new Set([...bundle.localizationKeys, map.nameKey]),
        });
        assert.equal(report.hasErrors, false);
        assert.ok(report.warnings.some((issue) => /isOneWay/.test(issue.message)));
    });
});

describe('规则六：掉落权重合法', () => {
    test('权重为 0 被拒', () => {
        const bundle = makeValidBundle();
        assertSingleError(
            {
                ...bundle,
                dropTables: [
                    { id: 'drop_common_enemy', entries: [{ itemId: 'iron_sword', weight: 0 }] },
                ],
            },
            /权重必须为正整数/,
        );
    });

    test('负权重被拒', () => {
        const bundle = makeValidBundle();
        assertSingleError(
            {
                ...bundle,
                dropTables: [
                    { id: 'drop_common_enemy', entries: [{ itemId: 'iron_sword', weight: -5 }] },
                ],
            },
            /权重必须为正整数/,
        );
    });

    test('非整数权重被拒', () => {
        const bundle = makeValidBundle();
        assertSingleError(
            {
                ...bundle,
                dropTables: [
                    { id: 'drop_common_enemy', entries: [{ itemId: 'iron_sword', weight: 1.5 }] },
                ],
            },
            /权重必须为正整数/,
        );
    });

    test('空掉落表被拒', () => {
        const bundle = makeValidBundle();
        assertSingleError(
            { ...bundle, dropTables: [{ id: 'drop_common_enemy', entries: [] }] },
            /不能为空/,
        );
    });
});

describe('规则七：文本 Key 存在', () => {
    test('技能 nameKey 缺失被拒', () => {
        const bundle = makeValidBundle();
        const keys = new Set(bundle.localizationKeys);
        keys.delete('skill.slash');
        assertSingleError({ ...bundle, localizationKeys: keys }, /本地化 Key 不存在/);
    });

    test('地图 nameKey 缺失被拒', () => {
        const bundle = makeValidBundle();
        const keys = new Set(bundle.localizationKeys);
        keys.delete('map.map_01');
        assertSingleError({ ...bundle, localizationKeys: keys }, /本地化 Key 不存在/);
    });
});

describe('技能与职业树附加约束', () => {
    test('造成伤害但未声明加成属性被拒（技术方案 §10.1）', () => {
        const bundle = makeValidBundle();
        assertSingleError(
            {
                ...bundle,
                skills: [
                    makeSkill('slash', { damageKind: 'magical', scalingAttribute: undefined }),
                    ...bundle.skills.slice(1),
                ],
            },
            /必须声明 scalingAttribute/,
        );
    });

    test('一转职业缺少前置被拒', () => {
        const bundle = makeValidBundle();
        assertSingleError(
            {
                ...bundle,
                careers: [
                    bundle.careers[0]!,
                    makeCareer('hu_shan_wei', ['guard_stance', 'shield_wall', 'iron_body'], {
                        tier: 'tier_1',
                        parentCareerId: null,
                    }),
                ],
            },
            /必须声明 parentCareerId/,
        );
    });

    test('一转前置指向另一个一转被拒', () => {
        const bundle = makeValidBundle();
        const extraSkills = [makeSkill('s_x'), makeSkill('s_y'), makeSkill('s_z')];
        const report = validateDataBundle({
            ...bundle,
            skills: [...bundle.skills, ...extraSkills],
            careers: [
                ...bundle.careers,
                makeCareer('deep_tier', ['s_x', 's_y', 's_z'], {
                    tier: 'tier_1',
                    parentCareerId: 'hu_shan_wei',
                }),
            ],
            localizationKeys: new Set([
                ...bundle.localizationKeys,
                ...extraSkills.map((skill) => skill.nameKey),
                'career.deep_tier',
            ]),
        });
        assert.ok(report.errors.some((issue) => /前置职业必须为初始职业/.test(issue.message)));
    });

    test('初始职业带 parentCareerId 被拒', () => {
        const bundle = makeValidBundle();
        assertSingleError(
            {
                ...bundle,
                careers: [
                    makeCareer('wu_xiu', ['slash', 'taunt', 'charge'], {
                        parentCareerId: 'hu_shan_wei',
                    }),
                    ...bundle.careers.slice(1),
                ],
            },
            /初始职业不应有 parentCareerId/,
        );
    });

    test('未被引用的技能给警告', () => {
        const bundle = makeValidBundle();
        const orphan = makeSkill('orphan_skill');
        const report = validateDataBundle({
            ...bundle,
            skills: [...bundle.skills, orphan],
            localizationKeys: new Set([...bundle.localizationKeys, orphan.nameKey]),
        });
        assert.equal(report.hasErrors, false);
        assert.ok(report.warnings.some((issue) => /未被任何职业引用/.test(issue.message)));
    });

    test('负冷却被拒', () => {
        const bundle = makeValidBundle();
        assertSingleError(
            {
                ...bundle,
                skills: [makeSkill('slash', { cooldownTicks: -1 }), ...bundle.skills.slice(1)],
            },
            /cooldownTicks 必须为非负整数/,
        );
    });
});

describe('ValidationReport', () => {
    test('format 在无问题时给出明确结论', () => {
        const report = validateDataBundle(makeValidBundle());
        assert.equal(report.format(), '数据校验通过');
    });

    test('format 列出错误位置与数量', () => {
        const bundle = makeValidBundle();
        const report = validateDataBundle({ ...bundle, quests: [] });
        assert.match(report.format(), /个错误/);
        assert.match(report.format(), /map_objects/);
    });
});
