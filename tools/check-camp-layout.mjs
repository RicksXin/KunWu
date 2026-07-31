/**
 * 营地布局体检：算出重叠、出界、被 HUD 遮挡的清单。
 *
 * 存在原因：全景高 2353，但视口只有 1920 且不纵滑，再扣掉顶部 HUD 与底部 HUD，
 * 真正不被遮挡的纵向区间只有 1500。这个限制在编辑器场景视图里完全看不出来
 * （那里没有 Mask 裁剪也没有 HUD 遮挡），只有跑起来才发现建筑藏在 HUD 后面。
 * 提布局方案前先跑这个，比来回改预览快。
 *
 * 与 validate-scene 的分工：那个查结构与产品约束，是硬门禁；
 * 这个只报告几何问题，默认不影响退出码（加 --strict 才失败）。
 *
 * 用法：
 *   pnpm check:layout                 # 体检当前场景
 *   pnpm check:layout --strict        # 有问题就非零退出
 *   pnpm check:layout --size 800x533  # 假设所有建筑改成这个尺寸会怎样
 *   pnpm check:layout --max           # 反推不重叠不出界的最大建筑尺寸
 */

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { BUILDING_IDS } from './camp-domain-contract.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SCENE_PATH = path.join(REPO_ROOT, 'assets/bundles/camp/Camp.scene');

const argv = process.argv.slice(2);
const strict = argv.includes('--strict');
const wantMax = argv.includes('--max');
const sizeArg = argv[argv.indexOf('--size') + 1];
const forcedSize = argv.includes('--size') ? parseSize(sizeArg) : null;

function parseSize(raw) {
    const match = /^(\d+)x(\d+)$/.exec(raw ?? '');
    if (!match) {
        console.error(`--size 取值应形如 800x533，收到 ${raw}`);
        process.exit(1);
    }
    return { width: Number(match[1]), height: Number(match[2]) };
}

const scene = JSON.parse(readFileSync(SCENE_PATH, 'utf8'));
const nodeIdx = (name) =>
    scene.findIndex((entry) => entry.__type__ === 'cc.Node' && entry._name === name);
const transform = (idx) =>
    (scene[idx]?._components ?? [])
        .map((ref) => scene[ref.__id__])
        .find((component) => component?.__type__ === 'cc.UITransform');
const sizeOf = (name) => {
    const t = transform(nodeIdx(name));
    return t ? { width: t._contentSize.width, height: t._contentSize.height } : null;
};

const viewport = sizeOf('WorldViewport');
const content = sizeOf('PanoramaContent');
const topHud = sizeOf('TopHUD');
const bottomHud = sizeOf('BottomHUD');
if (!viewport || !content || !topHud || !bottomHud) {
    console.error('场景缺少 WorldViewport / PanoramaContent / TopHUD / BottomHUD，无法体检');
    process.exit(1);
}

/**
 * 运行时真正能摆东西的区域。
 *
 * 横向：内容比视口宽，可横滑，故整个内容宽度都可用。
 * 纵向：不滚动，所以只有视口高度那一段可见；再扣掉压在全景之上的上下 HUD。
 */
const xLimit = content.width / 2;
const yTop = viewport.height / 2 - topHud.height;
const yBottom = -viewport.height / 2 + bottomHud.height;

const problems = [];
const notes = [];
/** SpriteFrame uuid -> png 路径，首次用到时才扫描 assets/。 */
let frameIndexCache = null;

// 全景内容里永远看不到的部分——纵向不滚动，超出视口高度的都是浪费。
const wastedHeight = content.height - viewport.height;
if (wastedHeight > 0) {
    notes.push(
        `PanoramaContent 高 ${content.height}，视口只有 ${viewport.height} 且不纵滑，` +
            `其中 ${wastedHeight}px 永远不可见`,
    );
}

// 起始横滑位置。调试时手改过 PanoramaContent.x 忘了改回是常见事故。
const contentX = scene[nodeIdx('PanoramaContent')]?._lpos?.x ?? 0;
if (contentX !== 0) {
    problems.push(
        `PanoramaContent 的 x 是 ${contentX}，不是 0——` +
            `调试横滑后忘了改回会让进入营地时视角不在中部`,
    );
}

const travel = (content.width - viewport.width) / 2;
notes.push(`可横滑范围 x = ±${travel}（编辑器里手填此值可模拟横滑到边缘）`);
notes.push(`不被 HUD 遮挡的纵向区间 ${yBottom} .. ${yTop}（高 ${yTop - yBottom}）`);

/** 参与布局的可见实体：七座建筑 + 传送阵。 */
const SUBJECTS = [...BUILDING_IDS, 'ExpeditionEntry'];
const boxes = [];
for (const name of SUBJECTS) {
    const idx = nodeIdx(name);
    if (idx < 0) {
        problems.push(`场景缺少 ${name}`);
        continue;
    }
    const own = sizeOf(name);
    const size = forcedSize ?? own;
    const pos = scene[idx]._lpos;
    boxes.push({
        name,
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
        left: pos.x - size.width / 2,
        right: pos.x + size.width / 2,
        bottom: pos.y - size.height / 2,
        top: pos.y + size.height / 2,
    });
}

if (forcedSize) {
    notes.push(`假设全部实体为 ${forcedSize.width}x${forcedSize.height} 进行推演`);
}

