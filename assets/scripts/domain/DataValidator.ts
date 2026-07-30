/**
 * 构建前数据校验（PRD-10 §6、任务 P0-TECH-003）。
 *
 * 覆盖 PRD-10 §6 列出的七条规则：
 *   ID 唯一、引用存在、每职业恰好三技能、地图对象坐标合法、
 *   出口目标存在、掉落权重合法、文本 Key 存在。
 *
 * 纯函数、无引擎依赖，可直接单测，也可在构建脚本中调用。
 */

import { ValidationReport } from './ValidationReport';
import { ATTRIBUTE_KEYS } from './Attributes';
import type { AttributeCheck } from './Attributes';
import { SKILLS_PER_CAREER } from './CareerTypes';
import type { CareerDefinition, SkillDefinition } from './CareerTypes';
import { MAP_OBJECT_KINDS, MAP_OBJECT_STATES } from './MapTypes';
import { SKILL_TARGET_TYPES, isTauntable, isEnemyTarget } from './SkillTargeting';
import type { MapDefinition, MapObjectDefinition } from './MapTypes';

/** ID 命名规范：英文小写蛇形（CLAUDE.md）。 */
export const ID_PATTERN = /^[a-z][a-z0-9_]*$/;

export interface DropEntry {
    readonly itemId: string;
    /** 权重必须为正整数：0 或负数在加权随机中无意义。 */
    readonly weight: number;
}

export interface DropTableDefinition {
    readonly id: string;
    readonly entries: readonly DropEntry[];
}

export interface DataBundle {
    readonly skills: readonly SkillDefinition[];
    readonly careers: readonly CareerDefinition[];
    readonly maps: readonly MapDefinition[];
    readonly dropTables: readonly DropTableDefinition[];
    readonly items: readonly { readonly id: string; readonly nameKey: string }[];
    readonly quests: readonly { readonly id: string }[];
    /** 本地化 Key 集合，用于校验文本引用（PRD-10 §6）。 */
    readonly localizationKeys: ReadonlySet<string>;
}

/** 校验 ID 格式与唯一性，返回去重后的 ID 集合。 */
function collectIds(
    report: ValidationReport,
    table: string,
    rows: readonly { readonly id: string }[],
): Set<string> {
    const seen = new Set<string>();
    for (const row of rows) {
        if (!ID_PATTERN.test(row.id)) {
            report.error(table, row.id, 'ID 必须为英文小写蛇形（CLAUDE.md）', 'id');
        }
        if (seen.has(row.id)) {
            report.error(table, row.id, 'ID 重复');
            continue;
        }
        seen.add(row.id);
    }
    return seen;
}

function validateLocalizationKey(
    report: ValidationReport,
    table: string,
    rowKey: string,
    field: string,
    nameKey: string,
    keys: ReadonlySet<string>,
): void {
    if (!keys.has(nameKey)) {
        report.error(table, rowKey, `本地化 Key 不存在: ${nameKey}`, field);
    }
}

function validateAttributeCheck(
    report: ValidationReport,
    table: string,
    rowKey: string,
    field: string,
    check: AttributeCheck,
): void {
    if (!ATTRIBUTE_KEYS.includes(check.attribute)) {
        report.error(table, rowKey, `未知属性: ${check.attribute}`, `${field}.attribute`);
    }
    if (!Number.isFinite(check.threshold) || check.threshold <= 0) {
        report.error(table, rowKey, `检定阈值必须为正数，收到 ${check.threshold}`, `${field}.threshold`);
    }
}

