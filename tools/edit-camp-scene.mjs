/**
 * 定点修改 Camp.scene / Prefab，免去为改尺寸坐标而开编辑器。
 *
 * 能改的都是纯数据属性：尺寸、位置、缩放、active、Label 文案、删组件、
 * 把 Sprite 指向已导入的图片。**不新建资源，不新建节点**——那两类需要
 * 编辑器分配 UUID，伪造会造成全项目引用错乱（见 CLAUDE.md）。
 *
 * 安全网：改前备份到 local/scene-backups/，改完自动跑 validate:scene，
 * 校验失败自动回滚。删组件会重排数组并重写全部 __id__ 引用，不留孤儿条目。
 *
 * 用法：
 *   pnpm edit:camp --size yi_shi_dian=720x480 --pos yi_shi_dian=0,490
 *   pnpm edit:camp --remove-component TopHUD:cc.Sprite
 *   pnpm edit:camp --sprite ling_pu=env_camp_building_ling_pu
 *   pnpm edit:camp --active NpcListPanel=false --label MainTaskButton/Objective=主线：--
 *   pnpm edit:camp --dry-run --size yi_shi_dian=800x533
 *   pnpm edit:camp --file assets/bundles/camp/prefabs/CampTopHud.prefab --size ...
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const DEFAULT_TARGET = 'assets/bundles/camp/Camp.scene';
const BACKUP_DIR = path.join(REPO_ROOT, 'local/scene-backups');

const argv = process.argv.slice(2);
if (argv.length === 0 || argv.includes('--help')) {
    console.log(readFileSync(import.meta.filename, 'utf8').split('*/')[0].replace(/^\/\*\*|^ \* ?/gm, ''));
    process.exit(0);
}

const dryRun = argv.includes('--dry-run');
const ops = [];
let targetRel = DEFAULT_TARGET;

for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--dry-run') {
        continue;
    }
    const value = argv[i + 1];
    if (!flag.startsWith('--')) {
        fail(`无法解析参数 ${flag}`);
    }
    if (value === undefined || value.startsWith('--')) {
        fail(`${flag} 缺少取值`);
    }
    i += 1;
    if (flag === '--file') {
        targetRel = value;
        continue;
    }
    ops.push({ flag, value });
}

if (ops.length === 0) {
    fail('没有任何修改操作');
}

const targetPath = path.join(REPO_ROOT, targetRel);
if (!existsSync(targetPath)) {
    fail(`找不到 ${targetRel}`);
}

const original = readFileSync(targetPath, 'utf8');
let entries = JSON.parse(original);
const changes = [];

function fail(message) {
    console.error(`edit-camp-scene: ${message}`);
    process.exit(1);
}

/** 按节点名或 a/b/c 相对路径定位节点下标。名字重复时报错，避免改错节点。 */
function findNode(selector) {
    const segments = selector.split('/').filter(Boolean);
    const [head, ...rest] = segments;
    const matches = entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry?.__type__ === 'cc.Node' && entry._name === head);
    if (matches.length === 0) {
        fail(`找不到节点 ${head}`);
    }
    if (matches.length > 1 && rest.length === 0) {
        fail(`节点名 ${head} 在文件中出现 ${matches.length} 次，请用 父/子 路径消除歧义`);
    }
    let current = matches[0].index;
    for (const segment of rest) {
        const childIdx = (entries[current]?._children ?? [])
            .map((ref) => ref.__id__)
            .find((idx) => entries[idx]?._name === segment);
        if (childIdx === undefined) {
            fail(`${selector} 中的 ${segment} 不存在`);
        }
        current = childIdx;
    }
    return current;
}

function componentOf(nodeIdx, type) {
    return (entries[nodeIdx]?._components ?? [])
        .map((ref) => ({ idx: ref.__id__, component: entries[ref.__id__] }))
        .find(({ component }) => component?.__type__ === type);
}

function requireComponent(nodeIdx, type, selector) {
    const found = componentOf(nodeIdx, type);
    if (!found) {
        fail(`${selector} 没有 ${type} 组件`);
    }
    return found;
}

