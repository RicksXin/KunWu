/**
 * 数据校验问题收集（PRD-10 §6）。
 *
 * 为何收集而非首个错误即抛：构建前校验要一次列出全部问题，
 * 否则策划每修一条要重跑一次，几十条错误就是几十轮。
 * DataRegistry 的逐行 validate 仍然抛错——那是运行期加载，
 * 此处是构建期批量检查，两者目的不同。
 */

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
    readonly severity: ValidationSeverity;
    /** 出问题的表名，例如 careers。 */
    readonly table: string;
    /** 行主键；跨表校验时为发起方的键。 */
    readonly rowKey: string;
    /** 字段路径，例如 skills[2].id。留空表示整行问题。 */
    readonly field?: string;
    readonly message: string;
}

export class ValidationReport {
    private readonly issues: ValidationIssue[] = [];

    error(table: string, rowKey: string, message: string, field?: string): void {
        this.issues.push({ severity: 'error', table, rowKey, field, message });
    }

    warn(table: string, rowKey: string, message: string, field?: string): void {
        this.issues.push({ severity: 'warning', table, rowKey, field, message });
    }

    get all(): readonly ValidationIssue[] {
        return this.issues;
    }

    get errors(): readonly ValidationIssue[] {
        return this.issues.filter((issue) => issue.severity === 'error');
    }

    get warnings(): readonly ValidationIssue[] {
        return this.issues.filter((issue) => issue.severity === 'warning');
    }

    /** 有 error 即视为失败；warning 不阻断（PRD-10 §8：数据 Schema 失败阻止进入游戏）。 */
    get hasErrors(): boolean {
        return this.issues.some((issue) => issue.severity === 'error');
    }

    /** 合并子报告，用于分表校验后汇总。 */
    merge(other: ValidationReport): void {
        this.issues.push(...other.all);
    }

    /** 可读输出，用于构建日志与错误页。 */
    format(): string {
        if (this.issues.length === 0) {
            return '数据校验通过';
        }
        const lines = this.issues.map((issue) => {
            const location = issue.field ? `${issue.table}.${issue.rowKey}.${issue.field}` : `${issue.table}.${issue.rowKey}`;
            const tag = issue.severity === 'error' ? '错误' : '警告';
            return `[${tag}] ${location}: ${issue.message}`;
        });
        return `${lines.join('\n')}\n共 ${this.errors.length} 个错误、${this.warnings.length} 个警告`;
    }
}
