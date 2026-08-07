import {
    Button,
    Color,
    Component,
    Graphics,
    Label,
    Node,
    UITransform,
} from 'cc';
import { meetsTouchTarget, MIN_TOUCH_TARGET_DP } from 'db://assets/scripts/domain/ViewportLayout';

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

export interface CampPlateStyle {
    readonly fill: Color;
    readonly stroke?: Color;
    readonly radius: number;
    readonly lineWidth?: number;
    readonly centerX?: number;
    readonly centerY?: number;
    readonly width?: number;
    readonly height?: number;
    readonly insetX?: number;
    readonly insetY?: number;
}

const CAMP_PLATE_NODE_NAME = '__CampPlateVisual';

/**
 * 在宿主节点的首个子节点上绘制可缩放底板，避免为纯色 HUD/名称板新增位图资源。
 *
 * Cocos 的一个 Node 只能可靠维护一个 UIRenderer。Sprite、Label 和 Graphics 如果挂在
 * 同一 Node，最后启用的渲染组件会占用该节点的 UI 渲染入口，因此底板必须使用独立子节点。
 */
export function drawCampPlate(node: Node, style: CampPlateStyle): Graphics | null {
    const transform = node.getComponent(UITransform);
    if (!transform) {
        return null;
    }
    const plateNode = getOrCreateCampPlateNode(node, transform);
    const graphics = plateNode.getComponent(Graphics) ?? plateNode.addComponent(Graphics);
    plateNode.active = true;
    graphics.enabled = true;
    const width = style.width ?? transform.contentSize.width - (style.insetX ?? 0) * 2;
    const height = style.height ?? transform.contentSize.height - (style.insetY ?? 0) * 2;
    const x = (style.centerX ?? 0) - width / 2;
    const y = (style.centerY ?? 0) - height / 2;
    graphics.clear();
    graphics.fillColor = style.fill;
    graphics.roundRect(x, y, width, height, style.radius);
    graphics.fill();
    if (style.stroke) {
        graphics.lineWidth = style.lineWidth ?? 1;
        graphics.strokeColor = style.stroke;
        graphics.roundRect(x, y, width, height, style.radius);
        graphics.stroke();
    }
    return graphics;
}

function getOrCreateCampPlateNode(node: Node, hostTransform: UITransform): Node {
    const plateNode = node.getChildByName(CAMP_PLATE_NODE_NAME) ?? new Node(CAMP_PLATE_NODE_NAME);
    plateNode.layer = node.layer;
    if (plateNode.parent !== node) {
        node.insertChild(plateNode, 0);
    } else {
        plateNode.setSiblingIndex(0);
    }
    plateNode.setPosition(0, 0, 0);
    const transform = plateNode.getComponent(UITransform) ?? plateNode.addComponent(UITransform);
    transform.setContentSize(hostTransform.contentSize);
    return plateNode;
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
    const pending = disposers.splice(0);
    for (const dispose of pending) {
        try {
            dispose();
        } catch {
            // Cocos 销毁场景时先销毁 NodeEventProcessor，再调用组件 onDestroy。
            // 此时 node.off() 已无必要且会抛错；继续释放其余外部订阅即可。
        }
    }
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
