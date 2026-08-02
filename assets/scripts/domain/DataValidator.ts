/** 构建前数据校验的稳定公共入口（PRD-10 §6）。 */

import { ValidationReport } from './ValidationReport';
import { validateCareers, validateSkills } from './validation/CareerDataValidator';
import type { DataBundle } from './validation/DataBundleTypes';
import { validateDropTables, validateItems } from './validation/InventoryDataValidator';
import { validateMaps } from './validation/MapDataValidator';

export { ID_PATTERN } from './validation/DataBundleTypes';
export type { DataBundle, DropEntry, DropTableDefinition } from './validation/DataBundleTypes';

/** 返回完整报告，由构建脚本或运行时决定如何呈现。 */
export function validateDataBundle(bundle: DataBundle): ValidationReport {
    const report = new ValidationReport();
    const skillIds = validateSkills(report, bundle);
    validateCareers(report, bundle, skillIds);
    validateItems(report, bundle);
    validateMaps(report, bundle);
    validateDropTables(report, bundle);
    return report;
}
