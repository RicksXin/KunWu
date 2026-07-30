/**
 * 场景文件写入与 .meta 维护。
 *
 * 单独成模块，因为「保留已有 .meta 的 uuid」这条很重要：
 * uuid 变了所有引用该场景的配置（如 builder.json 的 startScene）都会失效。
 */

import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { sceneMeta } from './scene-builder.mjs';

export function writeScene({ entries, scenePath, repoRoot, force = false }) {
    const dir = path.dirname(scenePath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }

    if (existsSync(scenePath) && !force) {
        console.error(
            `${path.relative(repoRoot, scenePath)} 已存在。` +
                `加 --force 覆盖（会丢失编辑器中对该场景的改动）。`,
        );
        process.exit(1);
    }

    writeFileSync(scenePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
    console.log(`已生成 ${path.relative(repoRoot, scenePath)}（${entries.length} 个条目）`);

    // 场景自身也需要 .meta，否则编辑器不会导入它
    const metaPath = `${scenePath}.meta`;
    if (existsSync(metaPath)) {
        const existing = JSON.parse(readFileSync(metaPath, 'utf8'));
        // 保留原 uuid：改动会让 builder.json 的 startScene 等引用全部失效
        console.log(`保留已有 .meta（uuid ${existing.uuid}）`);
        return existing.uuid;
    }

    const meta = sceneMeta();
    writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    console.log(`已生成 ${path.relative(repoRoot, metaPath)}（uuid ${meta.uuid}）`);
    return meta.uuid;
}
