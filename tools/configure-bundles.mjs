/**
 * 把 assets/bundles/ 下的目录配置为 Asset Bundle（PRD-10 §3、任务 #17b）。
 *
 * 只改已有 .meta 的 userData，不动编辑器分配的 uuid——
 * 动 uuid 会让所有引用该目录的资源断链。
 *
 * 优先级说明：数值越大越先加载。首屏包需最高，地图包最低，
 * 避免地图资源与首屏争抢带宽（PRD-10 §7 首屏 < 25MB）。
 *
 * 用法：node tools/configure-bundles.mjs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const BUNDLES_ROOT = path.join(REPO_ROOT, 'assets', 'bundles');

/**
 * 与 services/BundleManifest.ts 的 BUNDLE_NAMES 对应。
 * 此处只列 P0 需要的五个；其余包待对应阶段再建目录。
 */
const BUNDLE_CONFIG = [
    // 不含 start-scene：那是引擎保留的内置 Bundle 名，
    // 且初始场景不能位于 Bundle 内（构建会报「初始场景在 Bundle 中」）。
    // Boot.scene 放在 assets/scenes/，随主包发布。
    { dir: 'shared', priority: 7, note: '首屏共享资源' },
    { dir: 'camp', priority: 5, note: '营地' },
    { dir: 'map_01', priority: 3, note: '地图 1' },
    { dir: 'map_02', priority: 3, note: '地图 2' },
];

/** 目录 .meta 的 userData 中 Bundle 相关字段。 */
function bundleUserData(name, priority) {
    return {
        isBundle: true,
        bundleName: name,
        priority,
        // 合并所有 JSON 以减少请求数（PRD-10 §7 首屏预算）
        compressionType: { 'web-mobile': 'merge_all_json' },
        // Web Mobile 是首发平台（PRD-00 §3）
        isRemoteBundle: { 'web-mobile': false },
    };
}

let changed = 0;

for (const { dir, priority, note } of BUNDLE_CONFIG) {
    const dirPath = path.join(BUNDLES_ROOT, dir);
    const metaPath = `${dirPath}.meta`;

    if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
        console.log(`已创建目录 assets/bundles/${dir}`);
    }

    let meta;
    if (existsSync(metaPath)) {
        meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    } else {
        // 目录 meta 缺失时新建。importer 为 directory，与编辑器产物一致
        meta = {
            ver: '1.2.0',
            importer: 'directory',
            imported: true,
            uuid: randomUUID(),
            files: [],
            subMetas: {},
            userData: {},
        };
        console.log(`已新建 assets/bundles/${dir}.meta`);
    }

    const desired = bundleUserData(dir, priority);
    const current = meta.userData ?? {};

    if (JSON.stringify(current) === JSON.stringify(desired)) {
        console.log(`assets/bundles/${dir} 配置已是最新（${note}）`);
        continue;
    }

    // 保留 userData 里的其它字段，只覆盖 Bundle 相关项
    meta.userData = { ...current, ...desired };
    writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
    console.log(`已配置 assets/bundles/${dir} → Bundle "${dir}" 优先级 ${priority}（${note}）`);
    changed += 1;
}

console.log(changed === 0 ? '\n无需改动' : `\n共修改 ${changed} 个目录配置`);
