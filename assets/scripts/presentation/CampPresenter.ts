import { _decorator, Component, Node, Button, EventTouch, Label, UITransform } from 'cc';
import { AppRoot } from '../AppRoot';
import { ResourceBar } from './ResourceBar';
import {
    BOTTOM_NAV_ITEMS,
    BUILDING_IDS,
    computeBadges,
    isBuildingUsable,
    resolveBuildingStates,
} from '../domain/HallBadges';
import type { BottomNavItem, BuildingId, BuildingState, PendingAction } from '../domain/HallBadges';
import { meetsTouchTarget, MIN_TOUCH_TARGET_DP } from '../domain/ViewportLayout';
import {
    EntryActivationGate,
    PanoramaPositionMemory,
    advanceDragGesture,
    panoramaBounds,
    stepPanoramaInertia,
} from '../domain/HallPanorama';
import type { DragGesture, PanoramaBounds } from '../domain/HallPanorama';
import {
    availableCampNpcs,
    completeCampNpcDialogue,
    dialogueForCampNpc,
} from '../domain/CampNpcs';
import type { CampNpcId } from '../domain/CampNpcs';
import {
    CAMP_SYSTEM_ENTRY_FEEDBACK,
    CAMP_SYSTEM_ENTRY_IDS,
    campCurrencyBalances,
} from '../domain/CampBottomHud';
import type { CampSystemEntryId } from '../domain/CampBottomHud';

const { ccclass, property } = _decorator;

/**
 * 营地大厅（PRD-01、任务 P0-HALL-001）。
 *
 * 职责边界：只做「读状态 → 更新节点」与「收集点击 → 转交路由」，
 * 不含红点规则（在 HallBadges，20 个单测）也不含资源计算。
 *
 * 建筑按钮的可点击性由 domain 判定，
 * 避免 UI 自行推断章节名称（PRD-01 §5 明确禁止）。
 */
@ccclass('CampPresenter')
export class CampPresenter extends Component {
    @property(ResourceBar)
    resourceBar: ResourceBar | null = null;

    /** 七座建筑的节点，顺序须与 BUILDING_IDS 一致。 */
    @property([Node])
    buildingNodes: Node[] = [];

    /**
     * 旧五主导航的兼容入口。1.2.1 后 Camp.scene 不再接线；
     * 暂留方法与类型，供后续页面迁移期间复用反馈/路由逻辑。
     */
    @property([Node])
    bottomNavNodes: Node[] = [];

    /** 红点节点，与 buildingNodes 一一对应。 */
    @property([Node])
    badgeNodes: Node[] = [];

    /** 建筑状态文案，与 buildingNodes 一一对应。 */
    @property([Label])
    buildingStateLabels: Label[] = [];

    /** 顶部头像与主线提示，点击行为待产品定义。 */
    @property(Node)
    avatarButton: Node | null = null;

    @property(Node)
    mainTaskButton: Node | null = null;

    @property(Label)
    mainTaskLabel: Label | null = null;

    /** 只有 PanoramaContent 移动，上下 HUD 不在此节点内。 */
    @property(Node)
    panoramaViewport: Node | null = null;

    @property(Node)
    panoramaContent: Node | null = null;

    @property(Node)
    expeditionButton: Node | null = null;

    /** 议事殿人物列表与对话灰盒。 */
    @property(Node)
    npcListPanel: Node | null = null;

    @property(Node)
    npcDialogPanel: Node | null = null;

    @property(Node)
    cenShouyiButton: Node | null = null;

    @property(Node)
    npcListBackButton: Node | null = null;

    @property(Node)
    npcDialogBackButton: Node | null = null;

    @property(Node)
    npcDialogNextButton: Node | null = null;

    @property(Label)
    npcNameLabel: Label | null = null;

    @property(Label)
    npcRoleLabel: Label | null = null;

    @property(Label)
    npcStatusLabel: Label | null = null;

    @property(Label)
    npcDialogTextLabel: Label | null = null;

    @property(Label)
    npcDialogNextLabel: Label | null = null;

    /** 1.2.6 底部左侧五入口，顺序与 CAMP_SYSTEM_ENTRY_IDS 一致。 */
    @property([Node])
    systemEntryNodes: Node[] = [];

    /** 设置页使用当前场景内的全屏页面壳，避免未完成设置功能阻塞大厅。 */
    @property(Node)
    settingsPanel: Node | null = null;

