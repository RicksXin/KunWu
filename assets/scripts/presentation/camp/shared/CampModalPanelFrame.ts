import {
    _decorator,
    assetManager,
    BlockInputEvents,
    Button,
    Color,
    Component,
    Graphics,
    instantiate,
    Label,
    Node,
    Prefab,
    Sprite,
    UITransform,
} from 'cc';
import type { Font } from 'cc';

const { ccclass } = _decorator;

const FRAME_PREFAB_PATH = 'prefabs/CampModalPanelFrame';
const DESIGN_WIDTH = 375;
const DESIGN_HEIGHT = 817;

export interface CampModalFooterAction {
    readonly text: string;
    readonly onClick: () => void;
    readonly enabled?: boolean;
    readonly primary?: boolean;
}

export interface CampModalPanelFrameOptions {
    readonly panelWidth: number;
    readonly panelHeight: number;
    readonly footerBottomInset: number;
    readonly footerActions: readonly CampModalFooterAction[];
}

export interface CampModalFooterSlot {
    readonly node: Node;
    readonly button: Button;
    readonly sprite: Sprite;
    readonly label: Label;
}

let framePrefabPromise: Promise<Prefab> | null = null;

/**
 * 营地模态面板的纯外壳：全屏遮罩、灵源院风格框体、内容挂载点和底部按钮槽。
 * 业务内容、按钮文案、禁用态与点击行为全部由调用层注入。
 */
@ccclass('CampModalPanelFrame')
export class CampModalPanelFrame extends Component {
    private backdropNode: Node | null = null;
    private backdropGraphics: Graphics | null = null;
    private panelNode: Node | null = null;
    private contentNode: Node | null = null;
    private footerNode: Node | null = null;
    private slots: CampModalFooterSlot[] = [];
    private panelWidth = 359;
    private panelHeight = 570;
    private footerBottomInset = 30;

    get mainPanel(): Node | null {
        return this.panelNode;
    }

    get contentMount(): Node | null {
        return this.contentNode;
    }

    footerSlot(index: number): CampModalFooterSlot | null {
        return this.slots[index] ?? null;
    }

    configure(options: CampModalPanelFrameOptions): boolean {
        if (!this.bindNodes()) return false;
        this.panelWidth = options.panelWidth;
        this.panelHeight = options.panelHeight;
        this.footerBottomInset = options.footerBottomInset;
        this.layoutPanel();
        this.configureFooter(options.footerActions);
        return true;
    }

    fitToHost(host: Node, displayScale?: number): void {
        const size = host.getComponent(UITransform)?.contentSize;
        if (!size) return;
        const scale = displayScale ?? Math.min(
            size.width / DESIGN_WIDTH,
            size.height / DESIGN_HEIGHT,
        );
        if (scale <= 0) return;
        const viewportWidth = size.width / scale;
        const viewportHeight = size.height / scale;
        this.node.setScale(scale, scale, 1);
        this.setViewportSize(viewportWidth, viewportHeight);
    }

    setViewportSize(width: number, height: number): void {
        if (!this.bindNodes()) return;
        this.node.getComponent(UITransform)?.setContentSize(width, height);
        this.backdropNode?.getComponent(UITransform)?.setContentSize(width, height);
        this.redrawBackdrop(width, height);
    }

    setFooterFont(font: Font | null): void {
        for (const slot of this.slots) slot.label.font = font;
    }

    mountContent(node: Node): void {
        if (!this.contentNode || node === this.contentNode || node.parent === this.contentNode) return;
        node.setParent(this.contentNode, true);
    }

    mountContents(nodes: readonly Node[]): void {
        for (const node of nodes) this.mountContent(node);
    }

    private bindNodes(): boolean {
        if (this.backdropNode && this.backdropGraphics && this.panelNode
            && this.contentNode && this.footerNode) return true;
        this.backdropNode = this.node.getChildByName('Backdrop');
        this.panelNode = this.node.getChildByName('MainPanel');
        this.contentNode = this.panelNode?.getChildByName('ContentMount') ?? null;
        this.footerNode = this.node.getChildByName('Footer');
        this.slots = [1, 2, 3].map((index) => this.bindSlot(index)).filter(isSlot);
        if (!this.backdropNode || !this.panelNode || !this.contentNode
            || !this.footerNode || this.slots.length !== 3) {
            console.error('[CampModalPanelFrame] Prefab 骨架不完整');
            return false;
        }
        this.backdropNode.getComponent(BlockInputEvents)
            ?? this.backdropNode.addComponent(BlockInputEvents);
        const backdrop = this.backdropNode.getComponent(Sprite);
        if (backdrop) backdrop.enabled = false;
        this.backdropGraphics = this.backdropNode.getComponent(Graphics)
            ?? this.backdropNode.addComponent(Graphics);
        this.backdropGraphics.fillColor = new Color(0, 0, 0, 164);
        const size = this.backdropNode.getComponent(UITransform)?.contentSize;
        if (size) this.redrawBackdrop(size.width, size.height);
        return true;
    }