/** 从已导入的 .meta 里查 SpriteFrame UUID。绝不生成新 UUID。 */
function findSpriteFrameUuid(imageName) {
    const stack = [path.join(REPO_ROOT, 'assets')];
    const hits = [];
    while (stack.length > 0) {
        for (const entry of readdirSync(stack.pop(), { withFileTypes: true })) {
            const full = path.join(entry.parentPath ?? entry.path, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
                continue;
            }
            if (!entry.name.endsWith('.png.meta')) {
                continue;
            }
            if (entry.name.replace('.png.meta', '') !== imageName) {
                continue;
            }
            const meta = JSON.parse(readFileSync(full, 'utf8'));
            const subId = Object.entries(meta.subMetas ?? {}).find(
                ([, sub]) => sub.importer === 'sprite-frame',
            )?.[0];
            if (!subId) {
                fail(`${imageName}.png.meta 里没有 sprite-frame 子资源，请在编辑器中重新导入`);
            }
            hits.push(`${meta.uuid}@${subId}`);
        }
    }
    if (hits.length === 0) {
        fail(`找不到 ${imageName}.png.meta——新增图片必须先在编辑器中导入一次生成 .meta`);
    }
    if (hits.length > 1) {
        fail(`${imageName} 有多份 .meta，无法确定用哪个`);
    }
    return hits[0];
}

/**
 * 删除一个组件条目并重排数组。
 *
 * 关键点：条目下标即 __id__，删掉中间一项会让后面全部前移，
 * 因此必须重写文件里所有 __id__ 引用。只把条目置 null 更省事，
 * 但引擎会把 null 当损坏数据，编辑器打开即报错。
 */
function removeEntry(removeIdx) {
    entries[entries[removeIdx].node.__id__]._components = entries[
        entries[removeIdx].node.__id__
    ]._components.filter((ref) => ref.__id__ !== removeIdx);

    entries.splice(removeIdx, 1);

    const remap = (value) => {
        if (Array.isArray(value)) {
            value.forEach(remap);
            return;
        }
        if (!value || typeof value !== 'object') {
            return;
        }
        if (typeof value.__id__ === 'number') {
            if (value.__id__ === removeIdx) {
                fail(`内部错误：仍有引用指向已删除的条目 ${removeIdx}`);
            }
            if (value.__id__ > removeIdx) {
                value.__id__ -= 1;
            }
        }
        for (const key of Object.keys(value)) {
            if (key !== '__id__') {
                remap(value[key]);
            }
        }
    };
    entries.forEach(remap);
}

const HANDLERS = {
    '--size': (value) => {
        const [selector, dims] = splitOnce(value, '--size');
        const match = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(dims);
        if (!match) {
            fail(`--size 取值应形如 名字=宽x高，收到 ${dims}`);
        }
        const nodeIdx = findNode(selector);
        const { component } = requireComponent(nodeIdx, 'cc.UITransform', selector);
        const before = `${component._contentSize.width}x${component._contentSize.height}`;
        component._contentSize.width = Number(match[1]);
        component._contentSize.height = Number(match[2]);
        changes.push(`${selector} 尺寸 ${before} -> ${dims}`);
    },

    '--pos': (value) => {
        const [selector, coords] = splitOnce(value, '--pos');
        const match = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(coords);
        if (!match) {
            fail(`--pos 取值应形如 名字=x,y，收到 ${coords}`);
        }
        const nodeIdx = findNode(selector);
        const pos = entries[nodeIdx]._lpos;
        const before = `${pos.x},${pos.y}`;
        pos.x = Number(match[1]);
        pos.y = Number(match[2]);
        changes.push(`${selector} 位置 (${before}) -> (${coords})`);
    },

    '--scale': (value) => {
        const [selector, raw] = splitOnce(value, '--scale');
        const factor = Number(raw);
        if (!Number.isFinite(factor) || factor <= 0) {
            fail(`--scale 取值必须是正数，收到 ${raw}`);
        }
        const nodeIdx = findNode(selector);
        const scale = entries[nodeIdx]._lscale;
        scale.x = factor;
        scale.y = factor;
        changes.push(`${selector} 缩放 -> ${factor}`);
    },

    '--active': (value) => {
        const [selector, raw] = splitOnce(value, '--active');
        if (raw !== 'true' && raw !== 'false') {
            fail(`--active 取值只能是 true 或 false，收到 ${raw}`);
        }
        const nodeIdx = findNode(selector);
        const before = entries[nodeIdx]._active;
        entries[nodeIdx]._active = raw === 'true';
        changes.push(`${selector} active ${before} -> ${raw}`);
    },

    '--label': (value) => {
        const [selector, text] = splitOnce(value, '--label');
        const nodeIdx = findNode(selector);
        const { component } = requireComponent(nodeIdx, 'cc.Label', selector);
        changes.push(`${selector} 文案 "${component._string}" -> "${text}"`);
        component._string = text;
    },

    '--sprite': (value) => {
        const [selector, imageName] = splitOnce(value, '--sprite');
        const nodeIdx = findNode(selector);
        const { component } = requireComponent(nodeIdx, 'cc.Sprite', selector);
        const uuid = findSpriteFrameUuid(imageName);
        component._spriteFrame = { __uuid__: uuid, __expectedType__: 'cc.SpriteFrame' };
        changes.push(`${selector} 贴图 -> ${imageName}`);
    },

    '--remove-component': (value) => {
        const [selector, type] = splitOnce(value, '--remove-component', ':');
        const nodeIdx = findNode(selector);
        const { idx } = requireComponent(nodeIdx, type, selector);
        removeEntry(idx);
        changes.push(`${selector} 删除组件 ${type}`);
    },
};