    @property(Node)
    settingsBackButton: Node | null = null;

    /** 右下角灵石余额；只允许读取 Wallet.immortalCoin。 */
    @property(Label)
    immortalCoinLabel: Label | null = null;

    private disposers: (() => void)[] = [];
    private readonly activationGate = new EntryActivationGate();
    private panoramaBounds: PanoramaBounds = { minX: 0, maxX: 0, scrollable: false };
    private gesture: DragGesture = { distanceDp: 0, isDragging: false };
    private pointerActive = false;
    private suppressBuildingClick = false;
    private panoramaVelocity = 0;
    private lastMoveAtMs = 0;
    private panoramaInitialized = false;
    private buildingStates: Readonly<Record<BuildingId, BuildingState>> = resolveBuildingStates({}, {});
    private activeNpcId: CampNpcId | null = null;
    private dialogueLines: readonly string[] = [];
    private dialogueIndex = 0;

    protected override onLoad(): void {
        const app = AppRoot.instance;

        // 钱包变化时刷新资源栏。不轮询——EventBus 推送即可
        this.disposers.push(
            app.events.on('wallet.changed', () => this.renderWallet()),
            app.events.on('camp.badgesChanged', () => this.renderBadges([])),
            app.events.on('profile.loaded', () => this.renderAll()),
            app.events.on('story.changed', () => this.renderAll()),
            app.events.on<{ pageId: string }>('router.pageChanged', ({ pageId }) => {
                if (pageId === 'camp') {
                    this.renderAll();
                }
            }),
            app.events.on('camp.panorama.reset', () => this.resetPanorama()),
            app.events.on('expedition.settlementClosed', () => {
                this.resetPanorama();
                this.renderAll();
            }),
        );

        this.renderAll();
        this.bindButtons();
        this.bindPanoramaInput();
        this.initializePanorama();
        this.warnUndersizedTouchTargets();
    }

    protected override onDestroy(): void {
        for (const dispose of this.disposers) {
            dispose();
        }
        this.disposers = [];
    }

    protected override update(deltaTime: number): void {
        const content = this.panoramaContent;
        if (!content || this.pointerActive || this.panoramaVelocity === 0) {
            return;
        }
        const step = stepPanoramaInertia(
            content.position.x,
            this.panoramaVelocity,
            deltaTime,
            this.panoramaBounds,
        );
        this.panoramaVelocity = step.velocity;
        this.setPanoramaX(step.x);
    }

    private renderAll(): void {
        this.renderWallet();
        this.renderMainTask();
        this.renderBuildingStates();
        this.renderNpcList();
    }

    private renderBuildingStates(): void {
        const app = AppRoot.instance;
        if (!app.state.isLoaded) {
            return;
        }
        const profile = app.state.require();
        this.applyBuildingStates(
            resolveBuildingStates(profile.camp.buildingLevels, profile.storyFlags),
        );
    }

    private renderNpcList(): void {
        const app = AppRoot.instance;
        if (!app.state.isLoaded) {
            return;
        }
        const npc = availableCampNpcs(app.state.require().storyFlags)[0];
        if (!npc) {
            this.cenShouyiButton && (this.cenShouyiButton.active = false);
            return;
        }
        this.cenShouyiButton && (this.cenShouyiButton.active = true);
        this.npcNameLabel && (this.npcNameLabel.string = npc.name);
        this.npcRoleLabel && (this.npcRoleLabel.string = npc.role);
        this.npcStatusLabel && (this.npcStatusLabel.string = npc.status);
    }

    private renderWallet(): void {
        const app = AppRoot.instance;
        if (!app.state.isLoaded) {
            this.resourceBar?.renderPlaceholder();
            if (this.immortalCoinLabel) {
                this.immortalCoinLabel.string = '--';
            }
            return;
        }
        const wallet = app.state.require().wallet;
        this.resourceBar?.render(wallet);
        const balances = campCurrencyBalances(wallet);
        if (this.immortalCoinLabel) {
            this.immortalCoinLabel.string = String(Math.trunc(balances.bottomSpiritStone));
        }
    }

    private renderMainTask(): void {
        if (!this.mainTaskLabel) {
            return;
        }
        const app = AppRoot.instance;
        if (!app.state.isLoaded) {
            this.mainTaskLabel.string = '主线：--';
            return;
        }
        const objective = currentMainTaskObjective(app.state.require().storyFlags);
        this.mainTaskLabel.string = objective ? `主线：${truncateLine(objective)}` : '暂无主线任务';
    }

