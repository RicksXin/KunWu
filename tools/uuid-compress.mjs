/**
 * Cocos 资源 UUID 压缩。
 *
 * 用途：手写 .scene 时，自定义脚本组件的 __type__ 必须填压缩后的 UUID，
 * 而 .meta 里存的是完整 UUID。
 *
 * 算法：保留前 5 个十六进制字符，其余每 3 个字符（12 位）编码为 2 个 Base64 字符。
 * 已用 Cocos 自带 taxi 模板的已知样本对照验证：
 *   98dcd425-f068-4460-b251-1bc6a9f8487e → 98dcdQl8GhEYLJRG8ap+Eh+
 *
 * 用法：node tools/uuid-compress.mjs <完整UUID>
 *       node tools/uuid-compress.mjs --file assets/scripts/AppRoot.ts
 */

import { readFileSync } from 'node:fs';

/** Cocos 使用标准 Base64 字母表。 */
const BASE64_KEYS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function compressUuid(uuid) {
    const hex = uuid.replace(/-/g, '');
    if (!/^[0-9a-f]{32}$/i.test(hex)) {
        throw new Error(`不是合法 UUID: ${uuid}`);
    }

    let result = hex.slice(0, 5);
    for (let i = 5; i < hex.length; i += 3) {
        const value = Number.parseInt(hex.slice(i, i + 3), 16);
        result += BASE64_KEYS[(value >> 6) & 63] + BASE64_KEYS[value & 63];
    }
    return result;
}

/** 从 <脚本路径>.meta 读取 UUID。 */
export function uuidFromMeta(scriptPath) {
    const metaPath = scriptPath.endsWith('.meta') ? scriptPath : `${scriptPath}.meta`;
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    if (!meta.uuid) {
        throw new Error(`${metaPath} 中没有 uuid`);
    }
    return meta.uuid;
}

// 直接运行时作为命令行工具
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''))) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('用法: node tools/uuid-compress.mjs <UUID>');
        console.error('      node tools/uuid-compress.mjs --file <脚本路径>');
        process.exit(1);
    }

    if (args[0] === '--file') {
        for (const path of args.slice(1)) {
            const uuid = uuidFromMeta(path);
            console.log(`${path}\n  完整: ${uuid}\n  压缩: ${compressUuid(uuid)}`);
        }
    } else {
        for (const uuid of args) {
            console.log(`${uuid} → ${compressUuid(uuid)}`);
        }
    }
}
