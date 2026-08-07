import { assetManager, Color, Label, Node, Sprite, SpriteFrame, UITransform } from 'cc';
import { CAMP_BUILDING_CHILD_NAMES } from 'db://assets/scripts/domain/CampSceneContract';
import type { BuildingId, BuildingState } from 'db://assets/scripts/domain/HallBadges';
import { drawCampPlate } from './CampViewUtils';

export type CampBuildingBadgeMode = 'hidden' | 'attention' | 'locked';

const LOCKED_BUILDING_SPRITE_PATHS: Partial<Record<BuildingId, string>> = {
    ling_pu: 'buildings/env_camp_building_ling_pu_locked/spriteFrame',
    zhao_xian_tai: 'buildings/env_camp_building_zhao_xian_tai_locked/spriteFrame',
    bai_bao_ku: 'buildings/env_camp_building_bai_bao_ku_locked/spriteFrame',
    lian_qi_fang: 'buildings/env_camp_building_lian_qi_fang_locked/spriteFrame',
    jiao_yi_hang: 'buildings/env_camp_building_jiao_yi_hang_locked/spriteFrame',
    huan_hun_tan: 'buildings/env_camp_building_huan_hun_tan_locked/spriteFrame',
};

const BUILDING_BADGE_SPRITE_PATHS: Readonly<
    Record<Exclude<CampBuildingBadgeMode, 'hidden'>, string>
> = {
    attention: 'ui/common/icon_camp_building_attention/spriteFrame',
    locked: 'ui/common/icon_camp_building_lock/spriteFrame',
};

const OPEN_NAME_FILL = new Color(36, 29, 24, 235);
const OPEN_NAME_STROKE = new Color(128, 98, 58, 242);
const OPEN_NAME_TEXT = new Color(232, 220, 187, 255);
const LOCKED_NAME_FILL = new Color(32, 42, 39, 153);
const LOCKED_NAME_STROKE = new Color(94, 106, 102, 179);
const LOCKED_NAME_TEXT = new Color(171, 178, 171, 255);
const BADGE_SIZES: Readonly<Record<Exclude<CampBuildingBadgeMode, 'hidden'>, number>> = {
    attention: 69.12,
    locked: 34.56,
};

const normalBuildingFrames = new WeakMap<Node, SpriteFrame | null>();
const desiredBuildingStates = new WeakMap<Node, BuildingState>();
const lockedBuildingFrames = new Map<BuildingId, SpriteFrame>();
const lockedBuildingFrameLoads = new Map<BuildingId, Promise<SpriteFrame | null>>();
const desiredBadgeModes = new WeakMap<Node, CampBuildingBadgeMode>();
const badgeFrames = new Map<Exclude<CampBuildingBadgeMode, 'hidden'>, SpriteFrame>();
const badgeFrameLoads = new Map<
    Exclude<CampBuildingBadgeMode, 'hidden'>,
    Promise<SpriteFrame | null>
>();