    /** 按 domain 计算结果显示红点。超出上限的收纳进建筑内部。 */
    renderBadges(actions: readonly PendingAction[], acknowledgedBatches: readonly string[] = []): void {
        const { primaryBadges } = computeBadges(actions, acknowledgedBatches);
        const shown = new Set<BuildingId>(primaryBadges);

        this.badgeNodes.forEach((node, index) => {
            const buildingId = BUILDING_IDS[index];
            if (!node || !buildingId) {
                return;
            }
            node.active = shown.has(buildingId);
        });
    }

    /**
     * 应用建筑状态。锁定节点仍接收点击，但只返回解锁原因；
     * 真正进入功能时仍以 isBuildingUsable 判定。
     */
    applyBuildingStates(states: Readonly<Record<BuildingId, BuildingState>>): void {
        this.buildingStates = states;
        this.buildingNodes.forEach((node, index) => {
            const buildingId = BUILDING_IDS[index];
            if (!node || !buildingId) {
                return;
            }
            const button = node.getComponent(Button);
            if (button) {
                button.interactable = true;
            }
            const stateLabel = this.buildingStateLabels[index];
            if (stateLabel) {
                stateLabel.string = BUILDING_STATE_NAMES[states[buildingId]];
            }
        });
    }

    /** 旧底部导航点击。索引对应 BOTTOM_NAV_ITEMS，新大厅不再直接展示。 */
    onNavClicked(index: number): BottomNavItem | null {
        const item = BOTTOM_NAV_ITEMS[index];
        if (!item) {
            return null;
        }
        const app = AppRoot.instance;
        app.events.emit('nav.selected', { item });
        app.showFeedback(NAV_FEEDBACK[item]);
        return item;
    }

    /** 七座建筑点击。页面未接入前也必须给出反馈。 */
    onBuildingClicked(index: number): BuildingId | null {
        if (this.suppressBuildingClick) {
            return null;
        }
        const buildingId = BUILDING_IDS[index];
        if (!buildingId) {
            return null;
        }
        if (!this.activationGate.tryActivate(buildingId, Date.now())) {
            return null;
        }
        const app = AppRoot.instance;
        const state = this.buildingStates[buildingId];
        app.events.emit('building.selected', { buildingId });

        if (!isBuildingUsable(state)) {
            app.showFeedback(BUILDING_STATE_FEEDBACK[state]);
            return buildingId;
        }

        if (buildingId === 'yi_shi_dian') {
            this.openNpcList();
            return buildingId;
        }

        app.showFeedback(`${BUILDING_NAMES[buildingId]}页面尚未开放`);
        return buildingId;
    }

    onExpeditionClicked(): void {
        if (!this.activationGate.tryActivate('expedition', Date.now())) {
            return;
        }
        const app = AppRoot.instance;
        app.events.emit('expedition.requested', {});
        app.showFeedback('出征准备尚未开放');
    }

    openNpcList(): void {
        this.panoramaVelocity = 0;
        this.pointerActive = false;
        this.npcDialogPanel && (this.npcDialogPanel.active = false);
        this.npcListPanel && (this.npcListPanel.active = true);
        this.renderNpcList();
    }

    closeNpcList(): void {
        this.npcDialogPanel && (this.npcDialogPanel.active = false);
        this.npcListPanel && (this.npcListPanel.active = false);
        this.renderAll();
    }

    onCenShouyiClicked(): void {
        if (!this.activationGate.tryActivate('npc_cen_shouyi', Date.now())) {
            return;
        }
        const app = AppRoot.instance;
        if (!app.state.isLoaded) {
            return;
        }
        this.activeNpcId = 'npc_cen_shouyi';
        this.dialogueLines = dialogueForCampNpc(
            this.activeNpcId,
            app.state.require().storyFlags,
        );
        this.dialogueIndex = 0;
        this.npcListPanel && (this.npcListPanel.active = false);
        this.npcDialogPanel && (this.npcDialogPanel.active = true);
        this.renderDialogueLine();
    }

    onNpcDialogNext(): void {
        if (!this.activationGate.tryActivate('npc_dialog_next', Date.now())) {
            return;
        }
        if (this.dialogueIndex + 1 < this.dialogueLines.length) {
            this.dialogueIndex += 1;
            this.renderDialogueLine();
            return;
        }
        this.finishNpcDialogue();
    }