function splitOnce(value, flag, separator = '=') {
    const at = value.indexOf(separator);
    if (at < 0) {
        fail(`${flag} 取值缺少 "${separator}"，收到 ${value}`);
    }
    return [value.slice(0, at), value.slice(at + 1)];
}

for (const { flag, value } of ops) {
    const handler = HANDLERS[flag];
    if (!handler) {
        fail(`未知参数 ${flag}，可用：${Object.keys(HANDLERS).join(' ')}`);
    }
    handler(value);
}

console.log(`目标 ${targetRel}`);
for (const change of changes) {
    console.log(`  ${change}`);
}

if (dryRun) {
    console.log('\n--dry-run：未写入任何文件');
    process.exit(0);
}

// 备份。文件名带序号而非时间戳，便于按顺序回溯。
mkdirSync(BACKUP_DIR, { recursive: true });
const base = path.basename(targetRel);
const seq = readdirSync(BACKUP_DIR).filter((name) => name.startsWith(base)).length;
const backupPath = path.join(BACKUP_DIR, `${base}.${String(seq).padStart(3, '0')}.bak`);
copyFileSync(targetPath, backupPath);

// 缩进 2 空格与 Cocos Creator 的保存格式一致，避免整文件 diff。
writeFileSync(targetPath, `${JSON.stringify(entries, null, 2)}\n`);

try {
    execFileSync(
        process.execPath,
        ['--experimental-strip-types', path.join(REPO_ROOT, 'tools/validate-scene.mjs')],
        { cwd: REPO_ROOT, stdio: 'pipe' },
    );
    console.log(`\n已写入，校验通过。备份 ${path.relative(REPO_ROOT, backupPath)}`);
} catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    // 拆分未完成期间校验必然带着 Prefab 缺失等既有失败，
    // 只有当失败条数变多才说明是本次改动引入的。
    const before = countProblems(original);
    const after = (output.match(/^ {2}\S/gm) ?? []).length;
    if (after > before) {
        copyFileSync(backupPath, targetPath);
        console.error(`\n校验失败且问题数由 ${before} 增至 ${after}，已回滚。`);
        console.error(output.trim());
        process.exit(1);
    }
    console.log(`\n已写入。校验仍有 ${after} 条既有问题（改动前 ${before} 条），未新增。`);
    console.log(`备份 ${path.relative(REPO_ROOT, backupPath)}`);
}

function countProblems(sceneText) {
    const stash = readFileSync(targetPath, 'utf8');
    writeFileSync(targetPath, sceneText);
    try {
        execFileSync(
            process.execPath,
            ['--experimental-strip-types', path.join(REPO_ROOT, 'tools/validate-scene.mjs')],
            { cwd: REPO_ROOT, stdio: 'pipe' },
        );
        return 0;
    } catch (error) {
        return ((`${error.stdout ?? ''}${error.stderr ?? ''}`).match(/^ {2}\S/gm) ?? []).length;
    } finally {
        writeFileSync(targetPath, stash);
    }
}
