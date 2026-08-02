import { ValidationReport } from '../ValidationReport';
import type { DataBundle } from './DataBundleTypes';
import { collectIds, validateLocalizationKey } from './ValidationHelpers';

export function validateDropTables(report: ValidationReport, bundle: DataBundle): void {
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
            if (!Number.isInteger(entry.weight) || entry.weight <= 0) {
                report.error('drop_tables', table.id, `权重必须为正整数，收到 ${entry.weight}`, `entries[${index}].weight`);
            } else totalWeight += entry.weight;
        });
        if (totalWeight <= 0) report.error('drop_tables', table.id, '权重总和必须为正数', 'entries');
    }
}

export function validateItems(report: ValidationReport, bundle: DataBundle): void {
    collectIds(report, 'items', bundle.items);
    for (const item of bundle.items) {
        validateLocalizationKey(report, 'items', item.id, 'nameKey', item.nameKey, bundle.localizationKeys);
    }
}