    backToNpcList(): void {
        this.activeNpcId = null;
        this.dialogueLines = [];
        this.dialogueIndex = 0;
        this.npcDialogPanel && (this.npcDialogPanel.active = false);
        this.npcListPanel && (this.npcListPanel.active = true);
        this.renderNpcList();
    }

    private renderDialogueLine(): void {
        this.npcDialogTextLabel &&
            (this.npcDialogTextLabel.string = this.dialogueLines[this.dialogueIndex] ?? '……');
        this.npcDialogNextLabel &&
            (this.npcDialogNextLabel.string =
                this.dialogueIndex + 1 >= this.dialogueLines.length ? '完成' : '继续');
    }

    private finishNpcDialogue(): void {
        const npcId = this.activeNpcId;
        const app = AppRoot.instance;
        if (!npcId || !app.state.isLoaded) {
            this.backToNpcList();
            return;
        }

        const profile = app.state.require();
        const wasMet = profile.storyFlags.met_cen_shou_yi === true;
        Object.assign(
            profile.storyFlags,
            completeCampNpcDialogue(npcId, profile.storyFlags),
        );
        app.events.emit('story.changed', { npcId });
        app.events.emit('camp.badgesChanged', {});

        if (!wasMet) {
            void app.saveCurrentProfile().catch((error: unknown) => {
                console.error('[CampPresenter] 保存岑守一对话进度失败', error);
                app.showFeedback('剧情进度保存失败');
            });
            app.showFeedback('营地交接已完成');
        }
        this.backToNpcList();
    }

    onAvatarClicked(): void {
        if (this.activationGate.tryActivate('avatar', Date.now())) {
            AppRoot.instance.showFeedback('功能待定');
        }
    }

    onMainTaskClicked(): void {
        if (this.activationGate.tryActivate('main_task', Date.now())) {
            AppRoot.instance.showFeedback('功能待定');
        }
    }

    onSystemEntryClicked(index: number): CampSystemEntryId | null {
        const entryId = CAMP_SYSTEM_ENTRY_IDS[index];
        if (!entryId || !this.activationGate.tryActivate(`system_${entryId}`, Date.now())) {
            return null;
        }
        if (entryId === 'settings') {
            this.openSettings();
            return entryId;
        }
        AppRoot.instance.showFeedback(CAMP_SYSTEM_ENTRY_FEEDBACK[entryId]);
        return entryId;
    }

    openSettings(): void {
        this.panoramaVelocity = 0;
        if (this.settingsPanel) {
            this.settingsPanel.active = true;
        }
    }

    closeSettings(): void {
        if (this.settingsPanel) {
            this.settingsPanel.active = false;
        }
    }

    /**
     * 场景生成器只需维护节点引用，点击在运行时统一绑定。
     * 这样新增入口不会因为漏配 Component.EventHandler 而“点了没反应”。
     */
    private bindButtons(): void {
        this.buildingNodes.forEach((node, index) => {
            const handler = (): void => {
                this.onBuildingClicked(index);
            };
            node.on(Button.EventType.CLICK, handler, this);
            this.disposers.push(() => node.off(Button.EventType.CLICK, handler, this));
        });

        this.bottomNavNodes.forEach((node, index) => {
            const handler = (): void => {
                this.onNavClicked(index);
            };
            node.on(Button.EventType.CLICK, handler, this);
            this.disposers.push(() => node.off(Button.EventType.CLICK, handler, this));
        });

        if (this.avatarButton) {
            const handler = (): void => this.onAvatarClicked();
            this.avatarButton.on(Button.EventType.CLICK, handler, this);
            this.disposers.push(() => this.avatarButton?.off(Button.EventType.CLICK, handler, this));
        }

        if (this.mainTaskButton) {
            const handler = (): void => this.onMainTaskClicked();
            this.mainTaskButton.on(Button.EventType.CLICK, handler, this);
            this.disposers.push(() => this.mainTaskButton?.off(Button.EventType.CLICK, handler, this));
        }

        this.bindButton(this.expeditionButton, () => this.onExpeditionClicked());
        this.bindButton(this.cenShouyiButton, () => this.onCenShouyiClicked());
        this.bindButton(this.npcListBackButton, () => this.closeNpcList());
        this.bindButton(this.npcDialogBackButton, () => this.backToNpcList());
        this.bindButton(this.npcDialogNextButton, () => this.onNpcDialogNext());
        this.systemEntryNodes.forEach((node, index) => {
            this.bindButton(node, () => this.onSystemEntryClicked(index));
        });
        this.bindButton(this.settingsBackButton, () => this.closeSettings());
    }

