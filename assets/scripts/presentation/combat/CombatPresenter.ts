import {
    _decorator,
    Button,
    Component,
    Node,
    UITransform,
} from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import type { CombatOutcome } from 'db://assets/scripts/domain/CombatState';
import { SIMULATION_TICK_SECONDS } from 'db://assets/scripts/domain/CombatTypes';
import { createViewportSafeAreaRoot } from 'db://assets/scripts/presentation/core/ViewportAdapter';
import { CombatApplicationService } from 'db://assets/scripts/services/combat/CombatApplicationService';
import type {
    CombatContext,
    CombatFrameResult,
    CombatSettlementResult,
} from 'db://assets/scripts/services/combat/CombatApplicationModels';
import { loadD0CombatCatalog } from './CombatCatalogLoader';
import { CombatEventPlayer } from './CombatEventPlayer';
import { CombatOutcomeFlow } from './CombatOutcomeFlow';
import {
    applyCombatPortraits,
    createCombatUnitViews,
    renderCombat,
} from './CombatRenderer';
import {
    buildCombatScene,
    COMBAT_LOGICAL_HEIGHT,
    COMBAT_LOGICAL_WIDTH,
} from './CombatSceneView';
import type { CombatSceneNodes } from './CombatSceneView';
import { setCombatButtonEnabled } from './CombatUiPrimitives';
import type { CombatUnitView } from './CombatUnitView';
import { loadCombatPortraits } from './CombatVisualAssets';

const { ccclass } = _decorator;

/** D0 战斗页协调器；表现层只提交指令并消费 CombatEvent。 */
@ccclass('CombatPresenter')
export class CombatPresenter extends Component {
    private nodes: CombatSceneNodes | null = null;
    private service: CombatApplicationService | null = null;
    private views: ReadonlyMap<number, CombatUnitView> = new Map();
    private eventPlayer: CombatEventPlayer | null = null;
    private outcomeFlow: CombatOutcomeFlow | null = null;
    private readonly skillHandlers: Array<() => void> = [];
    private readonly unitHandlers = new Map<number, () => void>();
    private readonly disposers: Array<() => void> = [];
    private ready = false;
    private paused = false;
    private settling = false;
    private routing = false;
    private loadFailed = false;
    private outcome: CombatOutcome | null = null;
    private pendingNavigation: CombatSettlementResult | null = null;

    protected override onLoad(): void {
        const safeAreaRoot = createViewportSafeAreaRoot(this.node, 'CombatSafeAreaRoot');
        this.nodes = buildCombatScene(safeAreaRoot);
        this.fitDesignRoot();
        this.bindStaticButtons();
        safeAreaRoot.on(Node.EventType.SIZE_CHANGED, this.fitDesignRoot, this);
        const events = AppRoot.instance.events;
        this.disposers.push(events.on('app.hide', this.pauseCombat));
        this.disposers.push(events.on('app.show', this.resumeCombat));
        void this.initialize();
    }

    protected override onDestroy(): void {
        this.unschedule(this.tickCombat);
        try {
            this.nodes?.designRoot.parent?.off(Node.EventType.SIZE_CHANGED, this.fitDesignRoot, this);
            this.unbindButtons();
            this.outcomeFlow?.dispose();
        } catch {
            // 场景销毁时，运行时节点可能已先释放。
        }
        this.disposers.splice(0).forEach((dispose) => dispose());
    }

    private async initialize(): Promise<void> {
        try {
            const context = readCombatContext();
            const [catalog, portraits] = await Promise.all([
                loadD0CombatCatalog(),
                loadCombatPortraits(),
            ]);
            const app = AppRoot.instance;
            this.service = new CombatApplicationService({
                state: app.state,
                events: app.events,
                save: () => app.saveCurrentProfile(),
                nowUtcSeconds: () => app.time.nowUtcSeconds(),
                readExpeditionConfig: () => app.getExpeditionPreparationConfig(),
            });
            const frame = this.service.start(context, catalog);
            if (!this.nodes) return;
            this.views = createCombatUnitViews(this.nodes, frame.view);
            this.eventPlayer = new CombatEventPlayer(this.nodes, this.views);
            this.outcomeFlow = new CombatOutcomeFlow({
                service: this.service,
                nodes: this.nodes,
                feedback: (message) => app.showFeedback(message, 3),
                navigate: (result) => this.navigate(result),
            });
            this.bindUnitButtons(frame.view);
            applyCombatPortraits(frame.view, this.views, portraits);
            this.nodes.loadingRoot.active = false;
            this.ready = true;
            this.consumeFrame(frame);
            this.schedule(this.tickCombat, SIMULATION_TICK_SECONDS);
        } catch (error) {
            console.error('[战斗] 初始化失败', error);
            this.showLoadFailure(error);
        }
    }

    private bindStaticButtons(): void {
        const nodes = this.nodes;
        if (!nodes) return;
        nodes.escapeButton.on(Button.EventType.CLICK, this.escapeCombat, this);
        nodes.resultButton.on(Button.EventType.CLICK, this.confirmResult, this);
        nodes.skillButtons.forEach((button, index) => {
            const handler = (): void => this.chooseSkill(index);
            this.skillHandlers.push(handler);
            button.on(Button.EventType.CLICK, handler, this);
        });
    }

    private bindUnitButtons(frame: CombatFrameResult['view']): void {
        frame.snapshot.units.filter((unit) => unit.side === 'ally').forEach((unit) => {
            const view = this.views.get(unit.unitId);
            if (!view) return;
            const handler = (): void => this.toggleAuto(unit.unitId);
            this.unitHandlers.set(unit.unitId, handler);
            view.nameButton.on(Button.EventType.CLICK, handler, this);
        });
    }

