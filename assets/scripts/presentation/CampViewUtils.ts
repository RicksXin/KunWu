import { Button, Component, Label, Node, UITransform } from 'cc';
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