function validateSkills(
    report: ValidationReport,
    bundle: DataBundle,
): Set<string> {
    const ids = collectIds(report, 'skills', bundle.skills);

    for (const skill of bundle.skills) {
        validateLocalizationKey(report, 'skills', skill.id, 'nameKey', skill.nameKey, bundle.localizationKeys);

        // 造成伤害/治疗的技能必须声明加成属性，否则结算器无从取数（技术方案 §10.1）
        if (skill.damageKind !== 'none' && !skill.scalingAttribute) {
            report.error('skills', skill.id, `damageKind 为 ${skill.damageKind} 时必须声明 scalingAttribute`, 'scalingAttribute');
        }
        if (skill.scalingAttribute && !ATTRIBUTE_KEYS.includes(skill.scalingAttribute)) {
            report.error('skills', skill.id, `未知属性: ${skill.scalingAttribute}`, 'scalingAttribute');
        }

        if (!SKILL_TARGET_TYPES.includes(skill.targetType)) {
            report.error('skills', skill.id, `未知目标类型: ${skill.targetType}`, 'targetType');
        } else if (!isTauntable(skill.targetType) && skill.ignoreTaunt) {
            // 本就不受嘲讽的目标类型再标 ignoreTaunt 是冗余配置，
            // 容易让人误以为「去掉它就会受嘲讽」（技术方案 §11.1）
            report.warn(
                'skills',
                skill.id,
                `${skill.targetType} 本就不受嘲讽约束，ignoreTaunt 是冗余配置`,
                'ignoreTaunt',
            );
        }

        // 治疗类技能不该指向敌方，反之伤害技能不该指向友方
        if (skill.damageKind !== 'none' && !isEnemyTarget(skill.targetType) && skill.targetType !== 'SELF') {
            report.warn(
                'skills',
                skill.id,
                `damageKind 为 ${skill.damageKind} 但目标为 ${skill.targetType}，请确认是否为吸血/反伤类技能`,
                'targetType',
            );
        }

        for (const [field, value] of [
            ['cooldownTicks', skill.cooldownTicks],
            ['castTicks', skill.castTicks],
        ] as const) {
            if (!Number.isInteger(value) || value < 0) {
                report.error('skills', skill.id, `${field} 必须为非负整数，收到 ${value}`, field);
            }
        }
    }

    return ids;
}

function validateCareers(
    report: ValidationReport,
    bundle: DataBundle,
    skillIds: ReadonlySet<string>,
): void {
    const careerIds = collectIds(report, 'careers', bundle.careers);

    for (const career of bundle.careers) {
        validateLocalizationKey(report, 'careers', career.id, 'nameKey', career.nameKey, bundle.localizationKeys);

        if (!ATTRIBUTE_KEYS.includes(career.primaryAttribute)) {
            report.error('careers', career.id, `未知主属性: ${career.primaryAttribute}`, 'primaryAttribute');
        }

        // 硬约束：恰好 3 个技能（CLAUDE.md、PRD-10 §6）
        if (career.skillIds.length !== SKILLS_PER_CAREER) {
            report.error(
                'careers',
                career.id,
                `必须恰好 ${SKILLS_PER_CAREER} 个主动技能，实际 ${career.skillIds.length} 个`,
                'skillIds',
            );
        }

        const seenSkills = new Set<string>();
        career.skillIds.forEach((skillId, index) => {
            if (!skillIds.has(skillId)) {
                report.error('careers', career.id, `引用了不存在的技能: ${skillId}`, `skillIds[${index}]`);
            }
            if (seenSkills.has(skillId)) {
                report.error('careers', career.id, `技能重复: ${skillId}`, `skillIds[${index}]`);
            }
            seenSkills.add(skillId);
        });

        // 一转节点必须有前置初始职业，且该前置必须是 base 阶段（PRD-03 §6）
        if (career.tier === 'tier_1') {
            if (!career.parentCareerId) {
                report.error('careers', career.id, '一转职业必须声明 parentCareerId', 'parentCareerId');
            } else if (!careerIds.has(career.parentCareerId)) {
                report.error('careers', career.id, `前置职业不存在: ${career.parentCareerId}`, 'parentCareerId');
            } else {
                const parent = bundle.careers.find((row) => row.id === career.parentCareerId);
                if (parent && parent.tier !== 'base') {
                    report.error('careers', career.id, `前置职业必须为初始职业，${parent.id} 是 ${parent.tier}`, 'parentCareerId');
                }
            }
        } else if (career.parentCareerId) {
            report.error('careers', career.id, '初始职业不应有 parentCareerId', 'parentCareerId');
        }
    }

    // 旧主动技能不进入自由技能池（PRD-03 §6）：同一技能不得被多个职业节点共用
    const skillOwners = new Map<string, string[]>();
    for (const career of bundle.careers) {
        for (const skillId of career.skillIds) {
            const owners = skillOwners.get(skillId) ?? [];
            owners.push(career.id);
            skillOwners.set(skillId, owners);
        }
    }
    for (const [skillId, owners] of skillOwners) {
        if (owners.length > 1) {
            report.error('careers', owners.join('+'), `技能 ${skillId} 被多个职业节点共用：${owners.join(', ')}`, 'skillIds');
        }
    }

    // 未被任何职业引用的技能是数据残留，提示但不阻断
    for (const skill of bundle.skills) {
        if (!skillOwners.has(skill.id)) {
            report.warn('skills', skill.id, '未被任何职业引用');
        }
    }
}

