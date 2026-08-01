import {
    _decorator,
    assetManager,
    Button,
    Color,
    Component,
    EventKeyboard,
    Graphics,
    input,
    Input,
    KeyCode,
    Label,
    Node,
    Sprite,
    SpriteFrame,
    TTFFont,
    UITransform,
} from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import {
    P1_LING_PU_JOBS,
    storageCapacity,
} from 'db://assets/scripts/domain/LingPu';
import type {
    LingPuConfig,
    LingPuMutationFailure,
    P1LingPuJob,
} from 'db://assets/scripts/domain/LingPu';
import {
    createAssignment,
    grainUpkeepPerCycle,
    JOB_RATES,
    resolveShutdown,
    totalWorkers,
} from 'db://assets/scripts/domain/Production';
import {
    CAMP_LING_PU_PATHS,
    campLingPuResourceRowPath,
} from 'db://assets/scripts/domain/CampSceneContract';
import type { Profile } from 'db://assets/scripts/services/GameState';
import {
    bindCampButton,
    campNode,
    disposeCampBindings,
    fitCampPageRoot,
    warnCampTouchTarget,
} from './CampViewUtils';

const { ccclass } = _decorator;

const TEXT_SECONDARY = new Color(188, 196, 182, 255);
const TEXT_WARNING = new Color(230, 132, 82, 255);

type LingPuResourceRowId = P1LingPuJob | 'spiritCrystal' | 'gengJing';

interface LingPuResourceRowDefinition {
    readonly id: LingPuResourceRowId;
    readonly job: P1LingPuJob | null;
    readonly name: string;
}

const RESOURCE_NAMES: Readonly<Record<LingPuResourceRowId, string>> = {
    spiritGrain: '灵粮',
    spiritWood: '灵木',
    darkIron: '玄铁',
    spiritCrystal: '灵晶',
    gengJing: '庚精',
};

const RESOURCE_ICON_PATHS: Readonly<Record<LingPuResourceRowId, string>> = {
    spiritGrain: 'ui/top/icon_resource_spirit_grain/spriteFrame',
    spiritWood: 'ui/top/icon_resource_spirit_wood/spriteFrame',
    darkIron: 'ui/top/icon_resource_dark_iron/spriteFrame',
    spiritCrystal: 'ui/top/icon_resource_spirit_crystal/spriteFrame',
    gengJing: 'ui/top/icon_resource_geng_jing/spriteFrame',
};

const RESOURCE_ROW_DEFINITIONS: readonly LingPuResourceRowDefinition[] = [
    { id: 'spiritGrain', job: 'spiritGrain', name: RESOURCE_NAMES.spiritGrain },
    { id: 'spiritWood', job: 'spiritWood', name: RESOURCE_NAMES.spiritWood },
    { id: 'darkIron', job: 'darkIron', name: RESOURCE_NAMES.darkIron },
    { id: 'spiritCrystal', job: null, name: RESOURCE_NAMES.spiritCrystal },
    { id: 'gengJing', job: null, name: RESOURCE_NAMES.gengJing },
];

interface VisualBackground {
    readonly node: Node;
    readonly sprite: Sprite;
}

interface ButtonView {
    readonly node: Node;
    readonly button: Button;
    readonly visual: VisualBackground;
    readonly label: Label | null;
}

interface ResourceRowView {
    readonly root: Node;
    readonly background: VisualBackground;
    readonly warningOutline: Node;
    readonly icon: Sprite;
    readonly name: Label;
    readonly stock: Label;
    readonly rate: Label;
    readonly workers: Label;
    readonly status: Label;
    readonly minus: ButtonView;
    readonly plus: ButtonView;
    readonly upgrade: ButtonView;
}

interface ResourceRowRenderState {
    readonly stock: number;
    readonly capacity: number;
    readonly workerCount: number;
    readonly workerLimit: number;
    readonly displayedProduction: number;
    readonly isFull: boolean;
    readonly isShutdown: boolean;
    readonly hasIdleWorker: boolean;
    readonly isMaxLevel: boolean;
}

/**
 * 单条资源栏的可复用视图组件。
 *
 * 它只接收渲染状态，不读取 Profile、配置表或结算服务；灵圃 Presenter 负责把领域
 * 数据转换成状态。后续 P2 开放灵晶、庚精时只需把定义中的 job 接到领域层，不改
 * 图标、文字、按钮和五行布局结构。
 */
class LingPuResourceRowComponent {
    readonly id: LingPuResourceRowId;
    readonly job: P1LingPuJob | null;
    readonly view: ResourceRowView;

    constructor(
        definition: LingPuResourceRowDefinition,
        view: ResourceRowView,
    ) {
        this.id = definition.id;
        this.job = definition.job;
        this.view = view;
    }