    private redrawBackdrop(width: number, height: number): void {
        if (!this.backdropGraphics) return;
        this.backdropGraphics.clear();
        this.backdropGraphics.rect(-width / 2, -height / 2, width, height);
        this.backdropGraphics.fill();
    }

    private bindSlot(index: number): CampModalFooterSlot | null {
        const node = this.footerNode?.getChildByName(`FooterButton${index}`) ?? null;
        const button = node?.getComponent(Button) ?? null;
        const sprite = node?.getComponent(Sprite) ?? null;
        const label = node?.getChildByName('Label')?.getComponent(Label) ?? null;
        return node && button && sprite && label ? { node, button, sprite, label } : null;
    }

    private layoutPanel(): void {
        this.node.setPosition(0, 0, 0);
        this.node.getComponent(UITransform)?.setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
        this.panelNode?.setPosition(0, 0, 0);
        this.panelNode?.getComponent(UITransform)?.setContentSize(this.panelWidth, this.panelHeight);
        this.contentNode?.setPosition(0, 0, 0);
        this.contentNode?.getComponent(UITransform)?.setContentSize(this.panelWidth, this.panelHeight);
        this.footerNode?.setPosition(0, -this.panelHeight / 2 + this.footerBottomInset, 0);
    }

    private configureFooter(actions: readonly CampModalFooterAction[]): void {
        const visibleCount = Math.min(3, actions.length);
        const compactLayout = visibleCount < 3;
        const width = compactLayout ? 132 : 105;
        const height = compactLayout ? 44 : 50;
        const positions = visibleCount === 1
            ? [0]
            : visibleCount === 2 ? [-75, 75] : [-121, 0, 121];
        this.footerNode?.getComponent(UITransform)?.setContentSize(347, height);
        this.slots.forEach((slot, index) => {
            const action = actions[index];
            slot.node.active = index < visibleCount && Boolean(action);
            if (!action) return;
            slot.node.setPosition(positions[index] ?? 0, 0, 0);
            slot.node.getComponent(UITransform)?.setContentSize(width, height);
            slot.label.node.getComponent(UITransform)?.setContentSize(width - 8, height - 6);
            slot.label.string = action.text;
            slot.label.fontSize = compactLayout ? 16 : 14;
            slot.label.lineHeight = Math.ceil(slot.label.fontSize * 1.25);
            slot.button.target = slot.node;
            slot.button.transition = Button.Transition.COLOR;
            const normalColor = action.enabled === false
                ? new Color(126, 126, 126, 255)
                : action.primary
                    ? new Color(255, 238, 204, 255)
                    : new Color(255, 255, 255, 255);
            slot.button.normalColor = normalColor;
            slot.button.pressedColor = new Color(192, 192, 192, 255);
            slot.button.hoverColor = new Color(235, 235, 235, 255);
            slot.button.disabledColor = new Color(126, 126, 126, 255);
            slot.button.duration = 0.08;
            slot.button.interactable = action.enabled ?? true;
            slot.sprite.color = normalColor;
            slot.node.off(Button.EventType.CLICK);
            slot.node.on(Button.EventType.CLICK, action.onClick, this);
        });
    }
}

export async function mountCampModalPanelFrame(
    host: Node,
    options: CampModalPanelFrameOptions,
): Promise<CampModalPanelFrame | null> {
    try {
        const prefab = await loadFramePrefab();
        if (!host.isValid) return null;
        const node = instantiate(prefab);
        copyLayer(node, host.layer);
        const frame = node.getComponent(CampModalPanelFrame)
            ?? node.addComponent(CampModalPanelFrame);
        if (!frame.configure(options)) {
            node.destroy();
            return null;
        }
        host.addChild(node);
        node.setSiblingIndex(0);
        frame.fitToHost(host);
        return frame;
    } catch (error) {
        console.error('[CampModalPanelFrame] 共享面板骨架加载失败', error);
        return null;
    }
}

function loadFramePrefab(): Promise<Prefab> {
    if (framePrefabPromise) return framePrefabPromise;
    framePrefabPromise = new Promise((resolve, reject) => {
        const bundle = assetManager.getBundle('camp');
        if (!bundle) {
            reject(new Error('camp Bundle 尚未加载'));
            return;
        }
        bundle.load(FRAME_PREFAB_PATH, Prefab, (error, prefab) => {
            if (error || !prefab) reject(error ?? new Error(`找不到 ${FRAME_PREFAB_PATH}`));
            else resolve(prefab);
        });
    }).catch((error) => {
        framePrefabPromise = null;
        throw error;
    });
    return framePrefabPromise;
}

function copyLayer(node: Node, layer: number): void {
    node.layer = layer;
    for (const child of node.children) copyLayer(child, layer);
}

function isSlot(value: CampModalFooterSlot | null): value is CampModalFooterSlot {
    return value !== null;
}