// 逐对检查重叠。建筑贴图基本没有透明留白，包围盒相交即视觉重叠。
for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom);
        if (overlapX > 0 && overlapY > 0) {
            problems.push(
                `${a.name} 与 ${b.name} 重叠 ${Math.round(overlapX)}x${Math.round(overlapY)}px`,
            );
        }
    }
}

// 出界与被 HUD 遮挡。这两类在编辑器里都看不出来。
for (const box of boxes) {
    if (box.left < -xLimit || box.right > xLimit) {
        problems.push(`${box.name} 横向超出全景边界（±${xLimit}）`);
    }
    if (box.top > yTop) {
        problems.push(
            `${box.name} 顶部有 ${Math.round(box.top - yTop)}px 被顶部 HUD 遮挡`,
        );
    }
    if (box.bottom < yBottom) {
        problems.push(
            `${box.name} 底部有 ${Math.round(yBottom - box.bottom)}px 被底部 HUD 遮挡`,
        );
    }
}

// 检查建筑显示比例是否与源图一致，避免被压扁。
for (const box of boxes) {
    const spriteName = spriteImageOf(box.name);
    if (!spriteName) {
        continue;
    }
    const source = pngSize(spriteName);
    if (!source) {
        continue;
    }
    const sourceRatio = source.width / source.height;
    const shownRatio = box.width / box.height;
    if (Math.abs(sourceRatio - shownRatio) > 0.02) {
        problems.push(
            `${box.name} 显示比例 ${shownRatio.toFixed(2)} 与源图 ${sourceRatio.toFixed(2)} 不符，` +
                `按源图应为 ${box.width}x${Math.round(box.width / sourceRatio)}`,
        );
    }
}

if (wantMax) {
    reportMaxSize();
}

console.log(`营地布局体检（${SUBJECTS.length} 个实体）`);
for (const note of notes) {
    console.log(`  · ${note}`);
}
if (problems.length === 0) {
    console.log('\n未发现重叠、出界或遮挡问题');
} else {
    console.log(`\n发现 ${problems.length} 个问题：`);
    for (const problem of problems) {
        console.log(`  ✗ ${problem}`);
    }
}

if (strict && problems.length > 0) {
    process.exit(1);
}

/** 反推：保持现有落点不动，建筑最大能放多大。 */
function reportMaxSize() {
    const positions = boxes.map(({ name, x, y }) => ({ name, x, y }));
    const ratio = 1536 / 1024;
    let best = 0;
    let blocker = null;
    for (let width = 120; width <= 2000; width += 2) {
        const height = width / ratio;
        let ok = true;
        let why = null;
        for (let i = 0; i < positions.length && ok; i += 1) {
            const a = positions[i];
            if (Math.abs(a.x) + width / 2 > xLimit) {
                ok = false;
                why = `${a.name} 横向出界`;
                break;
            }
            if (a.y + height / 2 > yTop) {
                ok = false;
                why = `${a.name} 被顶部 HUD 遮挡`;
                break;
            }
            if (a.y - height / 2 < yBottom) {
                ok = false;
                why = `${a.name} 被底部 HUD 遮挡`;
                break;
            }
            for (let j = i + 1; j < positions.length; j += 1) {
                const b = positions[j];
                if (Math.abs(a.x - b.x) < width && Math.abs(a.y - b.y) < height) {
                    ok = false;
                    why = `${a.name} 与 ${b.name} 重叠`;
                    break;
                }
            }
        }
        if (ok) {
            best = width;
        } else if (blocker === null) {
            blocker = why;
        }
    }
    notes.push(
        best > 0
            ? `保持现有落点，建筑最大 ${best}x${Math.round(best / ratio)}（再大则 ${blocker}）`
            : `当前落点下任何尺寸都有问题：${blocker}`,
    );
}

/** 节点上 Sprite 指向的图片名，用于核对显示比例。 */
function spriteImageOf(nodeName) {
    const sprite = (scene[nodeIdx(nodeName)]?._components ?? [])
        .map((ref) => scene[ref.__id__])
        .find((component) => component?.__type__ === 'cc.Sprite');
    const uuid = sprite?._spriteFrame?.__uuid__;
    if (!uuid) {
        return null;
    }
    return spriteFrameIndex().get(uuid) ?? null;
}

function spriteFrameIndex() {
    if (frameIndexCache) {
        return frameIndexCache;
    }
    frameIndexCache = new Map();
    const stack = [path.join(REPO_ROOT, 'assets')];
    while (stack.length > 0) {
        const dir = stack.pop();
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                stack.push(full);
                continue;
            }
            if (!entry.name.endsWith('.png.meta')) {
                continue;
            }
            const meta = JSON.parse(readFileSync(full, 'utf8'));
            for (const subId of Object.keys(meta.subMetas ?? {})) {
                frameIndexCache.set(`${meta.uuid}@${subId}`, full.replace(/\.meta$/, ''));
            }
        }
    }
    return frameIndexCache;
}

/** 只读 PNG 的 IHDR，避免为了拿尺寸引入图像库。 */
function pngSize(pngPath) {
    try {
        const buffer = readFileSync(pngPath);
        if (buffer.readUInt32BE(12) !== 0x49484452) {
            return null;
        }
        return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    } catch {
        return null;
    }
}