function validateMapObject(
    report: ValidationReport,
    map: MapDefinition,
    object: MapObjectDefinition,
    mapIds: ReadonlySet<string>,
    questIds: ReadonlySet<string>,
    itemIds: ReadonlySet<string>,
): void {
    const rowKey = `${map.id}.${object.id}`;

    if (!MAP_OBJECT_KINDS.includes(object.kind)) {
        report.error('map_objects', rowKey, `未知对象类型: ${object.kind}`, 'kind');
    }
    if (!MAP_OBJECT_STATES.includes(object.initialState)) {
        report.error('map_objects', rowKey, `未知初始状态: ${object.initialState}`, 'initialState');
    }

    // 坐标必须是整数且落在地图边界内（PRD-10 §6：地图对象坐标合法）
    if (!Number.isInteger(object.x) || !Number.isInteger(object.y)) {
        report.error('map_objects', rowKey, `坐标必须为整数，收到 (${object.x}, ${object.y})`, 'position');
    } else if (object.x < 0 || object.y < 0 || object.x >= map.width || object.y >= map.height) {
        report.error(
            'map_objects',
            rowKey,
            `坐标 (${object.x}, ${object.y}) 超出地图范围 ${map.width}×${map.height}`,
            'position',
        );
    }

    if (object.kind === 'map_exit') {
        // 出口目标必须存在（PRD-10 §6）
        if (!object.targetMapId) {
            report.error('map_objects', rowKey, '跨图出口必须声明 targetMapId', 'targetMapId');
        } else if (!mapIds.has(object.targetMapId)) {
            report.error('map_objects', rowKey, `出口目标地图不存在: ${object.targetMapId}`, 'targetMapId');
        } else if (object.targetMapId === map.id) {
            report.error('map_objects', rowKey, '出口不能指向所属地图自身', 'targetMapId');
        }

        // 单向出口必须显式声明，UI 依赖此字段提前提示（PRD-05 §9）
        if (object.isOneWay === undefined) {
            report.warn('map_objects', rowKey, '未声明 isOneWay，UI 无法提示能否返回', 'isOneWay');
        }
    } else if (object.targetMapId) {
        report.error('map_objects', rowKey, `非出口对象不应有 targetMapId`, 'targetMapId');
    }

    if (object.kind === 'attribute_check' && !object.attributeCheck) {
        report.error('map_objects', rowKey, '属性检定对象必须声明 attributeCheck', 'attributeCheck');
    }
    if (object.attributeCheck) {
        validateAttributeCheck(report, 'map_objects', rowKey, 'attributeCheck', object.attributeCheck);
    }

    const condition = object.exitCondition;
    if (condition) {
        for (const questId of condition.requiredQuestIds ?? []) {
            if (!questIds.has(questId)) {
                report.error('map_objects', rowKey, `出口条件引用了不存在的任务: ${questId}`, 'exitCondition.requiredQuestIds');
            }
        }
        for (const itemId of condition.requiredItemIds ?? []) {
            if (!itemIds.has(itemId)) {
                report.error('map_objects', rowKey, `出口条件引用了不存在的物品: ${itemId}`, 'exitCondition.requiredItemIds');
            }
        }
        if (condition.attributeCheck) {
            validateAttributeCheck(report, 'map_objects', rowKey, 'exitCondition.attributeCheck', condition.attributeCheck);
        }
    }
}