    private bindButton(node: Node | null, handler: () => void): void {
        if (!node) {
            return;
        }
        node.on(Button.EventType.CLICK, handler, this);
        this.disposers.push(() => node.off(Button.EventType.CLICK, handler, this));
    }

    private bindPanoramaInput(): void {
        const viewport = this.panoramaViewport;
        if (!viewport) {
            return;
        }
        viewport.on(Node.EventType.TOUCH_START, this.onPanoramaTouchStart, this, true);
        viewport.on(Node.EventType.TOUCH_MOVE, this.onPanoramaTouchMove, this, true);
        viewport.on(Node.EventType.TOUCH_END, this.onPanoramaTouchEnd, this, true);
        viewport.on(Node.EventType.TOUCH_CANCEL, this.onPanoramaTouchEnd, this, true);
        viewport.on(Node.EventType.SIZE_CHANGED, this.onPanoramaViewportSizeChanged, this);
        this.disposers.push(() => {
            viewport.off(Node.EventType.TOUCH_START, this.onPanoramaTouchStart, this, true);
            viewport.off(Node.EventType.TOUCH_MOVE, this.onPanoramaTouchMove, this, true);
            viewport.off(Node.EventType.TOUCH_END, this.onPanoramaTouchEnd, this, true);
            viewport.off(Node.EventType.TOUCH_CANCEL, this.onPanoramaTouchEnd, this, true);
            viewport.off(Node.EventType.SIZE_CHANGED, this.onPanoramaViewportSizeChanged, this);
        });
    }

    private initializePanorama(): void {
        const viewportSize = this.panoramaViewport?.getComponent(UITransform)?.contentSize;
        const contentSize = this.panoramaContent?.getComponent(UITransform)?.contentSize;
        if (!viewportSize || !contentSize) {
            return;
        }
        this.panoramaBounds = panoramaBounds(viewportSize.width, contentSize.width);
        const initialX = this.panoramaInitialized
            ? this.panoramaContent?.position.x ?? 0
            : PANORAMA_MEMORY.takeInitialX(this.panoramaBounds);
        this.panoramaInitialized = true;
        this.setPanoramaX(initialX);
    }

    private resetPanorama(): void {
        PANORAMA_MEMORY.reset();
        this.panoramaVelocity = 0;
        this.setPanoramaX(0);
    }

    private readonly onPanoramaViewportSizeChanged = (): void => {
        this.initializePanorama();
    };

    private readonly onPanoramaTouchStart = (): void => {
        this.pointerActive = true;
        this.gesture = { distanceDp: 0, isDragging: false };
        this.suppressBuildingClick = false;
        // 一次反向拖动必须立即停止原有惯性。
        this.panoramaVelocity = 0;
        this.lastMoveAtMs = Date.now();
    };

    private readonly onPanoramaTouchMove = (event: EventTouch): void => {
        if (!this.pointerActive || !this.panoramaBounds.scrollable) {
            return;
        }
        const deltaX = event.getUIDelta().x;
        this.gesture = advanceDragGesture(this.gesture, deltaX);
        if (this.gesture.isDragging) {
            this.suppressBuildingClick = true;
        }

        const now = Date.now();
        const elapsedSeconds = Math.max(1, now - this.lastMoveAtMs) / 1000;
        this.lastMoveAtMs = now;
        this.panoramaVelocity = clamp(deltaX / elapsedSeconds, -MAX_DRAG_SPEED, MAX_DRAG_SPEED);
        this.setPanoramaX((this.panoramaContent?.position.x ?? 0) + deltaX);
    };

    private readonly onPanoramaTouchEnd = (): void => {
        if (!this.pointerActive) {
            return;
        }
        this.pointerActive = false;
        this.rememberPanoramaPosition();

        if (!this.gesture.isDragging) {
            this.panoramaVelocity = 0;
            return;
        }

        // Button 的 CLICK 会在同一次 touch-end 后紧接着派发，
        // 因此延迟到下一帧再解除抑制。
        this.suppressBuildingClick = true;
        this.scheduleOnce(() => {
            this.suppressBuildingClick = false;
        }, 0);
    };