    private unbindButtons(): void {
        const nodes = this.nodes;
        if (!nodes) return;
        nodes.escapeButton.off(Button.EventType.CLICK, this.escapeCombat, this);
        nodes.resultButton.off(Button.EventType.CLICK, this.confirmResult, this);
        nodes.skillButtons.forEach((button, index) => {
            const handler = this.skillHandlers[index];
            if (handler) button.off(Button.EventType.CLICK, handler, this);
        });
        this.unitHandlers.forEach((handler, unitId) => {
            this.views.get(unitId)?.nameButton.off(Button.EventType.CLICK, handler, this);
        });
    }

    private readonly tickCombat = (): void => {
        if (!this.ready || this.paused || this.settling || this.outcome || !this.service) return;
        this.consumeFrame(this.service.advance());
    };

    private consumeFrame(frame: CombatFrameResult): void {
        if (!this.nodes) return;
        renderCombat(this.nodes, this.views, frame.view);
        this.eventPlayer?.play(frame.events, frame.view);
        if (frame.view.snapshot.outcome) {
            this.outcome = frame.view.snapshot.outcome;
            this.outcomeFlow?.show(this.outcome);
        }
    }

    private chooseSkill(index: number): void {
        if (!this.ready || this.settling || !this.service) return;
        const view = this.service.current;
        const unit = view.snapshot.units.find((candidate) => candidate.unitId === view.readyAllyId);
        const skillId = unit?.skillIds[index];
        if (!unit || !skillId) return;
        const result = this.service.useSkill(unit.unitId, skillId);
        if (!result.ok) AppRoot.instance.showFeedback(result.message ?? '当前无法施展该技能');
        this.consumeFrame(result);
    }

    private toggleAuto(unitId: number): void {
        if (!this.ready || this.settling || !this.service) return;
        this.consumeFrame(this.service.toggleAuto(unitId));
    }

    private readonly escapeCombat = (): void => {
        void this.performEscape();
    };

    private async performEscape(): Promise<void> {
        if (!this.ready || this.settling || !this.service || !this.service.current.escapeAvailable) return;
        this.settling = true;
        const result = await this.service.escape();
        this.settling = false;
        if (!result.ok) {
            AppRoot.instance.showFeedback(result.message);
            this.nodes && renderCombat(this.nodes, this.views, this.service.current);
            return;
        }
        await this.navigate(result);
    }

    private readonly confirmResult = (): void => {
        if (this.routing || this.settling || this.outcomeFlow?.busy) return;
        if (this.loadFailed) {
            void AppRoot.instance.router.pop();
        } else if (this.pendingNavigation) {
            void this.navigate(this.pendingNavigation);
        } else {
            this.outcomeFlow?.confirmResult();
        }
    };

    private async navigate(result: CombatSettlementResult): Promise<void> {
        if (this.routing) return;
        this.routing = true;
        try {
            if (result.destination === 'camp') {
                await AppRoot.instance.router.replaceRoot({ pageId: 'camp' }, 'fade');
            } else {
                await AppRoot.instance.router.pop();
            }
            AppRoot.instance.showFeedback(result.message, 3);
            this.pendingNavigation = null;
        } catch (error) {
            console.error('[战斗] 返回目标页面失败', error);
            this.routing = false;
            this.pendingNavigation = result;
            AppRoot.instance.showFeedback('页面切换失败，请重试', 3);
            this.showNavigationRetry(result);
        }
    }

    private showLoadFailure(error: unknown): void {
        if (!this.nodes) return;
        this.ready = false;
        this.loadFailed = true;
        this.nodes.loadingRoot.active = false;
        this.nodes.resultTitle.string = '战斗加载失败';
        this.nodes.resultMessage.string = error instanceof Error ? error.message : '战斗配置不可用';
        this.nodes.resultButtonLabel.string = '返回地图';
        this.nodes.resultRoot.active = true;
        setCombatButtonEnabled(this.nodes.resultButton, true);
    }

    private showNavigationRetry(result: CombatSettlementResult): void {
        if (!this.nodes) return;
        this.nodes.resultTitle.string = result.outcome === 'escaped' ? '已脱离战斗' : '战斗已结算';
        this.nodes.resultMessage.string = `${result.message}\n页面切换失败，请重试`;
        this.nodes.resultButtonLabel.string = result.destination === 'camp' ? '返回营地' : '返回地图';
        this.nodes.resultRoot.active = true;
        setCombatButtonEnabled(this.nodes.resultButton, true);
    }

    private readonly pauseCombat = (): void => { this.paused = true; };
    private readonly resumeCombat = (): void => { this.paused = false; };

    private fitDesignRoot(): void {
        const root = this.nodes?.designRoot;
        const hostSize = root?.parent?.getComponent(UITransform)?.contentSize;
        if (!root || !hostSize) return;
        const scale = Math.min(
            hostSize.width / COMBAT_LOGICAL_WIDTH,
            hostSize.height / COMBAT_LOGICAL_HEIGHT,
        );
        root.setScale(scale, scale, 1);
        root.setPosition(0, 0, 0);
    }
}

function readCombatContext(): CombatContext {
    const route = AppRoot.instance.router.current();
    if (route?.pageId !== 'combat') throw new Error('当前路由不是战斗页面');
    const mapId = route.params?.mapId;
    const objectId = route.params?.objectId;
    const enemyId = route.params?.enemyId;
    if (typeof mapId !== 'string' || typeof objectId !== 'string' || typeof enemyId !== 'string') {
        throw new Error('战斗路由参数不完整');
    }
    return { mapId, objectId, enemyId };
}
