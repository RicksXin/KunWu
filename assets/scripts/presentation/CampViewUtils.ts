import { assetManager, Button, Component, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { CAMP_BUILDING_CHILD_NAMES } from 'db://assets/scripts/domain/CampSceneContract';
import type { BuildingId, BuildingState } from 'db://assets/scripts/domain/HallBadges';
import { meetsTouchTarget, MIN_TOUCH_TARGET_DP } from 'db://assets/scripts/domain/ViewportLayout';

const LOCKED_BUILDING_SPRITE_PATHS: Partial<Record<BuildingId, string>> = {
    ling_pu: 'buildings/env_camp_building_ling_pu_locked/spriteFrame',
    zhao_xian_tai: 'buildings/env_camp_building_zhao_xian_tai_locked/spriteFrame',
    bai_bao_ku: 'buildings/env_camp_building_bai_bao_ku_locked/spriteFrame',
    lian_qi_fang: 'buildings/env_camp_building_lian_qi_fang_locked/spriteFrame',
    jiao_yi_hang: 'buildings/env_camp_building_jiao_yi_hang_locked/spriteFrame',
    huan_hun_tan: 'buildings/env_camp_building_huan_hun_tan_locked/spriteFrame',
};

const normalBuildingFrames = new WeakMap<Node, SpriteFrame | null>();
const desiredBuildingStates = new WeakMap<Node, BuildingState>();
const lockedBuildingFrames = new Map<BuildingId, SpriteFrame>();
const lockedBuildingFrameLoads = new Map<BuildingId, Promise<SpriteFrame | null>>();

/** 在一个 Prefab 内按相对路径查找节点，避免保存跨 Prefab 引用。 */
export function campNode(root: Node, path: string): Node | null {
    let current: Node | null = root;
    for (const segment of path.split('/').filter(Boolean)) {
        current = current?.getChildByName(segment) ?? null;
        if (!current) {
            console.error(`[CampView] ${root.name} 缺少节点 ${path}`);
            return null;
        }
    }
    return current;
}

export function campLabel(root: Node, path: string): Label | null {
    const node = campNode(root, path);
    const label = node?.getComponent(Label) ?? null;
    if (node && !label) {
        console.error(`[CampView] ${path} 缺少 Label`);
    }
    return label;
}

/**
 * LOCKED 使用独立封闭建筑图，其余状态恢复场景中配置的普通图。
 *
 * 普通图在节点首次渲染时缓存；异步加载完成前若状态已经变化，回调不会用旧状态
 * 覆盖新画面。AVAILABLE 代表已满足解锁条件，因此应展示普通建筑而不是 locked 图。
 */
export function applyCampBuildingVisualState(
    node: Node,
    buildingId: BuildingId,
    state: BuildingState,
): void {
    const nameNode = node.getChildByName(CAMP_BUILDING_CHILD_NAMES.name);
    if (nameNode) {
        nameNode.active = state !== 'LOCKED';
    } else {
        console.error(`[CampView] 建筑 ${buildingId} 缺少名称节点`);
    }

    const sprite = node.getComponent(Sprite);
    if (!sprite) {
        console.error(`[CampView] 建筑 ${buildingId} 缺少 Sprite`);
        return;
    }

    if (!normalBuildingFrames.has(node)) {
        normalBuildingFrames.set(node, sprite.spriteFrame);
    }
    desiredBuildingStates.set(node, state);

    if (state !== 'LOCKED') {
        sprite.spriteFrame = normalBuildingFrames.get(node) ?? null;
        return;
    }

    const lockedFrame = lockedBuildingFrames.get(buildingId);
    if (lockedFrame) {
        sprite.spriteFrame = lockedFrame;
        return;
    }

    const path = LOCKED_BUILDING_SPRITE_PATHS[buildingId];
    if (!path) {
        return;
    }

    void loadLockedBuildingFrame(buildingId, path).then((frame) => {
        if (!frame || !node.isValid || desiredBuildingStates.get(node) !== 'LOCKED') {
            return;
        }
        const currentSprite = node.getComponent(Sprite);
        if (currentSprite) {
            currentSprite.spriteFrame = frame;
        }
    });
}

function loadLockedBuildingFrame(
    buildingId: BuildingId,
    path: string,
): Promise<SpriteFrame | null> {
    const loaded = lockedBuildingFrames.get(buildingId);
    if (loaded) {
        return Promise.resolve(loaded);
    }

    const pending = lockedBuildingFrameLoads.get(buildingId);
    if (pending) {
        return pending;
    }

    const task = new Promise<SpriteFrame | null>((resolve) => {
        const bundle = assetManager.getBundle('camp');
        if (!bundle) {
            console.error('[CampView] camp Bundle 尚未加载，无法切换 locked 建筑图');
            resolve(null);
            return;
        }
        bundle.load(path, SpriteFrame, (error, frame) => {
            if (error || !frame) {
                console.error(`[CampView] locked 建筑图加载失败：${path}`, error);
                resolve(null);
                return;
            }
            lockedBuildingFrames.set(buildingId, frame);
            resolve(frame);
        });
    }).finally(() => {
        lockedBuildingFrameLoads.delete(buildingId);
    });
    lockedBuildingFrameLoads.set(buildingId, task);
    return task;
}

export function bindCampButton(
    owner: Component,
    node: Node | null,
    handler: () => void,
    disposers: (() => void)[],
): void {
    if (!node) {
        return;
    }
    node.on(Button.EventType.CLICK, handler, owner);
    disposers.push(() => node.off(Button.EventType.CLICK, handler, owner));
}

export function disposeCampBindings(disposers: (() => void)[]): void {
    for (const dispose of disposers) {
        dispose();
    }
    disposers.length = 0;
}

/** 让常驻页面 Prefab 根节点跟随 SafeAreaRoot，子面板可继续使用 Widget 铺满。 */
export function fitCampPageRoot(owner: Component, disposers: (() => void)[]): void {
    const rootTransform = owner.node.getComponent(UITransform) ?? owner.node.addComponent(UITransform);
    const parent = owner.node.parent;
    const syncSize = (): void => {
        const parentSize = parent?.getComponent(UITransform)?.contentSize;
        if (parentSize) {
            rootTransform.setContentSize(parentSize);
        }
    };
    syncSize();
    parent?.on(Node.EventType.SIZE_CHANGED, syncSize, owner);
    disposers.push(() => parent?.off(Node.EventType.SIZE_CHANGED, syncSize, owner));
}

export function warnCampTouchTarget(node: Node | null, label: string): void {
    const transform = node?.getComponent(UITransform);
    if (!transform) {
        return;
    }
    const { width, height } = transform.contentSize;
    if (!meetsTouchTarget(width, height)) {
        console.warn(
            `[CampView] ${label} 触控区域 ${width}×${height} ` +
                `小于 ${MIN_TOUCH_TARGET_DP}×${MIN_TOUCH_TARGET_DP}dp（PRD-09 §4）`,
        );
    }
}