function validateMaps(report: ValidationReport, bundle: DataBundle): void {
    const mapIds = collectIds(report, 'maps', bundle.maps);
    const questIds = new Set(bundle.quests.map((quest) => quest.id));
    const itemIds = new Set(bundle.items.map((item) => item.id));

    for (const map of bundle.maps) {
        validateLocalizationKey(report, 'maps', map.id, 'nameKey', map.nameKey, bundle.localizationKeys);

        for (const [field, value] of [
            ['width', map.width],
            ['height', map.height],
        ] as const) {
            if (!Number.isInteger(value) || value <= 0) {
                report.error('maps', map.id, `${field} 必须为正整数，收到 ${value}`, field);
            }
        }

        if (
            !Number.isInteger(map.entryX) ||
            !Number.isInteger(map.entryY) ||
            map.entryX < 0 ||
            map.entryY < 0 ||
            map.entryX >= map.width ||
            map.entryY >= map.height
        ) {
            report.error('maps', map.id, `起始格 (${map.entryX}, ${map.entryY}) 超出地图范围`, 'entry');
        }

        // 对象 ID 在地图内唯一（PRD-05 §7：对象 ID = map_id + object_id）
        const seenObjectIds = new Set<string>();
        // 同一格允许多个对象吗？PRD 未禁止，但重叠通常是配置失误，故给警告
        const occupied = new Map<string, string>();

        for (const object of map.objects) {
            if (!ID_PATTERN.test(object.id)) {
                report.error('map_objects', `${map.id}.${object.id}`, 'ID 必须为英文小写蛇形', 'id');
            }
            if (seenObjectIds.has(object.id)) {
                report.error('map_objects', `${map.id}.${object.id}`, '同一地图内对象 ID 重复', 'id');
            }
            seenObjectIds.add(object.id);

            const key = `${object.x},${object.y}`;
            const existing = occupied.get(key);
            if (existing) {
                report.warn('map_objects', `${map.id}.${object.id}`, `与 ${existing} 占用同一格 (${object.x}, ${object.y})`, 'position');
            } else {
                occupied.set(key, object.id);
            }

            validateMapObject(report, map, object, mapIds, questIds, itemIds);
        }
    }
}

function validateDropTables(report: ValidationReport, bundle: DataBundle): void {
    collectIds(report, 'drop_tables', bundle.dropTables);
    const itemIds = new Set(bundle.items.map((item) => item.id));

    for (const table of bundle.dropTables) {
        if (table.entries.length === 0) {
            report.error('drop_tables', table.id, '掉落表不能为空', 'entries');
            continue;
        }

        let totalWeight = 0;
        table.entries.forEach((entry, index) => {
            if (!itemIds.has(entry.itemId)) {
                report.error('drop_tables', table.id, `引用了不存在的物品: ${entry.itemId}`, `entries[${index}].itemId`);
            }
            // 权重必须为正整数：0 或负数在加权随机中无意义（PRD-10 §6）
            if (!Number.isInteger(entry.weight) || entry.weight <= 0) {
                report.error('drop_tables', table.id, `权重必须为正整数，收到 ${entry.weight}`, `entries[${index}].weight`);
            } else {
                totalWeight += entry.weight;
            }
        });

        if (totalWeight <= 0) {
            report.error('drop_tables', table.id, '权重总和必须为正数', 'entries');
        }
    }
}

function validateItems(report: ValidationReport, bundle: DataBundle): void {
    collectIds(report, 'items', bundle.items);
    for (const item of bundle.items) {
        validateLocalizationKey(report, 'items', item.id, 'nameKey', item.nameKey, bundle.localizationKeys);
    }
}

/**
 * 全量校验。返回报告而非抛错，让调用方决定如何呈现
 * （构建脚本打印并退出，运行期显示错误页）。
 */
export function validateDataBundle(bundle: DataBundle): ValidationReport {
    const report = new ValidationReport();

    const skillIds = validateSkills(report, bundle);
    validateCareers(report, bundle, skillIds);
    validateItems(report, bundle);
    validateMaps(report, bundle);
    validateDropTables(report, bundle);

    return report;
}