    private setPanoramaX(x: number): void {
        const content = this.panoramaContent;
        if (!content) {
            return;
        }
        const clampedX = clamp(x, this.panoramaBounds.minX, this.panoramaBounds.maxX);
        content.setPosition(clampedX, content.position.y, content.position.z);
        if (clampedX !== x) {
            this.panoramaVelocity = 0;
        }
    }

    private rememberPanoramaPosition(): void {
        const content = this.panoramaContent;
        if (content) {
            PANORAMA_MEMORY.remember(content.position.x, this.panoramaBounds);
        }
    }

    /**
     * 触控区域自检（PRD-09 §4：最小 48×48dp）。
     *
     * 只警告不修正：自动放大会破坏美术排版，
     * 但静默放过会让移动端玩家点不中。
     */
    private warnUndersizedTouchTargets(): void {
        const check = (node: Node | null, label: string): void => {
            const transform = node?.getComponent(UITransform);
            if (!transform) {
                return;
            }
            const { width, height } = transform.contentSize;
            if (!meetsTouchTarget(width, height)) {
                console.warn(
                    `[CampPresenter] ${label} 触控区域 ${width}×${height} ` +
                        `小于 ${MIN_TOUCH_TARGET_DP}×${MIN_TOUCH_TARGET_DP}dp（PRD-09 §4）`,
                );
            }
        };

        this.bottomNavNodes.forEach((node, index) => check(node, `旧导航按钮 ${index}`));
        this.buildingNodes.forEach((node, index) => check(node, `建筑按钮 ${index}`));
        check(this.avatarButton, '玩家头像');
        check(this.mainTaskButton, '主线提示');
        check(this.expeditionButton, '出征入口');
        check(this.cenShouyiButton, '岑守一人物项');
        check(this.npcListBackButton, '人物列表返回');
        check(this.npcDialogBackButton, '对话返回');
        check(this.npcDialogNextButton, '对话继续');
        this.systemEntryNodes.forEach((node, index) =>
            check(node, `底部系统入口 ${CAMP_SYSTEM_ENTRY_IDS[index] ?? index}`),
        );
        check(this.settingsBackButton, '设置页返回');
    }
}

const PANORAMA_MEMORY = new PanoramaPositionMemory();
const MAX_DRAG_SPEED = 4000;

function currentMainTaskObjective(storyFlags: Readonly<Record<string, boolean>>): string | null {
    if (storyFlags.main_story_complete === true) {
        return null;
    }
    if (storyFlags.met_cen_shou_yi === true) {
        return '整备营地，准备首次出征';
    }
    return '前往议事殿，与岑守一交谈';
}

function truncateLine(text: string, maxCharacters = 24): string {
    return text.length > maxCharacters ? `${text.slice(0, maxCharacters - 1)}…` : text;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

const BUILDING_NAMES: Readonly<Record<BuildingId, string>> = {
    yi_shi_dian: '议事殿',
    ling_pu: '灵圃',
    zhao_xian_tai: '招贤馆',
    bai_bao_ku: '百宝库',
    lian_qi_fang: '炼器坊',
    jiao_yi_hang: '交易行',
    huan_hun_tan: '还魂殿',
};

const BUILDING_STATE_NAMES: Readonly<Record<BuildingState, string>> = {
    LOCKED: '未解锁',
    AVAILABLE: '可解锁',
    UNLOCKED: '可进入',
    UPGRADABLE: '可升级',
    UPGRADING: '升级中',
    MAX_LEVEL: '已满级',
    DISABLED: '暂不可用',
};

const BUILDING_STATE_FEEDBACK: Readonly<Record<BuildingState, string>> = {
    LOCKED: '尚未解锁，请继续推进主线',
    AVAILABLE: '已满足解锁条件，请前往议事殿交谈',
    UNLOCKED: '可进入',
    UPGRADABLE: '可升级',
    UPGRADING: '正在升级',
    MAX_LEVEL: '已达当前最高等级',
    DISABLED: '当前暂不可用',
};

const NAV_FEEDBACK: Readonly<Record<BottomNavItem, string>> = {
    camp: '已在营地',
    heroes: '修士页面尚未开放',
    inventory: '背包页面尚未开放',
    quests: '任务页面尚未开放',
    expedition: '出征准备尚未开放',
};