/** 建筑图、名称板和文字状态由同一个入口更新，避免锁定态各层不同步。 */
export function applyCampBuildingVisualState(
    node: Node,
    buildingId: BuildingId,
    state: BuildingState,
): void {
    const nameNode = node.getChildByName(CAMP_BUILDING_CHILD_NAMES.name);
    if (nameNode) {
        nameNode.active = true;
        const label = nameNode.getComponent(Label);
        if (label) {
            label.fontSize = 29;
            label.lineHeight = 58;
            label.isBold = state !== 'LOCKED';
            label.color = state === 'LOCKED' ? LOCKED_NAME_TEXT : OPEN_NAME_TEXT;
        }
    } else {
        console.error(`[CampView] 建筑 ${buildingId} 缺少名称节点`);
    }

    const stateNode = node.getChildByName(CAMP_BUILDING_CHILD_NAMES.state);
    if (stateNode) {
        stateNode.active = true;
        const oldStateLabel = stateNode.getComponent(Label);
        if (oldStateLabel) {
            oldStateLabel.string = '';
            oldStateLabel.enabled = false;
        }
        drawCampPlate(node, {
            fill: state === 'LOCKED' ? LOCKED_NAME_FILL : OPEN_NAME_FILL,
            stroke: state === 'LOCKED' ? LOCKED_NAME_STROKE : OPEN_NAME_STROKE,
            radius: 8.64,
            lineWidth: 2.88,
            centerX: stateNode.position.x,
            centerY: stateNode.position.y,
            width: stateNode.getComponent(UITransform)?.contentSize.width,
            height: stateNode.getComponent(UITransform)?.contentSize.height,
        });
    }

    const sprite = node.getComponent(Sprite);
    if (!sprite) {
        console.error(`[CampView] 建筑 ${buildingId} 缺少 Sprite`);
        return;
    }
    sprite.type = Sprite.Type.SIMPLE;
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

/** 锁定建筑固定显示锁图标；开放建筑按待办状态显示关注感叹号。 */
export function applyCampBuildingBadgeState(
    badge: Node | null,
    mode: CampBuildingBadgeMode,
): void {
    if (!badge) {
        return;
    }
    desiredBadgeModes.set(badge, mode);
    badge.active = mode !== 'hidden';
    if (mode === 'hidden') {
        return;
    }

    const transform = badge.getComponent(UITransform) ?? badge.addComponent(UITransform);
    transform.setContentSize(BADGE_SIZES[mode], BADGE_SIZES[mode]);
    badge.angle = mode === 'attention' ? 15 : 0;
    const sprite = badge.getComponent(Sprite) ?? badge.addComponent(Sprite);
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    sprite.color = new Color(255, 255, 255, mode === 'locked' ? 194 : 255);

    const loaded = badgeFrames.get(mode);
    if (loaded) {
        sprite.spriteFrame = loaded;
        return;
    }
    void loadBadgeFrame(mode).then((frame) => {
        if (!frame || !badge.isValid || desiredBadgeModes.get(badge) !== mode) {
            return;
        }
        const currentSprite = badge.getComponent(Sprite);
        if (currentSprite) {
            currentSprite.spriteFrame = frame;
        }
    });
}

/** 传送阵继续复用现有 Name 节点，但视觉语义改为“启程”行动按钮。 */
export function applyCampExpeditionVisual(node: Node | null): void {
    if (!node) {
        return;
    }
    const sprite = node.getComponent(Sprite);
    if (sprite) {
        sprite.type = Sprite.Type.SIMPLE;
    }
    const labelNode = node.getChildByName(CAMP_BUILDING_CHILD_NAMES.name);
    const label = labelNode?.getComponent(Label);
    if (!labelNode || !label) {
        return;
    }
    label.fontSize = 29;
    label.lineHeight = 52;
    label.isBold = true;
    label.color = OPEN_NAME_TEXT;
    const size = labelNode.getComponent(UITransform)?.contentSize;
    drawCampPlate(node, {
        fill: new Color(32, 42, 39, 245),
        stroke: new Color(111, 143, 133, 255),
        radius: 11.52,
        lineWidth: 2.88,
        centerX: labelNode.position.x,
        centerY: labelNode.position.y,
        width: size?.width,
        height: size?.height,
    });
}

function loadBadgeFrame(
    mode: Exclude<CampBuildingBadgeMode, 'hidden'>,
): Promise<SpriteFrame | null> {
    const loaded = badgeFrames.get(mode);
    if (loaded) {
        return Promise.resolve(loaded);
    }
    const pending = badgeFrameLoads.get(mode);
    if (pending) {
        return pending;
    }
    const task = new Promise<SpriteFrame | null>((resolve) => {
        const bundle = assetManager.getBundle('camp');
        if (!bundle) {
            resolve(null);
            return;
        }
        bundle.load(BUILDING_BADGE_SPRITE_PATHS[mode], SpriteFrame, (error, frame) => {
            if (error || !frame) {
                console.error(`[CampView] 建筑状态图标加载失败：${mode}`, error);
                resolve(null);
                return;
            }
            badgeFrames.set(mode, frame);
            resolve(frame);
        });
    }).finally(() => badgeFrameLoads.delete(mode));
    badgeFrameLoads.set(mode, task);
    return task;
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
    }).finally(() => lockedBuildingFrameLoads.delete(buildingId));
    lockedBuildingFrameLoads.set(buildingId, task);
    return task;
}
