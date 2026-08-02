import { Button, Color, Component, Graphics, Label, Node, Sprite, UITransform } from 'cc';
import {
    CAMP_LING_PU_PATHS,
    campLingPuResourceRowPath,
} from 'db://assets/scripts/domain/CampSceneContract';
import type { P1LingPuJob } from 'db://assets/scripts/domain/LingPu';
import {
    bindCampButton,
    campNode,
    warnCampTouchTarget,
} from '../shared/CampViewUtils';
import {
    LingPuResourceRowComponent,
    RESOURCE_ROW_DEFINITIONS,
    TEXT_WARNING,
} from './LingPuViewTypes';
import type {
    ButtonView,
    LingPuResourceRowDefinition,
    LingPuView,
    VisualBackground,
} from './LingPuViewTypes';

export interface LingPuViewCallbacks {
    readonly recruit: () => void;
    readonly close: () => void;
    readonly confirm: () => void;
    readonly cancel: () => void;
    readonly reassign: (job: P1LingPuJob, delta: -1 | 1) => void;
    readonly upgrade: (job: P1LingPuJob) => void;
}

export function bindLingPuView(
    owner: Component,
    disposers: (() => void)[],
    callbacks: LingPuViewCallbacks,
): LingPuView | null {
    const labels: Label[] = [];
    const label = (path: string): Label | null => {
        const result = campNode(owner.node, path)?.getComponent(Label) ?? null;
        if (!result) console.error(`[灵圃] ${path} 缺少 Label`);
        else labels.push(result);
        return result;
    };
    const sprite = (path: string): Sprite | null => {
        const result = campNode(owner.node, path)?.getComponent(Sprite) ?? null;
        if (!result) console.error(`[灵圃] ${path} 缺少 Sprite`);
        return result;
    };
    const background = (path: string): VisualBackground | null => {
        const node = campNode(owner.node, path);
        const image = node?.getComponent(Sprite) ?? null;
        if (!node || !image) {
            console.error(`[灵圃] ${path} 缺少 Sprite 背景`);
            return null;
        }
        return { node, sprite: image };
    };
    const button = (nodePath: string, visualPath: string, labelPath?: string): ButtonView | null => {
        const node = campNode(owner.node, nodePath);
        const control = node?.getComponent(Button) ?? null;
        const visual = background(visualPath);
        const text = labelPath ? label(labelPath) : null;
        if (!node || !control || !visual || (labelPath && !text)) {
            console.error(`[灵圃] ${nodePath} 按钮结构不完整`);
            return null;
        }
        configureButton(control, visual.node);
        return { node, button: control, visual, label: text };
    };

    const mount = campNode(owner.node, CAMP_LING_PU_PATHS.mount);
    const panelRoot = campNode(owner.node, CAMP_LING_PU_PATHS.panel);
    const mainPanel = campNode(owner.node, CAMP_LING_PU_PATHS.mainPanel);
    const panelBackground = background(CAMP_LING_PU_PATHS.panelFrame);
    const title = label(CAMP_LING_PU_PATHS.title);
    const timerLabel = label(CAMP_LING_PU_PATHS.timerLabel);
    const progressTrack = background(CAMP_LING_PU_PATHS.progressTrack);
    const progressFill = sprite(CAMP_LING_PU_PATHS.progressFill);
    const recruitButton = button(CAMP_LING_PU_PATHS.recruitButton, CAMP_LING_PU_PATHS.recruitVisual, CAMP_LING_PU_PATHS.recruitLabel);
    const closeButton = button(CAMP_LING_PU_PATHS.closeButton, CAMP_LING_PU_PATHS.closeVisual, CAMP_LING_PU_PATHS.closeLabel);
    const confirmationRoot = campNode(owner.node, CAMP_LING_PU_PATHS.confirmation);
    const confirmationPanel = background(CAMP_LING_PU_PATHS.confirmationFrame);
    const confirmationTitle = label(CAMP_LING_PU_PATHS.confirmationTitle);
    const confirmationIcon = sprite(CAMP_LING_PU_PATHS.confirmationIcon);
    const confirmationMessage = label(CAMP_LING_PU_PATHS.confirmationMessage);
    const confirmationDetail = label(CAMP_LING_PU_PATHS.confirmationDetail);
    const confirmationError = label(CAMP_LING_PU_PATHS.confirmationError);
    const confirmationPrimary = button(CAMP_LING_PU_PATHS.confirmationPrimary, CAMP_LING_PU_PATHS.confirmationPrimaryVisual, CAMP_LING_PU_PATHS.confirmationPrimaryLabel);
    const confirmationCancel = button(CAMP_LING_PU_PATHS.confirmationCancel, CAMP_LING_PU_PATHS.confirmationCancelVisual, CAMP_LING_PU_PATHS.confirmationCancelLabel);

    const required = [mount, panelRoot, mainPanel, panelBackground, title, timerLabel,
        progressTrack, progressFill, recruitButton, closeButton, confirmationRoot,
        confirmationPanel, confirmationTitle, confirmationIcon, confirmationMessage,
        confirmationDetail, confirmationError, confirmationPrimary, confirmationCancel];
    if (required.some((value) => !value)
        || !configureSolid(owner.node, CAMP_LING_PU_PATHS.backdrop, new Color(0, 0, 0, 164))
        || !configureSolid(owner.node, CAMP_LING_PU_PATHS.confirmationBackdrop, new Color(0, 0, 0, 126))) {
        console.error('[灵圃] Prefab 节点或组件不完整，面板绑定失败');
        return null;
    }

    const rows = new Map();
    for (const definition of RESOURCE_ROW_DEFINITIONS) {
        const row = bindResourceRow(owner, disposers, definition, callbacks, label, sprite, background, button);
        if (!row) {
            console.error(`[灵圃] ${definition.name}资源栏绑定失败`);
            return null;
        }
        rows.set(definition.id, row);
        if (!definition.job) row.renderLocked();
    }

    bindCampButton(owner, recruitButton!.node, callbacks.recruit, disposers);
    bindCampButton(owner, closeButton!.node, callbacks.close, disposers);
    bindCampButton(owner, confirmationPrimary!.node, callbacks.confirm, disposers);
    bindCampButton(owner, confirmationCancel!.node, callbacks.cancel, disposers);
    warnCampTouchTarget(recruitButton!.node, '灵圃杂役招募');
    warnCampTouchTarget(closeButton!.node, '灵圃关闭');
    warnCampTouchTarget(confirmationPrimary!.node, '灵圃二次确认');
    warnCampTouchTarget(confirmationCancel!.node, '灵圃二次确认取消');
    panelRoot!.active = false;
    confirmationRoot!.active = false;
    return {
        mount: mount!, panelRoot: panelRoot!, panelBackground: panelBackground!,
        timerLabel: timerLabel!, progressTrack: progressTrack!, progressFill: progressFill!,
        recruitButton: recruitButton!, closeButton: closeButton!,
        confirmationRoot: confirmationRoot!, confirmationPanel: confirmationPanel!,
        confirmationTitle: confirmationTitle!, confirmationIcon: confirmationIcon!,
        confirmationMessage: confirmationMessage!, confirmationDetail: confirmationDetail!,
        confirmationError: confirmationError!, confirmationPrimary: confirmationPrimary!,
        confirmationCancel: confirmationCancel!, rows, labels,
        resourceIconFrames: new Map(),
    };
}

