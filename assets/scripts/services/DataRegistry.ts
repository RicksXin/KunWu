/**
 * 静态数据表的只读查询入口（技术方案 §4.1）。
 *
 * 职责边界：只加载和查询静态定义，不修改玩家存档。
 * 所有数值从数据文件读取，界面和战斗代码不得硬编码（技术方案 §1）。
 */

export interface TableSchema<T> {
    readonly tableName: string;
    /** 单行校验。失败时抛错并指明表名与主键，避免问题在运行期才暴露。 */
    validate(row: unknown, rowKey: string): T;
}

export class DataRegistry {
    private readonly tables = new Map<string, ReadonlyMap<string, unknown>>();

    /**
     * 注册一张表。重复注册同名表视为错误——
     * 静默覆盖会让「究竟加载了哪份数据」变得无法追查。
     */
    registerTable<T>(schema: TableSchema<T>, rows: Record<string, unknown>): void {
        if (this.tables.has(schema.tableName)) {
            throw new Error(`表 ${schema.tableName} 已注册，不允许重复注册`);
        }

        const validated = new Map<string, T>();
        for (const [key, raw] of Object.entries(rows)) {
            validated.set(key, schema.validate(raw, key));
        }
        this.tables.set(schema.tableName, validated);
    }

    get<T>(tableName: string, id: string): T {
        const row = this.tryGet<T>(tableName, id);
        if (row === undefined) {
            throw new Error(`表 ${tableName} 中不存在 ID: ${id}`);
        }
        return row;
    }

    tryGet<T>(tableName: string, id: string): T | undefined {
        const table = this.tables.get(tableName);
        if (!table) {
            throw new Error(`表 ${tableName} 未注册`);
        }
        return table.get(id) as T | undefined;
    }

    all<T>(tableName: string): ReadonlyMap<string, T> {
        const table = this.tables.get(tableName);
        if (!table) {
            throw new Error(`表 ${tableName} 未注册`);
        }
        return table as ReadonlyMap<string, T>;
    }

    has(tableName: string): boolean {
        return this.tables.has(tableName);
    }

    /** 切换 Bundle 时卸载地图专属表。 */
    unregisterTable(tableName: string): void {
        this.tables.delete(tableName);
    }
}