    renderActive(state: ResourceRowRenderState): void {
        const row = this.view;
        row.root.active = true;
        row.stock.string = `${state.stock} / ${state.capacity}`;
        row.workers.string = `${state.workerCount}/${state.workerLimit}`;
        row.rate.string = `产量 ${signed(state.displayedProduction)}`;
        row.rate.color = (
            state.displayedProduction < 0 ? TEXT_WARNING : TEXT_SECONDARY
        ).clone();

        const states: string[] = [];
        if (state.isFull) {
            states.push('已满仓');
        }
        if (state.isShutdown) {
            states.push('灵粮不足·停工');
        }
        row.status.string = states.join(' / ');
        row.status.color =
            states.length > 0 ? TEXT_WARNING.clone() : TEXT_SECONDARY.clone();
        row.warningOutline.active = state.displayedProduction < 0;
        row.minus.button.interactable = state.workerCount > 0;
        row.plus.button.interactable = state.hasIdleWorker;
        row.upgrade.button.interactable = !state.isMaxLevel;
        if (row.upgrade.label) {
            row.upgrade.label.string = state.isMaxLevel ? '已满级' : '升级';
        }
    }

    renderLocked(): void {
        const row = this.view;
        row.root.active = false;
        row.stock.string = 'P2 开放';
        row.rate.string = '产量 +0';
        row.rate.color = TEXT_SECONDARY.clone();
        row.workers.string = '0/0';
        row.status.string = '尚未开放';
        row.status.color = TEXT_SECONDARY.clone();
        row.warningOutline.active = false;
        row.minus.button.interactable = false;
        row.plus.button.interactable = false;
        row.upgrade.button.interactable = false;
        if (row.upgrade.label) {
            row.upgrade.label.string = '未开放';
        }
    }
}

type ConfirmationMode =
    | { readonly kind: 'recruit' }
    | { readonly kind: 'upgrade'; readonly job: P1LingPuJob };

/**
 * 灵圃 P1 生产面板。布局、五条资源行和二次弹窗全部由 Prefab 提供；Presenter
 * 只把领域状态渲染到已存在的组件，并绑定交互事件。
 */
@ccclass('CampLingPuPresenter')
export class CampLingPuPresenter extends Component {
    private readonly disposers: (() => void)[] = [];
    private readonly labels: Label[] = [];
    private readonly rows = new Map<LingPuResourceRowId, LingPuResourceRowComponent>();
    private readonly resourceIconFrames = new Map<LingPuResourceRowId, SpriteFrame>();

    private mount: Node | null = null;
    private panelRoot: Node | null = null;
    private panelBackground: VisualBackground | null = null;
    private timerLabel: Label | null = null;
    private progressTrack: VisualBackground | null = null;
    private progressFill: Sprite | null = null;
    private recruitButton: ButtonView | null = null;
    private closeButton: ButtonView | null = null;

    private confirmationRoot: Node | null = null;
    private confirmationPanel: VisualBackground | null = null;
    private confirmationTitle: Label | null = null;
    private confirmationIcon: Sprite | null = null;
    private confirmationMessage: Label | null = null;
    private confirmationDetail: Label | null = null;
    private confirmationError: Label | null = null;
    private confirmationPrimary: ButtonView | null = null;
    private confirmationCancel: ButtonView | null = null;
    private confirmationMode: ConfirmationMode | null = null;
    private confirmationActionLocked = false;

    private inlineActionButtonFrame: SpriteFrame | null = null;
    private footerActionButtonFrame: SpriteFrame | null = null;
    private plusFrame: SpriteFrame | null = null;
    private minusFrame: SpriteFrame | null = null;
    private operationQueue: Promise<void> = Promise.resolve();
    private destroyed = false;

    protected override onLoad(): void {
        fitCampPageRoot(this, this.disposers);
        this.mount = campNode(this.node, CAMP_LING_PU_PATHS.mount);
        if (!this.mount) {
            return;
        }

        if (!this.bindView()) {
            return;
        }
        this.syncMountSize();
        this.node.on(Node.EventType.SIZE_CHANGED, this.syncMountSize, this);
        this.disposers.push(() =>
            this.node.off(Node.EventType.SIZE_CHANGED, this.syncMountSize, this),
        );

        const app = AppRoot.instance;
        this.disposers.push(
            app.events.on('camp.lingPuRequested', () => this.open()),
            app.events.on('camp.productionChanged', () => this.render()),
            app.events.on('profile.loaded', () => this.render()),
            app.events.on<{ pageId: string }>('router.pageChanged', ({ pageId }) => {
                if (pageId !== 'camp' && this.panelRoot?.active) {
                    this.close();
                }
            }),
        );
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        this.disposers.push(() =>
            input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this),
        );