function bindResourceRow(
    owner: Component,
    disposers: (() => void)[],
    definition: LingPuResourceRowDefinition,
    callbacks: LingPuViewCallbacks,
    label: (path: string) => Label | null,
    sprite: (path: string) => Sprite | null,
    background: (path: string) => VisualBackground | null,
    button: (nodePath: string, visualPath: string, labelPath?: string) => ButtonView | null,
): LingPuResourceRowComponent | null {
    const path = (child?: Parameters<typeof campLingPuResourceRowPath>[1]): string =>
        campLingPuResourceRowPath(definition.id, child);
    const root = campNode(owner.node, path());
    const rowBackground = background(path('background'));
    const warningOutline = campNode(owner.node, path('warningOutline'));
    const icon = sprite(path('icon'));
    const name = label(path('name'));
    const stock = label(path('stock'));
    const rate = label(path('rate'));
    const workers = label(path('workers'));
    const status = label(path('status'));
    const minus = button(path('minus'), path('minusVisual'));
    const plus = button(path('plus'), path('plusVisual'));
    const upgrade = button(path('upgrade'), path('upgradeVisual'), path('upgradeLabel'));
    if (!root || !rowBackground || !warningOutline || !configureOutline(warningOutline)
        || !icon || !name || !stock || !rate || !workers || !status || !minus || !plus || !upgrade) return null;
    if (definition.job) {
        const job = definition.job;
        bindCampButton(owner, minus.node, () => callbacks.reassign(job, -1), disposers);
        bindCampButton(owner, plus.node, () => callbacks.reassign(job, 1), disposers);
        bindCampButton(owner, upgrade.node, () => callbacks.upgrade(job), disposers);
    }
    warnCampTouchTarget(minus.node, `${definition.name}岗位减少`);
    warnCampTouchTarget(plus.node, `${definition.name}岗位增加`);
    warnCampTouchTarget(upgrade.node, `${definition.name}储量升级`);
    return new LingPuResourceRowComponent(definition, {
        root, background: rowBackground, warningOutline, icon, name, stock, rate,
        workers, status, minus, plus, upgrade,
    });
}

