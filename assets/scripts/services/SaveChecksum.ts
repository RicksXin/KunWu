/**
 * 存档校验值（技术方案 §13、PRD-10 §4）。
 *
 * 职责边界：只做序列化与校验计算，不接触存储。
 * 目的是检测坏档与手改档，不是防作弊——单机存档无法真正防篡改。
 */

/**
 * 稳定序列化：对象键按字典序排列。
 *
 * 必须稳定，否则同一份数据因键顺序不同算出不同校验值，
 * 会把正常存档误判为损坏。
 */
export function stableStringify(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value) ?? 'null';
    }

    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>)
        // undefined 值在 JSON 中会被丢弃，这里同样跳过，保持与 JSON.parse 往返一致
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, v]) => `${JSON.stringify(key)}:${stableStringify(v)}`);

    return `{${entries.join(',')}}`;
}

/**
 * FNV-1a 32 位散列，输出 8 位十六进制。
 *
 * 选它而非 SHA-256：存档校验只需检测意外损坏，
 * 且同步实现避免让 save() 依赖 WebCrypto 的异步 API。
 */
export function fnv1a32(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        // 用 Math.imul 保证 32 位整数乘法不丢精度
        hash = Math.imul(hash, 0x01000193);
    }
    // >>> 0 转无符号，避免出现负号
    return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeChecksum(payload: Readonly<Record<string, unknown>>): string {
    return fnv1a32(stableStringify(payload));
}
