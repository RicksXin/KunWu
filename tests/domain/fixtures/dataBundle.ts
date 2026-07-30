/**
 * 校验测试用的合法数据基线。
 *
 * 每个测试从这里克隆一份再破坏单一字段，
 * 以此确认「只有目标规则报错」，避免夹带其它错误造成假阳性。
 */

import type { DataBundle } from 'db://assets/scripts/domain/DataValidator';
import type { CareerDefinition, SkillDefinition } from 'db://assets/scripts/domain/CareerTypes';
import type { MapDefinition } from 'db://assets/scripts/domain/MapTypes';

export function makeSkill(id: string, overrides: Partial<SkillDefinition> = {}): SkillDefinition {
    return {
        id,
        nameKey: `skill.${id}`,
        damageKind: 'physical',
        scalingAttribute: 'strength',
        isSingleTarget: true,
        ignoreTaunt: false,
        cooldownTicks: 20,
        castTicks: 4,
        ...overrides,
    };
}

export function makeCareer(
    id: string,
    skillIds: readonly string[],
    overrides: Partial<CareerDefinition> = {},
): CareerDefinition {
    return {
        id,
        nameKey: `career.${id}`,
        tier: 'base',
        primaryAttribute: 'strength',
        skillIds,
        parentCareerId: null,
        ...overrides,
    };
}

export function makeMap(id: string, overrides: Partial<MapDefinition> = {}): MapDefinition {
    return {
        id,
        nameKey: `map.${id}`,
        width: 48,
        height: 64,
        entryX: 4,
        entryY: 4,
        objects: [],
        ...overrides,
    };
}

/** 一份通过全部规则的最小数据集。 */
export function makeValidBundle(): DataBundle {
    const skills = [
        makeSkill('slash'),
        makeSkill('taunt', { damageKind: 'none', scalingAttribute: undefined }),
        makeSkill('charge'),
        makeSkill('guard_stance'),
        makeSkill('shield_wall', { isSingleTarget: false, ignoreTaunt: true }),
        makeSkill('iron_body', { damageKind: 'none', scalingAttribute: undefined }),
    ];

    const careers = [
        makeCareer('wu_xiu', ['slash', 'taunt', 'charge']),
        makeCareer('hu_shan_wei', ['guard_stance', 'shield_wall', 'iron_body'], {
            tier: 'tier_1',
            parentCareerId: 'wu_xiu',
        }),
    ];

    const items = [
        { id: 'iron_sword', nameKey: 'item.iron_sword' },
        { id: 'gu_dian_ling', nameKey: 'item.gu_dian_ling' },
    ];

    const quests = [{ id: 'main_east_array' }];

    const maps = [
        makeMap('map_01', {
            objects: [
                {
                    id: 'exit_to_map_02',
                    kind: 'map_exit',
                    x: 10,
                    y: 20,
                    initialState: 'DISCOVERED',
                    targetMapId: 'map_02',
                    isOneWay: false,
                },
                {
                    id: 'check_ward',
                    kind: 'attribute_check',
                    x: 12,
                    y: 22,
                    initialState: 'HIDDEN',
                    attributeCheck: {
                        checkId: 'ward_disarm',
                        attribute: 'technique',
                        aggregate: 'SUM',
                        threshold: 30,
                    },
                },
            ],
        }),
        makeMap('map_02', {
            width: 64,
            height: 64,
            objects: [
                {
                    id: 'exit_to_map_04',
                    kind: 'map_exit',
                    x: 30,
                    y: 30,
                    initialState: 'HIDDEN',
                    targetMapId: 'map_04',
                    isOneWay: true,
                    exitCondition: {
                        requiredQuestIds: ['main_east_array'],
                        requiredItemIds: ['gu_dian_ling'],
                        attributeCheck: {
                            checkId: 'array_magic',
                            attribute: 'magic',
                            aggregate: 'SUM',
                            threshold: 80,
                        },
                    },
                },
            ],
        }),
        makeMap('map_04', { width: 72, height: 64 }),
    ];

    const dropTables = [
        {
            id: 'drop_common_enemy',
            entries: [
                { itemId: 'iron_sword', weight: 70 },
                { itemId: 'gu_dian_ling', weight: 30 },
            ],
        },
    ];

    const localizationKeys = new Set<string>([
        ...skills.map((skill) => skill.nameKey),
        ...careers.map((career) => career.nameKey),
        ...items.map((item) => item.nameKey),
        ...maps.map((map) => map.nameKey),
    ]);

    return { skills, careers, maps, dropTables, items, quests, localizationKeys };
}
