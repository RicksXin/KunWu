/**
 * Node 测试运行器的模块解析钩子。
 *
 * 存在原因：Cocos 与 Node ESM 的解析规则不兼容。
 *   - Cocos 通过 temp/tsconfig.cocos.json 注入的 paths 解析 `db://assets/*`，
 *     并允许省略扩展名（CLAUDE.md 规定跨目录导入用 db:// 前缀）。
 *   - Node ESM 两者都不认：`db://` 是未知协议，省略扩展名会 ERR_MODULE_NOT_FOUND。
 *
 * 因此领域层代码按 Cocos 约定书写，由本钩子在测试期补齐 Node 需要的形式。
 * 不要改 assets/ 里的导入风格来迁就 Node——那会破坏引擎解析。
 */

import { pathToFileURL } from 'node:url';
import path from 'node:path';

/** 仓库根目录：本文件位于 <root>/tests/ 下。 */
const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const ASSETS_PREFIX = 'db://assets/';

export async function resolve(specifier, context, nextResolve) {
    // db://assets/scripts/foo → <root>/assets/scripts/foo.ts
    if (specifier.startsWith(ASSETS_PREFIX)) {
        const relative = specifier.slice(ASSETS_PREFIX.length);
        const absolute = path.join(REPO_ROOT, 'assets', relative);
        const withExt = absolute.endsWith('.ts') ? absolute : `${absolute}.ts`;
        return nextResolve(pathToFileURL(withExt).href, context);
    }

    try {
        return await nextResolve(specifier, context);
    } catch (error) {
        // 省略扩展名的相对导入：补 .ts 再试一次。
        // 只在确实找不到模块时兜底，避免掩盖其它解析错误。
        if (error?.code === 'ERR_MODULE_NOT_FOUND' && !path.extname(specifier)) {
            return nextResolve(`${specifier}.ts`, context);
        }
        throw error;
    }
}
