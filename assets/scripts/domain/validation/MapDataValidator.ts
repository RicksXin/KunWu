import { MAP_OBJECT_KINDS, MAP_OBJECT_STATES } from '../MapTypes';
import type { MapDefinition, MapObjectDefinition } from '../MapTypes';
import { ValidationReport } from '../ValidationReport';
import { ID_PATTERN } from './DataBundleTypes';
import type { DataBundle } from './DataBundleTypes';
import { collectIds, validateAttributeCheck, validateLocalizationKey } from './ValidationHelpers';

function validateMapObject(
    report: ValidationReport,
    map: MapDefinition,
    object: MapObjectDefinition,
    mapIds: ReadonlySet<string>,
    questIds: ReadonlySet<string>,
    itemIds: ReadonlySet<string>,
): void {
    const rowKey = `${map.id}.${object.id}`;
    if (!MAP_OBJECT_KINDS.includes(object.kind)) report.error('map_objects', rowKey, `未知对象类型: ${object.kind}`, 'kind');
    if (!MAP_OBJECT_STATES.includes(object.initialState)) report.error('map_objects', rowKey, `未知初始状态: ${object.initialState}`, 'initialState');
    if (!Number.isInteger(object.x) || !Number.isInteger(object.y)) {
        report.error('map_objects', rowKey, `坐标必须为整数，收到 (${object.x}, ${object.y})`, 'position');
    } else if (object.x < 0 || object.y < 0 || object.x >= map.width || object.y >= map.height) {
        report.error('map_objects', rowKey, `坐标 (${object.x}, ${object.y}) 超出地图范围 ${map.width}×${map.height}`, 'position');
    }
    if (object.kind === 'map_exit') {
        if (!object.targetMapId) report.error('map_objects', rowKey, '跨图出口必须声明 targetMapId', 'targetMapId');
        else if (!mapIds.has(object.targetMapId)) report.error('map_objects', rowKey, `出口目标地图不存在: ${object.targetMapId}`, 'targetMapId');
        else if (object.targetMapId === map.id) report.error('map_objects', rowKey, '出口不能指向所属地图自身', 'targetMapId');
        if (object.isOneWay === undefined) report.warn('map_objects', rowKey, '未声明 isOneWay，UI 无法提示能否返回', 'isOneWay');
    } else if (object.targetMapId) {
        report.error('map_objects', rowKey, '非出口对象不应有 targetMapId', 'targetMapId');
    }
    if (object.kind === 'attribute_check' && !object.attributeCheck) {
        report.error('map_objects', rowKey, '属性检定对象必须声明 attributeCheck', 'attributeCheck');
    }
    if (object.attributeCheck) validateAttributeCheck(report, 'map_objects', rowKey, 'attributeCheck', object.attributeCheck);
    const condition = object.exitCondition;
    if (!condition) return;
    for (const questId of condition.requiredQuestIds ?? []) {
        if (!questIds.has(questId)) report.error('map_objects', rowKey, `出口条件引用了不存在的任务: ${questId}`, 'exitCondition.requiredQuestIds');
    }
    for (const itemId of condition.requiredItemIds ?? []) {
        if (!itemIds.has(itemId)) report.error('map_objects', rowKey, `出口条件引用了不存在的物品: ${itemId}`, 'exitCondition.requiredItemIds');
    }
    if (condition.attributeCheck) {
        validateAttributeCheck(report, 'map_objects', rowKey, 'exitCondition.attributeCheck', condition.attributeCheck);
    }
}

export function validateMaps(report: ValidationReport, bundle: DataBundle): void {
    const mapIds = collectIds(report, 'maps', bundle.maps);
    const questIds = new Set(bundle.quests.map((quest) => quest.id));
    const itemIds = new Set(bundle.items.map((item) => item.id));
    for (const map of bundle.maps) {
        validateLocalizationKey(report, 'maps', map.id, 'nameKey', map.nameKey, bundle.localizationKeys);
        for (const [field, value] of [['width', map.width], ['height', map.height]] as const) {
            if (!Number.isInteger(value) || value <= 0) report.error('maps', map.id, `${field} 必须为正整数，收到 ${value}`, field);
        }
        if (!Number.isInteger(map.entryX) || !Number.isInteger(map.entryY)
            || map.entryX < 0 || map.entryY < 0 || map.entryX >= map.width || map.entryY >= map.height) {
            report.error('maps', map.id, `起始格 (${map.entryX}, ${map.entryY}) 超出地图范围`, 'entry');
        }
        const seenObjectIds = new Set<string>();
        const occupied = new Map<string, string>();
        for (const object of map.objects) {
            if (!ID_PATTERN.test(object.id)) report.error('map_objects', `${map.id}.${object.id}`, 'ID 必须为英文小写蛇形', 'id');
            if (seenObjectIds.has(object.id)) report.error('map_objects', `${map.id}.${object.id}`, '同一地图内对象 ID 重复', 'id');
            seenObjectIds.add(object.id);
            const key = `${object.x},${object.y}`;
            const existing = occupied.get(key);
            if (existing) report.warn('map_objects', `${map.id}.${object.id}`, `与 ${existing} 占用同一格 (${object.x}, ${object.y})`, 'position');
            else occupied.set(key, object.id);
            validateMapObject(report, map, object, mapIds, questIds, itemIds);
        }
    }
}