function configureButton(button: Button, target: Node): void {
    button.target = target;
    button.transition = Button.Transition.COLOR;
    button.normalColor = new Color(255, 255, 255, 255);
    button.pressedColor = new Color(192, 192, 192, 255);
    button.hoverColor = new Color(235, 235, 235, 255);
    button.disabledColor = new Color(96, 96, 96, 205);
    button.duration = 0.08;
}

function configureSolid(root: Node, path: string, color: Color): Node | null {
    const node = campNode(root, path);
    const graphics = node?.getComponent(Graphics) ?? null;
    if (!node || !graphics) return null;
    graphics.fillColor = color;
    const size = node.getComponent(UITransform)?.contentSize;
    if (size) redrawSolid(node, size.width, size.height);
    return node;
}

function configureOutline(node: Node): boolean {
    const graphics = node.getComponent(Graphics);
    const size = node.getComponent(UITransform)?.contentSize;
    if (!graphics || !size) return false;
    graphics.clear();
    graphics.strokeColor = TEXT_WARNING.clone();
    graphics.lineWidth = 6;
    graphics.rect(-size.width / 2 + 3, -size.height / 2 + 3, size.width - 6, size.height - 6);
    graphics.stroke();
    node.active = false;
    return true;
}

export function syncLingPuViewSize(root: Node, view: LingPuView): void {
    const size = root.getComponent(UITransform)?.contentSize;
    if (!size) return;
    view.mount.getComponent(UITransform)?.setContentSize(size);
    view.panelRoot.getComponent(UITransform)?.setContentSize(size);
    view.confirmationRoot.getComponent(UITransform)?.setContentSize(size);
    redrawSolid(view.panelRoot.getChildByName('Backdrop'), size.width, size.height);
    redrawSolid(view.confirmationRoot.getChildByName('ConfirmBackdrop'), size.width, size.height);
}

function redrawSolid(node: Node | null, width: number, height: number): void {
    if (!node) return;
    node.getComponent(UITransform)?.setContentSize(width, height);
    const graphics = node.getComponent(Graphics);
    if (!graphics) return;
    graphics.clear();
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
}
