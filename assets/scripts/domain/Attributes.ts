/**
 * 七维属性。
 *
 * 字段名已冻结（技术方案 §6、PRD-03 §8），不得改名或增删：
 * 数据表、存档、技能定义和探索检定全部依赖这七个键。
 */
export const ATTRIBUTE_KEYS = [
    'strength',
    'magic',
    'technique',
    'speed',
    'constitution',
    'armor',
    'resistance',
] as const;

export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export type Attributes = {
    readonly [K in AttributeKey]: number;
};

/** 可变形式，仅用于构建过程；对外暴露一律用 Attributes。 */
export type MutableAttributes = {
    -readonly [K in AttributeKey]: number;
};

export function createAttributes(init: Partial<Attributes> = {}): Attributes {
    const result = {} as MutableAttributes;
    for (const key of ATTRIBUTE_KEYS) {
        result[key] = init[key] ?? 0;
    }
    return result;
}

export function addAttributes(a: Attributes, b: Attributes): Attributes {
    const result = {} as MutableAttributes;
    for (const key of ATTRIBUTE_KEYS) {
        result[key] = a[key] + b[key];
    }
    return result;
}

/**
 * 探索检定的聚合方式（技术方案 §9.4、PRD-05 §8）。
 * SUM   四人属性总和
 * MAX   队内最高单人属性
 * COUNT 达到单人门槛的人数
 * ALL   每名存活成员都达到门槛
 */
export type CheckAggregate = 'SUM' | 'MAX' | 'COUNT' | 'ALL';

export interface AttributeCheck {
    readonly checkId: string;
    readonly attribute: AttributeKey;
    readonly aggregate: CheckAggregate;
    readonly threshold: number;
}

/**
 * 校验一组数据是否覆盖全部七维。
 * 数据表加载时调用，避免缺字段在战斗中才暴露成 NaN。
 */
export function validateAttributeKeys(raw: Record<string, unknown>, context: string): void {
    const missing = ATTRIBUTE_KEYS.filter((key) => typeof raw[key] !== 'number');
    if (missing.length > 0) {
        throw new Error(`${context} 缺少七维字段或类型错误: ${missing.join(', ')}`);
    }
}
