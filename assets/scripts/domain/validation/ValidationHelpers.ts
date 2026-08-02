import { ATTRIBUTE_KEYS } from '../Attributes';
import type { AttributeCheck } from '../Attributes';
import { ValidationReport } from '../ValidationReport';
import { ID_PATTERN } from './DataBundleTypes';

export function collectIds(
    report: ValidationReport,
    table: string,
    rows: readonly { readonly id: string }[],
): Set<string> {
    const seen = new Set<string>();
    for (const row of rows) {
        if (!ID_PATTERN.test(row.id)) report.error(table, row.id, 'ID 必须为英文小写蛇形（CLAUDE.md）', 'id');
        if (seen.has(row.id)) {
            report.error(table, row.id, 'ID 重复');
            continue;
        }
        seen.add(row.id);
    }
    return seen;
}

export function validateLocalizationKey(
    report: ValidationReport,
    table: string,
    rowKey: string,
    field: string,
    nameKey: string,
    keys: ReadonlySet<string>,
): void {
    if (!keys.has(nameKey)) report.error(table, rowKey, `本地化 Key 不存在: ${nameKey}`, field);
}

export function validateAttributeCheck(
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
