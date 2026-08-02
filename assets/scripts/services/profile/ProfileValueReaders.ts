export type UnknownRecord = Record<string, unknown>;

export function recordOf(value: unknown, path: string): UnknownRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${path} 应为对象`);
    }
    return value as UnknownRecord;
}

export function stringOf(value: unknown, path: string): string {
    if (typeof value !== 'string' || value.length === 0) {
        throw new Error(`${path} 应为非空字符串`);
    }
    return value;
}

export function booleanOf(value: unknown, path: string): boolean {
    if (typeof value !== 'boolean') {
        throw new Error(`${path} 应为布尔值`);
    }
    return value;
}

export function integerOf(value: unknown, path: string, minimum = 0): number {
    if (!Number.isSafeInteger(value) || (value as number) < minimum) {
        throw new Error(`${path} 应为不小于 ${minimum} 的安全整数`);
    }
    return value as number;
}

export function numberRecordOf(value: unknown, path: string): Record<string, number> {
    const raw = recordOf(value, path);
    const result: Record<string, number> = {};
    for (const [key, item] of Object.entries(raw)) {
        result[key] = integerOf(item, `${path}.${key}`);
    }
    return result;
}

export function booleanRecordOf(value: unknown, path: string): Record<string, boolean> {
    const raw = recordOf(value, path);
    const result: Record<string, boolean> = {};
    for (const [key, item] of Object.entries(raw)) {
        result[key] = booleanOf(item, `${path}.${key}`);
    }
    return result;
}

export function stringArrayOf(value: unknown, path: string): readonly string[] {
    if (!Array.isArray(value)) {
        throw new Error(`${path} 应为数组`);
    }
    return value.map((item, index) => stringOf(item, `${path}[${index}]`));
}
