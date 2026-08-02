export type UnknownRecord = Record<string, unknown>;

export function recordOf(value: unknown, path: string): UnknownRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${path} 应为对象`);
    }
    return value as UnknownRecord;
}

export function positiveIntegerOf(value: unknown, path: string): number {
    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
        throw new Error(`${path} 应为正安全整数，收到 ${String(value)}`);
    }
    return value as number;
}

export function nonNegativeIntegerOf(value: unknown, path: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new Error(`${path} 应为非负安全整数，收到 ${String(value)}`);
    }
    return value as number;
}

/** JSON 用 `//xxx` 键承载注释，解析前统一剥离。 */
export function stripCommentKeys(raw: UnknownRecord): UnknownRecord {
    const out: UnknownRecord = {};
    for (const [key, value] of Object.entries(raw)) {
        if (!key.startsWith('//')) out[key] = value;
    }
    return out;
}
