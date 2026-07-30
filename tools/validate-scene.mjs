/**
 * 校验手写场景与工程配置的一致性（任务 #6b）。
 *
 * 存在原因：场景是脚本生成的，而脚本 UUID 来自 .meta。
 * 若日后有人重新导入脚本导致 UUID 变化，场景里的组件引用会失效，
 * 症状是「场景能打开但组件全没了」——不报错，很难发现。此脚本把它变成硬失败。
 *
 * 用法：node tools/validate-scene.mjs
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { compressUuid, uuidFromMeta } from './uuid-compress.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
/** 初始场景不能位于 Asset Bundle 内，故放在 assets/scenes/。 */
const SCENE_PATH = path.join(REPO_ROOT, 'assets/scenes/Boot.scene');

const problems = [];
const notes = [];

function readJson(relPath) {
    return JSON.parse(readFileSync(path.join(REPO_ROOT, relPath), 'utf8'));
}

if (!existsSync(SCENE_PATH)) {
    console.error('找不到 Boot.scene，请先运行 node tools/gen-boot-scene.mjs');
    process.exit(1);
}

const scene = JSON.parse(readFileSync(SCENE_PATH, 'utf8'));

/** 场景里出现的自定义组件类型（非 cc. 开头即为脚本）。 */
const customTypes = new Set(
    scene
        .map((entry) => entry.__type__)
        .filter((type) => typeof type === 'string' && !type.startsWith('cc.')),
);

/**
 * 扫描全部脚本建立「压缩 UUID → 源文件」索引。
 *
 * 不用硬编码白名单：那样每加一个组件都得改这里，迟早漏掉，
 * 而漏掉的表现是校验器把正常组件报成「未知脚本」（本次就踩了）。
 * 反查索引能自动认出新组件，同时仍能发现真正失联的引用。
 */
function indexScripts(dir, index = new Map()) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            indexScripts(full, index);
            continue;
        }
        if (!entry.name.endsWith('.ts.meta')) {
            continue;
        }
        index.set(compressUuid(uuidFromMeta(full)), path.relative(REPO_ROOT, full).replace(/\.meta$/, ''));
    }
    return index;
}

const scriptIndex = indexScripts(path.join(REPO_ROOT, 'assets/scripts'));

for (const compressed of customTypes) {
    const source = scriptIndex.get(compressed);
    if (source) {
        notes.push(`${path.basename(source)} → ${compressed}`);
    } else {
        problems.push(
            `场景引用了未知脚本组件 ${compressed}，` +
                `对应源文件可能已删除、改名，或其 .meta 的 UUID 已变`,
        );
    }
}

// 启动场景必须挂上的组件。缺了游戏跑不起来，故单独校验。
const REQUIRED_SCRIPTS = [
    'assets/scripts/AppRoot.ts',
    'assets/scripts/presentation/ViewportAdapter.ts',
    'assets/scripts/presentation/GameBootstrap.ts',
];

for (const scriptPath of REQUIRED_SCRIPTS) {
    const metaPath = path.join(REPO_ROOT, `${scriptPath}.meta`);
    if (!existsSync(metaPath)) {
        problems.push(`${scriptPath} 缺少 .meta，场景无法引用它`);
        continue;
    }
    if (!customTypes.has(compressUuid(uuidFromMeta(metaPath)))) {
        problems.push(
            `启动场景未挂载 ${path.basename(scriptPath)}——` +
                `重新运行 pnpm gen:scene --force 即可接上`,
        );
    }
}

// 组件与节点必须双向配对，否则组件不会被实例化
scene.forEach((entry, index) => {
    const nodeRef = entry?.node?.__id__;
    if (typeof nodeRef !== 'number') {
        return;
    }
    const node = scene[nodeRef];
    if (!node || node.__type__ !== 'cc.Node') {
        problems.push(`[${index}] 的 node 未指向 cc.Node`);
        return;
    }
    if (!(node._components ?? []).some((ref) => ref.__id__ === index)) {
        problems.push(
            `[${index}] ${entry.__type__} 未被节点 ${node._name} 的 _components 登记，不会实例化`,
        );
    }
});

// AppRoot 必须在场景根层级，否则 addPersistRootNode 静默失效
const sceneRoot = scene[1];
const rootChildIds = (sceneRoot?._children ?? []).map((ref) => ref.__id__);
const appRootIdx = scene.findIndex(
    (entry) => entry.__type__ === 'cc.Node' && entry._name === 'AppRoot',
);
if (appRootIdx < 0) {
    problems.push('场景中没有名为 AppRoot 的节点');
} else if (!rootChildIds.includes(appRootIdx)) {
    problems.push(
        'AppRoot 不在场景根层级——cc.d.ts 明确要求根层级，' +
            '否则 addPersistRootNode 无效，跨场景常驻会静默失败',
    );
}

// 起始场景配置须与场景 meta 的 uuid 一致
const sceneMeta = readJson('assets/scenes/Boot.scene.meta');
const builder = readJson('settings/v2/packages/builder.json');
const configuredStart = builder?.taskMap?.['web-mobile']?.options?.startScene;
if (!configuredStart) {
    problems.push('builder.json 未配置 startScene');
} else if (configuredStart !== sceneMeta.uuid) {
    problems.push(
        `builder.json 的 startScene (${configuredStart}) 与 Boot.scene.meta 的 uuid ` +
            `(${sceneMeta.uuid}) 不一致`,
    );
}

// 设计分辨率须与领域层常量一致
const project = readJson('settings/v2/packages/project.json');
const resolution = project?.general?.designResolution;
if (resolution?.width !== 1080 || resolution?.height !== 1920) {
    problems.push(
        `project.json 设计分辨率为 ${resolution?.width}×${resolution?.height}，` +
            '应与 ViewportLayout 的 1080×1920 一致',
    );
}

// 初始场景不得位于 Asset Bundle 内（Cocos 硬性限制），
// 且 start-scene 是引擎保留的内置 Bundle 名，不该由工程自建同名目录
if (existsSync(path.join(REPO_ROOT, 'assets/bundles/start-scene'))) {
    problems.push(
        'assets/bundles/start-scene 不应存在：start-scene 是引擎保留的内置 Bundle 名，' +
            '且初始场景不能放在 Bundle 内',
    );
}

if (problems.length > 0) {
    console.error('场景校验失败：');
    for (const problem of problems) {
        console.error(`  ${problem}`);
    }
    process.exit(1);
}

console.log('场景校验通过');
for (const note of notes) {
    console.log(`  ${note}`);
}
console.log(`  条目数 ${scene.length}，startScene ${sceneMeta.uuid}`);