        void this.loadVisualAssets();
    }

    protected override onDestroy(): void {
        this.destroyed = true;
        disposeCampBindings(this.disposers);
    }

    protected override update(_deltaTime: number): void {
        if (this.panelRoot?.active) {
            this.renderTimer();
        }
    }

    private readonly syncMountSize = (): void => {
        if (!this.mount) {
            return;
        }
        const size = this.node.getComponent(UITransform)?.contentSize;
        if (!size) {
            return;
        }
        this.mount.getComponent(UITransform)?.setContentSize(size);
        const panelSize = this.panelRoot?.getComponent(UITransform);
        panelSize?.setContentSize(size);
        const confirmationSize = this.confirmationRoot?.getComponent(UITransform);
        confirmationSize?.setContentSize(size);
        redrawSolid(this.panelRoot?.getChildByName('Backdrop') ?? null, size.width, size.height);
        redrawSolid(
            this.confirmationRoot?.getChildByName('ConfirmBackdrop') ?? null,
            size.width,
            size.height,
        );
    };

    private bindView(): boolean {
        const panelRoot = campNode(this.node, CAMP_LING_PU_PATHS.panel);
        const mainPanel = campNode(this.node, CAMP_LING_PU_PATHS.mainPanel);
        const panelBackground = this.bindBackground(CAMP_LING_PU_PATHS.panelFrame);
        const title = this.bindLabel(CAMP_LING_PU_PATHS.title);
        const timerLabel = this.bindLabel(CAMP_LING_PU_PATHS.timerLabel);
        const progressTrack = this.bindBackground(CAMP_LING_PU_PATHS.progressTrack);
        const progressFill = this.bindSprite(CAMP_LING_PU_PATHS.progressFill);
        const recruitButton = this.bindButton(
            CAMP_LING_PU_PATHS.recruitButton,
            CAMP_LING_PU_PATHS.recruitVisual,
            CAMP_LING_PU_PATHS.recruitLabel,
        );
        const closeButton = this.bindButton(
            CAMP_LING_PU_PATHS.closeButton,
            CAMP_LING_PU_PATHS.closeVisual,
            CAMP_LING_PU_PATHS.closeLabel,
        );
        const confirmationRoot = campNode(this.node, CAMP_LING_PU_PATHS.confirmation);
        const confirmationPanel = this.bindBackground(CAMP_LING_PU_PATHS.confirmationFrame);
        const confirmationTitle = this.bindLabel(CAMP_LING_PU_PATHS.confirmationTitle);
        const confirmationIcon = this.bindSprite(CAMP_LING_PU_PATHS.confirmationIcon);
        const confirmationMessage = this.bindLabel(CAMP_LING_PU_PATHS.confirmationMessage);
        const confirmationDetail = this.bindLabel(CAMP_LING_PU_PATHS.confirmationDetail);
        const confirmationError = this.bindLabel(CAMP_LING_PU_PATHS.confirmationError);
        const confirmationPrimary = this.bindButton(
            CAMP_LING_PU_PATHS.confirmationPrimary,
            CAMP_LING_PU_PATHS.confirmationPrimaryVisual,
            CAMP_LING_PU_PATHS.confirmationPrimaryLabel,
        );
        const confirmationCancel = this.bindButton(
            CAMP_LING_PU_PATHS.confirmationCancel,
            CAMP_LING_PU_PATHS.confirmationCancelVisual,
            CAMP_LING_PU_PATHS.confirmationCancelLabel,
        );

        if (
            !panelRoot ||
            !mainPanel ||
            !panelBackground ||
            !title ||
            !timerLabel ||
            !progressTrack ||
            !progressFill ||
            !recruitButton ||
            !closeButton ||
            !confirmationRoot ||
            !confirmationPanel ||
            !confirmationTitle ||
            !confirmationIcon ||
            !confirmationMessage ||
            !confirmationDetail ||
            !confirmationError ||
            !confirmationPrimary ||
            !confirmationCancel ||
            !this.configureSolid(CAMP_LING_PU_PATHS.backdrop, new Color(0, 0, 0, 164)) ||
            !this.configureSolid(
                CAMP_LING_PU_PATHS.confirmationBackdrop,
                new Color(0, 0, 0, 126),
            )
        ) {
            console.error('[灵圃] Prefab 节点或组件不完整，面板绑定失败');
            return false;
        }

        this.panelRoot = panelRoot;
        this.panelBackground = panelBackground;
        this.timerLabel = timerLabel;
        this.progressTrack = progressTrack;
        this.progressFill = progressFill;
        this.recruitButton = recruitButton;
        this.closeButton = closeButton;
        this.confirmationRoot = confirmationRoot;
        this.confirmationPanel = confirmationPanel;
        this.confirmationTitle = confirmationTitle;
        this.confirmationIcon = confirmationIcon;
        this.confirmationMessage = confirmationMessage;
        this.confirmationDetail = confirmationDetail;
        this.confirmationError = confirmationError;
        this.confirmationPrimary = confirmationPrimary;
        this.confirmationCancel = confirmationCancel;

        this.rows.clear();
        for (const definition of RESOURCE_ROW_DEFINITIONS) {
            const row = this.bindResourceRow(definition);
            if (!row) {
                console.error(`[灵圃] ${definition.name}资源栏绑定失败`);
                return false;
            }
            this.rows.set(definition.id, row);
            if (!definition.job) {
                row.renderLocked();
            }
        }

        bindCampButton(
            this,
            recruitButton.node,
            () => this.openRecruitConfirmation(),
            this.disposers,
        );
        bindCampButton(this, closeButton.node, () => this.close(), this.disposers);
        bindCampButton(
            this,
            confirmationPrimary.node,
            () => this.confirmConfirmation(),
            this.disposers,
        );
        bindCampButton(
            this,
            confirmationCancel.node,
            () => this.cancelConfirmation(),
            this.disposers,
        );
        warnCampTouchTarget(recruitButton.node, '灵圃杂役招募');
        warnCampTouchTarget(closeButton.node, '灵圃关闭');
        warnCampTouchTarget(confirmationPrimary.node, '灵圃二次确认');
        warnCampTouchTarget(confirmationCancel.node, '灵圃二次确认取消');

        panelRoot.active = false;
        confirmationRoot.active = false;
        return true;
    }

    private bindResourceRow(
        definition: LingPuResourceRowDefinition,
    ): LingPuResourceRowComponent | null {
        const path = (child?: Parameters<typeof campLingPuResourceRowPath>[1]): string =>
            campLingPuResourceRowPath(definition.id, child);
        const root = campNode(this.node, path());
        const background = this.bindBackground(path('background'));
        const warningOutline = campNode(this.node, path('warningOutline'));
        const icon = this.bindSprite(path('icon'));
        const name = this.bindLabel(path('name'));
        const stock = this.bindLabel(path('stock'));
        const rate = this.bindLabel(path('rate'));
        const workers = this.bindLabel(path('workers'));
        const status = this.bindLabel(path('status'));
        const minus = this.bindButton(path('minus'), path('minusVisual'));
        const plus = this.bindButton(path('plus'), path('plusVisual'));
        const upgrade = this.bindButton(
            path('upgrade'),
            path('upgradeVisual'),
            path('upgradeLabel'),
        );
        if (
            !root ||
            !background ||
            !warningOutline ||
            !this.configureOutline(warningOutline) ||
            !icon ||
            !name ||
            !stock ||
            !rate ||
            !workers ||
            !status ||
            !minus ||
            !plus ||
            !upgrade
        ) {
            return null;
        }

        if (definition.job) {
            const job = definition.job;
            bindCampButton(
                this,
                minus.node,
                () => this.enqueueReassignment(job, -1),
                this.disposers,
            );
            bindCampButton(
                this,
                plus.node,
                () => this.enqueueReassignment(job, 1),
                this.disposers,
            );
            bindCampButton(
                this,
                upgrade.node,
                () => this.openUpgradeConfirmation(job),
                this.disposers,
            );
        }
        warnCampTouchTarget(minus.node, `${definition.name}岗位减少`);
        warnCampTouchTarget(plus.node, `${definition.name}岗位增加`);
        warnCampTouchTarget(upgrade.node, `${definition.name}储量升级`);

        return new LingPuResourceRowComponent(definition, {
            root,
            background,
            warningOutline,
            icon,
            name,
            stock,
            rate,
            workers,
            status,
            minus,
            plus,
            upgrade,
        });
    }

    private bindLabel(path: string): Label | null {
        const node = campNode(this.node, path);
        const label = node?.getComponent(Label) ?? null;
        if (!label) {
            console.error(`[灵圃] ${path} 缺少 Label`);
            return null;
        }
        this.labels.push(label);
        return label;
    }

    private bindSprite(path: string): Sprite | null {
        const node = campNode(this.node, path);
        const sprite = node?.getComponent(Sprite) ?? null;
        if (!sprite) {
            console.error(`[灵圃] ${path} 缺少 Sprite`);
        }
        return sprite;
    }

    private bindBackground(path: string): VisualBackground | null {
        const node = campNode(this.node, path);
        const sprite = node?.getComponent(Sprite) ?? null;
        if (!node || !sprite) {
            console.error(`[灵圃] ${path} 缺少 Sprite 背景`);
            return null;
        }
        return { node, sprite };
    }

    private bindButton(
        nodePath: string,
        visualPath: string,
        labelPath?: string,
    ): ButtonView | null {
        const node = campNode(this.node, nodePath);
        const button = node?.getComponent(Button) ?? null;
        const visual = this.bindBackground(visualPath);
        const label = labelPath ? this.bindLabel(labelPath) : null;
        if (!node || !button || !visual || (labelPath && !label)) {
            console.error(`[灵圃] ${nodePath} 按钮结构不完整`);
            return null;
        }
        configureButton(button, visual.node);
        return { node, button, visual, label };
    }

    private configureSolid(path: string, color: Color): Node | null {
        const node = campNode(this.node, path);
        const graphics = node?.getComponent(Graphics) ?? null;
        if (!node || !graphics) {
            console.error(`[灵圃] ${path} 缺少 Graphics`);
            return null;
        }
        graphics.fillColor = color;
        const size = node.getComponent(UITransform)?.contentSize;
        if (size) {
            redrawSolid(node, size.width, size.height);
        }
        return node;
    }

    private configureOutline(node: Node): boolean {
        const graphics = node.getComponent(Graphics);
        const size = node.getComponent(UITransform)?.contentSize;
        if (!graphics || !size) {
            console.error(`[灵圃] ${node.name} 缺少 Graphics 或 UITransform`);
            return false;
        }
        graphics.clear();
        graphics.strokeColor = TEXT_WARNING.clone();
        graphics.lineWidth = 6;
        graphics.rect(
            -size.width / 2 + 3,
            -size.height / 2 + 3,
            size.width - 6,
            size.height - 6,
        );
        graphics.stroke();
        node.active = false;
        return true;
    }

    private open(): void {
        const app = AppRoot.instance;
        if (!app.state.isLoaded || !app.getLingPuConfig() || !this.panelRoot) {
            app.showFeedback('灵圃数据尚未加载');
            return;
        }
        this.cancelConfirmation();
        this.panelRoot.active = true;
        this.render();
        this.enqueueOperation(async () => this.settleAndSave());
    }

    private close(): void {
        if (!this.panelRoot?.active) {
            return;
        }
        if (this.confirmationRoot?.active) {
            this.cancelConfirmation();
            return;
        }
        this.panelRoot.active = false;
        this.enqueueOperation(async () => this.settleAndSave());
    }

    private openRecruitConfirmation(): void {
        if (!this.confirmationRoot) {
            return;
        }
        this.confirmationMode = { kind: 'recruit' };
        this.confirmationActionLocked = false;
        this.confirmationRoot.active = true;
        this.renderConfirmation();
    }

    private openUpgradeConfirmation(job: P1LingPuJob): void {
        const app = AppRoot.instance;
        const config = app.getLingPuConfig();
        if (!config || !app.state.isLoaded || !this.confirmationRoot) {
            return;
        }
        if (app.lingPu.previewUpgrade(app.state.require(), config, job).isMaxLevel) {
            app.showFeedback(`${RESOURCE_NAMES[job]}储量已满级`);
            return;
        }
        this.confirmationMode = { kind: 'upgrade', job };
        this.confirmationActionLocked = false;
        this.confirmationRoot.active = true;
        this.renderConfirmation();
    }

    private cancelConfirmation(): void {
        this.confirmationMode = null;
        this.confirmationActionLocked = false;
        if (this.confirmationRoot) {
            this.confirmationRoot.active = false;
        }
    }

    private confirmConfirmation(): void {
        if (!this.confirmationMode || this.confirmationActionLocked) {
            return;
        }
        this.confirmationActionLocked = true;
        if (this.confirmationPrimary) {
            this.confirmationPrimary.button.interactable = false;
        }
        const mode = this.confirmationMode;
        this.enqueueOperation(async () => {
            if (mode.kind === 'recruit') {
                await this.recruit();
            } else {
                await this.upgradeStorage(mode.job);
            }
        });
    }

    private enqueueReassignment(job: P1LingPuJob, delta: -1 | 1): void {
        this.enqueueOperation(async () => {
            const context = this.context();
            if (!context) {
                return;
            }
            const result = context.app.lingPu.reassign(
                context.profile,
                context.config,
                job,
                delta,
            );
            this.handleClockRollback(result.clockRolledBack);
            context.app.notifyLingPuChanged();
            this.render();
            if (!result.ok) {
                context.app.showFeedback(failureMessage(result.failure));
            }
            await this.saveWithFeedback();
        });
    }

    private async recruit(): Promise<void> {
        const context = this.context();
        if (!context) {
            this.unlockConfirmation();
            return;
        }
        const result = context.app.lingPu.recruit(context.profile, context.config);
        this.handleClockRollback(result.clockRolledBack);
        context.app.notifyLingPuChanged();
        if (result.ok) {
            this.cancelConfirmation();
        } else {
            context.app.showFeedback(failureMessage(result.failure));
            this.unlockConfirmation();
        }
        this.render();
        await this.saveWithFeedback();
    }

    private async upgradeStorage(job: P1LingPuJob): Promise<void> {
        const context = this.context();
        if (!context) {
            this.unlockConfirmation();
            return;
        }
        const result = context.app.lingPu.upgradeStorage(
            context.profile,
            context.config,
            job,
        );
        this.handleClockRollback(result.clockRolledBack);
        context.app.notifyLingPuChanged();
        if (result.ok) {
            this.cancelConfirmation();
        } else {
            context.app.showFeedback(failureMessage(result.failure));
            this.unlockConfirmation();
        }
        this.render();
        await this.saveWithFeedback();
    }

    private async settleAndSave(): Promise<void> {
        const context = this.context();
        if (!context) {
            return;
        }
        const result = context.app.lingPu.settleOnline(context.profile, context.config);
        this.handleClockRollback(result.clockRolledBack);
        context.app.notifyLingPuChanged();
        this.render();
        await this.saveWithFeedback();
    }

    private context(): {
        readonly app: AppRoot;
        readonly profile: Profile;
        readonly config: LingPuConfig;
    } | null {
        const app = AppRoot.instance;
        const config = app.getLingPuConfig();
        if (!app.state.isLoaded || !config) {
            app.showFeedback('灵圃数据尚未加载');
            return null;
        }
        return { app, profile: app.state.require(), config };
    }

    private enqueueOperation(operation: () => Promise<void>): void {
        this.operationQueue = this.operationQueue
            .then(operation)
            .catch((error) => {
                console.error('[灵圃] 操作失败', error);
                AppRoot.instance.showFeedback('灵圃操作失败，请稍后重试');
                this.unlockConfirmation();
            });
    }

    private async saveWithFeedback(): Promise<void> {
        try {
            await AppRoot.instance.saveCurrentProfile();
        } catch (error) {
            console.error('[灵圃] 保存失败', error);
            AppRoot.instance.showFeedback('存档失败，请稍后重试');
        }
    }

    private handleClockRollback(clockRolledBack: boolean): void {
        if (clockRolledBack) {
            AppRoot.instance.showFeedback('系统时间异常，生产已暂停');
        }
    }

    private unlockConfirmation(): void {
        this.confirmationActionLocked = false;
        this.renderConfirmation();
    }

    private render(): void {
        const context = this.contextSilently();
        if (!context) {
            return;
        }
        const { app, profile, config } = context;
        const assignment = createAssignment(profile.camp.workerAssignments);
        const assigned = totalWorkers(assignment);
        const idle = Math.max(0, profile.camp.workerCount - assigned);

        const grainProduced =
            assignment.spiritGrain * JOB_RATES.spiritGrain.outputPerWorker;
        const upkeep = grainUpkeepPerCycle(assignment);
        const netGrain = grainProduced - upkeep;

        const shutdownJobs = resolveShutdown(
            assignment,
            profile.wallet.spiritGrain + grainProduced,
        ).filter((job): job is P1LingPuJob => P1_LING_PU_JOBS.includes(job as P1LingPuJob));

        for (const job of P1_LING_PU_JOBS) {
            const rowComponent = this.rows.get(job);
            if (!rowComponent) {
                continue;
            }
            const stock = profile.wallet[job];
            const capacity = storageCapacity(
                profile.camp.resourceStorageLevels,
                job,
                config,
            );
            const upgrade = app.lingPu.previewUpgrade(profile, config, job);
            rowComponent.renderActive({
                stock,
                capacity,
                workerCount: assignment[job],
                workerLimit: assignment[job] + idle,
                displayedProduction:
                    job === 'spiritGrain'
                        ? netGrain
                        : assignment[job] * JOB_RATES[job].outputPerWorker,
                isFull: stock >= capacity,
                isShutdown: shutdownJobs.includes(job),
                hasIdleWorker: idle > 0,
                isMaxLevel: upgrade.isMaxLevel,
            });
        }
        for (const definition of RESOURCE_ROW_DEFINITIONS) {
            if (!definition.job) {
                this.rows.get(definition.id)?.renderLocked();
            }
        }
        this.renderTimer();
        this.renderConfirmation();
    }

    private renderTimer(): void {
        const context = this.contextSilently();
        if (!context) {
            return;
        }
        const seconds = context.app.lingPu.secondsUntilNextCycle(context.profile);
        if (this.timerLabel) {
            this.timerLabel.string = `距下次结算 ${formatSeconds(seconds)}`;
        }
        if (this.progressFill) {
            this.progressFill.fillRange = context.app.lingPu.cycleProgress(context.profile);
        }
    }

    private renderConfirmation(): void {
        if (!this.confirmationRoot?.active || !this.confirmationMode) {
            return;
        }
        const context = this.contextSilently();
        if (!context) {
            return;
        }
        const { app, profile, config } = context;
        const primary = this.confirmationPrimary;
        if (this.confirmationMode.kind === 'recruit') {
            const cost = config.recruitSpiritGrainCost;
            const affordable = profile.wallet.spiritGrain >= cost;
            setText(this.confirmationTitle, '招募杂役');
            setText(
                this.confirmationMessage,
                `消耗灵粮 ${cost}（当前 ${profile.wallet.spiritGrain}）`,
            );
            setText(this.confirmationDetail, `招募 ${config.workersPerRecruit} 名杂役`);
            setText(this.confirmationError, affordable ? '' : '灵粮不足，无法招募');
            this.confirmationIcon &&
                (this.confirmationIcon.spriteFrame =
                    this.resourceIconFrames.get('spiritGrain') ?? null);
            if (primary) {
                primary.button.interactable = affordable && !this.confirmationActionLocked;
                primary.label && (primary.label.string = '招募');
            }
            return;
        }

        const job = this.confirmationMode.job;
        const preview = app.lingPu.previewUpgrade(profile, config, job);
        const cost = preview.spiritWoodCost ?? 0;
        setText(this.confirmationTitle, `${RESOURCE_NAMES[job]}储量升级`);
        setText(
            this.confirmationMessage,
            `消耗灵木 ${cost}（当前 ${profile.wallet.spiritWood}）`,
        );
        setText(
            this.confirmationDetail,
            preview.nextCapacity === null
                ? `当前最大储量 ${preview.currentCapacity}，已达最高等级`
                : `最大储量 ${preview.currentCapacity} → ${preview.nextCapacity}`,
        );
        setText(
            this.confirmationError,
            preview.isMaxLevel
                ? '已达当前版本最高等级'
                : preview.canAfford
                  ? ''
                  : '灵木不足，无法升级',
        );
        this.confirmationIcon &&
            (this.confirmationIcon.spriteFrame =
                this.resourceIconFrames.get('spiritWood') ?? null);
        if (primary) {
            primary.button.interactable =
                preview.canAfford && !preview.isMaxLevel && !this.confirmationActionLocked;
            primary.label && (primary.label.string = '升级');
        }
    }

    private contextSilently(): {
        readonly app: AppRoot;
        readonly profile: Profile;
        readonly config: LingPuConfig;
    } | null {
        const app = AppRoot.instance;
        const config = app.getLingPuConfig();
        return app.state.isLoaded && config
            ? { app, profile: app.state.require(), config }
            : null;
    }

    private readonly onKeyDown = (event: EventKeyboard): void => {
        if (
            !this.panelRoot?.active ||
            (event.keyCode !== KeyCode.ESCAPE && event.keyCode !== KeyCode.BACKSPACE)
        ) {
            return;
        }
        if (this.confirmationRoot?.active) {
            this.cancelConfirmation();
        } else {
            this.close();
        }
    };

    private async loadVisualAssets(): Promise<void> {
        try {
            const [
                panel,
                row,
                inlineAction,
                footerAction,
                plus,
                minus,
                track,
                fill,
                grain,
                wood,
                iron,
                crystal,
                gengJing,
                font,
            ] =
                await Promise.all([
                    loadSpriteFrame('camp', 'ui/ling_pu/ui_ling_pu_panel_frame/spriteFrame'),
                    loadSpriteFrame('camp', 'ui/ling_pu/ui_ling_pu_resource_row/spriteFrame'),
                    loadSpriteFrame(
                        'camp',
                        'ui/common/ui_common_button_inline_normal/spriteFrame',
                    ),
                    loadSpriteFrame(
                        'camp',
                        'ui/common/ui_common_button_footer_normal/spriteFrame',
                    ),
                    loadSpriteFrame('camp', 'ui/ling_pu/icon_action_plus/spriteFrame'),
                    loadSpriteFrame('camp', 'ui/ling_pu/icon_action_minus/spriteFrame'),
                    loadSpriteFrame(
                        'camp',
                        'ui/ling_pu/ui_production_progress_track/spriteFrame',
                    ),
                    loadSpriteFrame(
                        'camp',
                        'ui/ling_pu/ui_production_progress_fill/spriteFrame',
                    ),
                    loadSpriteFrame('camp', RESOURCE_ICON_PATHS.spiritGrain),
                    loadSpriteFrame('camp', RESOURCE_ICON_PATHS.spiritWood),
                    loadSpriteFrame('camp', RESOURCE_ICON_PATHS.darkIron),
                    loadSpriteFrame('camp', RESOURCE_ICON_PATHS.spiritCrystal),
                    loadSpriteFrame('camp', RESOURCE_ICON_PATHS.gengJing),
                    loadFont(),
                ]);
            if (this.destroyed) {
                return;
            }
            this.inlineActionButtonFrame = inlineAction;
            this.footerActionButtonFrame = footerAction;
            this.plusFrame = plus;
            this.minusFrame = minus;
            this.resourceIconFrames.set('spiritGrain', grain);
            this.resourceIconFrames.set('spiritWood', wood);
            this.resourceIconFrames.set('darkIron', iron);
            this.resourceIconFrames.set('spiritCrystal', crystal);
            this.resourceIconFrames.set('gengJing', gengJing);

            this.panelBackground && applySlicedFrame(this.panelBackground, panel, 30);
            this.confirmationPanel && applySlicedFrame(this.confirmationPanel, panel, 30);
            for (const [resourceId, rowComponent] of this.rows) {
                const rowView = rowComponent.view;
                applySlicedFrame(rowView.background, row, 18);
                rowView.icon.spriteFrame = this.resourceIconFrames.get(resourceId) ?? null;
                this.applyButtonFrames(rowView);
            }
            if (this.progressTrack) {
                applySimpleFrame(this.progressTrack, track);
            }
            if (this.progressFill) {
                this.progressFill.spriteFrame = fill;
                this.progressFill.type = Sprite.Type.FILLED;
                this.progressFill.fillType = Sprite.FillType.HORIZONTAL;
                this.progressFill.fillStart = 0;
            }
            this.applyAllActionButtonFrames();
            if (font) {
                for (const label of this.labels) {
                    label.font = font;
                }
            }
            this.render();
        } catch (error) {
            console.error('[灵圃] 美术素材加载失败', error);
            AppRoot.instance.showFeedback('灵圃素材加载失败');
        }
    }

    private applyButtonFrames(row: ResourceRowView): void {
        if (this.inlineActionButtonFrame) {
            applySlicedFrame(row.upgrade.visual, this.inlineActionButtonFrame, 24, 18);
        }
        if (this.minusFrame) {
            applySimpleFrame(row.minus.visual, this.minusFrame);
        }
        if (this.plusFrame) {
            applySimpleFrame(row.plus.visual, this.plusFrame);
        }
    }

    private applyAllActionButtonFrames(): void {
        if (!this.footerActionButtonFrame) {
            return;
        }
        for (const view of [
            this.recruitButton,
            this.closeButton,
            this.confirmationPrimary,
            this.confirmationCancel,
        ]) {
            if (view) {
                applySlicedFrame(view.visual, this.footerActionButtonFrame, 96, 32);
            }
        }
    }
}

function redrawSolid(node: Node | null, width: number, height: number): void {
    if (!node) {
        return;
    }
    node.getComponent(UITransform)?.setContentSize(width, height);
    const graphics = node.getComponent(Graphics);
    if (!graphics) {
        return;
    }
    graphics.clear();
    graphics.rect(-width / 2, -height / 2, width, height);
    graphics.fill();
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

function applySimpleFrame(target: VisualBackground, frame: SpriteFrame): void {
    target.sprite.spriteFrame = frame;
    target.sprite.type = Sprite.Type.SIMPLE;
    target.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
}

function applySlicedFrame(
    target: VisualBackground,
    frame: SpriteFrame,
    horizontalInset: number,
    verticalInset: number = horizontalInset,
): void {
    frame.insetLeft = horizontalInset;
    frame.insetRight = horizontalInset;
    frame.insetTop = verticalInset;
    frame.insetBottom = verticalInset;
    target.sprite.spriteFrame = frame;
    target.sprite.type = Sprite.Type.SLICED;
    target.sprite.sizeMode = Sprite.SizeMode.CUSTOM;
}

function loadSpriteFrame(bundleName: string, path: string): Promise<SpriteFrame> {
    const bundle = assetManager.getBundle(bundleName);
    if (!bundle) {
        return Promise.reject(new Error(`${bundleName} Bundle 尚未加载`));
    }
    return new Promise((resolve, reject) => {
        bundle.load(path, SpriteFrame, (error, asset) => {
            if (error || !asset) {
                reject(error ?? new Error(`找不到 SpriteFrame ${path}`));
                return;
            }
            resolve(asset);
        });
    });
}

function loadFont(): Promise<TTFFont | null> {
    const bundle = assetManager.getBundle('main');
    if (!bundle) {
        return Promise.resolve(null);
    }
    return new Promise((resolve) => {
        bundle.load(
            'fonts/ark-pixel-12px-proportional-zh_cn',
            TTFFont,
            (error, asset) => resolve(error ? null : (asset ?? null)),
        );
    });
}

function setText(label: Label | null, value: string): void {
    if (label) {
        label.string = value;
    }
}

function signed(value: number): string {
    return value >= 0 ? `+${value}` : String(value);
}

function formatSeconds(value: number): string {
    return `00:${String(Math.max(0, Math.ceil(value))).padStart(2, '0')}`;
}

function failureMessage(failure?: LingPuMutationFailure): string {
    switch (failure) {
        case 'no_idle_worker':
            return '没有空闲杂役';
        case 'job_empty':
            return '该岗位当前没有杂役';
        case 'insufficient_spirit_grain':
            return '灵粮不足，无法招募';
        case 'insufficient_spirit_wood':
            return '灵木不足，无法升级';
        case 'max_storage_level':
            return '该资源储量已满级';
        default:
            return '操作未生效';
    }
}
