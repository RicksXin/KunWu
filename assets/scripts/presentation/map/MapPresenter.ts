import {
    _decorator,
    Button,
    Component,
    EventKeyboard,
    EventTouch,
    input,
    Input,
    KeyCode,
    Node,
    UITransform,
    Vec3,
} from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import type { ExpeditionPreparationConfig } from 'db://assets/scripts/domain/ExpeditionPreparation';
import { GridCoord } from 'db://assets/scripts/domain/GridCoord';
import { demoObjectAt } from 'db://assets/scripts/domain/map/DemoMapDefinition';
import type { DemoMapDefinition } from 'db://assets/scripts/domain/map/DemoMapDefinition';
import { createViewportSafeAreaRoot } from 'db://assets/scripts/presentation/core/ViewportAdapter';
import { MapActionController } from 'db://assets/scripts/presentation/map/MapActionController';
import { MapEventPanelController } from 'db://assets/scripts/presentation/map/MapEventPanelController';
import {
    finishGrainDepletionDeath,
    hasPendingGrainDepletionDeath,
} from 'db://assets/scripts/presentation/map/MapGrainDepletionController';
import { captureMapGrainDisplay, renderMapHud } from 'db://assets/scripts/presentation/map/MapHudRenderer';
import type { MapHudRenderOptions } from 'db://assets/scripts/presentation/map/MapHudRenderer';
import {
    buildMapScene,
    MAP_LOGICAL_HEIGHT,
    MAP_LOGICAL_WIDTH,
} from 'db://assets/scripts/presentation/map/MapSceneView';
import type { MapSceneNodes } from 'db://assets/scripts/presentation/map/MapSceneView';
import {
    animateMapMove,
    loadDemoMapDefinition,
    loadMapVisual,
    renderFallbackTerrain,
    resizeMapWorld,
} from 'db://assets/scripts/presentation/map/MapVisualRenderer';

const { ccclass } = _decorator;

@ccclass('MapPresenter')
export class MapPresenter extends Component {
    private map: DemoMapDefinition | null = null;
    private config: ExpeditionPreparationConfig | null = null;
    private nodes: MapSceneNodes | null = null;
    private actions: MapActionController | null = null;
    private eventPanel: MapEventPanelController | null = null;
    private busy = false;
    private ready = false;

    protected override onLoad(): void {
        const safeAreaRoot = createViewportSafeAreaRoot(this.node, 'MapSafeAreaRoot');
        this.nodes = buildMapScene(safeAreaRoot, MAP_LOGICAL_WIDTH, MAP_LOGICAL_HEIGHT);
        this.actions = new MapActionController({
            nodes: this.nodes,
            getMap: () => this.map,
            getConfig: () => this.config,
            refresh: () => this.refresh(),
        });
        this.eventPanel = new MapEventPanelController({
            nodes: this.nodes,
            getMap: () => this.map,
            refresh: () => this.refresh(),
        });
        this.fitDesignRoot();
        this.bindNodes();
        safeAreaRoot.on(Node.EventType.SIZE_CHANGED, this.fitDesignRoot, this);
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        void this.initialize();
    }

    protected override onDestroy(): void {
        try {
            this.nodes?.designRoot.parent?.off(Node.EventType.SIZE_CHANGED, this.fitDesignRoot, this);
        } catch {
            // 场景销毁时安全区节点的事件处理器可能已先释放。
        }
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        try {
            this.unbindNodes();
        } catch {
            // 地图运行节点随场景销毁时，其事件处理器已经由 Cocos 自动释放。
        }
    }

    private async initialize(): Promise<void> {
        try {
            this.config = AppRoot.instance.getExpeditionPreparationConfig();
            if (!this.config) throw new Error('入山配置尚未加载');
            this.map = await loadDemoMapDefinition();
            if (!this.nodes) throw new Error('Map 场景节点尚未创建');
            resizeMapWorld(this.map, this.nodes);
            renderFallbackTerrain(this.map, this.nodes.terrainGraphics);
            const entered = await AppRoot.instance.map.enter(this.map);
            if (!entered.ok) {
                this.nodes.loadingLabel.string = entered.message;
                this.nodes.loadingRoot.active = true;
                return;
            }
            this.nodes.loadingRoot.active = false;
            this.refresh();
            void this.refreshMainTask();
            const expedition = AppRoot.instance.state.require().expedition;
            if (expedition && hasPendingGrainDepletionDeath(
                expedition,
                this.config.field.grainDepletionStepLimit,
            )) {
                this.ready = false;
                await finishGrainDepletionDeath(this.map.id, this.nodes);
                return;
            }
            if (expedition && !expedition.isResting) await this.handleObjectAt(expedition.position);
            this.ready = true;
            try {
                await loadMapVisual(this.map, this.nodes);
            } catch (error) {
                console.warn('[地图] CC0 地图素材暂未就绪，使用可操作灰盒', error);
                AppRoot.instance.showFeedback('免费地图素材未导入，当前使用灰盒地形', 3);
            }
        } catch (error) {
            console.error('[地图] 初始化失败', error);
            if (this.nodes) {
                this.nodes.loadingLabel.string = '地图初始化失败，请返回营地重试';
                this.nodes.loadingRoot.active = true;
            }
            AppRoot.instance.showFeedback('地图初始化失败，请返回营地重试', 3);
        }
    }

    private bindNodes(): void {
        const nodes = this.nodes;
        if (!nodes) return;
        nodes.upButton.on(Button.EventType.CLICK, this.moveUp, this);
        nodes.downButton.on(Button.EventType.CLICK, this.moveDown, this);
        nodes.leftButton.on(Button.EventType.CLICK, this.moveLeft, this);
        nodes.rightButton.on(Button.EventType.CLICK, this.moveRight, this);
        nodes.viewport.on(Node.EventType.TOUCH_END, this.onMapTouch, this);
        this.actions?.bind();
        this.eventPanel?.bind();
    }

    private unbindNodes(): void {
        const nodes = this.nodes;
        if (!nodes) return;
        nodes.upButton.off(Button.EventType.CLICK, this.moveUp, this);
        nodes.downButton.off(Button.EventType.CLICK, this.moveDown, this);
        nodes.leftButton.off(Button.EventType.CLICK, this.moveLeft, this);
        nodes.rightButton.off(Button.EventType.CLICK, this.moveRight, this);
        nodes.viewport.off(Node.EventType.TOUCH_END, this.onMapTouch, this);
        this.actions?.unbind();
        this.eventPanel?.unbind();
    }

    private readonly moveUp = (): void => { void this.moveBy(0, 1); };
    private readonly moveDown = (): void => { void this.moveBy(0, -1); };
    private readonly moveLeft = (): void => { void this.moveBy(-1, 0); };
    private readonly moveRight = (): void => { void this.moveBy(1, 0); };

    private async moveBy(dx: number, dy: number): Promise<void> {
        const map = this.map;
        const nodes = this.nodes;
        if (!this.ready || this.busy || !map || !nodes || this.mapInputBlocked()) return;
        const expedition = AppRoot.instance.state.require().expedition;
        if (!expedition) return;
        const grainDisplay = captureMapGrainDisplay(expedition);
        this.busy = true;
        const from = new GridCoord(expedition.position.x, expedition.position.y);
        const target = new GridCoord(expedition.position.x + dx, expedition.position.y + dy);
        try {
            const result = await AppRoot.instance.map.move(map, target);
            if (!result.ok) {
                AppRoot.instance.showFeedback(result.message ?? '当前无法移动');
                this.refresh();
                return;
            }
            this.refresh({ centerCamera: false, playerPosition: from, grainDisplay });
            const arrived = result.position ?? target;
            await animateMapMove(map, from, arrived, nodes);
            this.refresh();
            if (result.partyWiped) {
                this.ready = false;
                await finishGrainDepletionDeath(map.id, nodes);
                return;
            }
            if (this.returnedToEntry(from, arrived)) {
                this.actions?.promptEntryReturn();
                return;
            }
            await this.handleObjectAt(arrived);
        } finally {
            this.busy = false;
        }
    }

    private readonly onMapTouch = (event: EventTouch): void => {
        if (!this.ready || this.busy || !this.map || !this.nodes || this.mapInputBlocked()) return;
        const location = event.getUILocation();
        const local = this.nodes.world.getComponent(UITransform)!.convertToNodeSpaceAR(
            new Vec3(location.x, location.y, 0),
        );
        const size = this.map.visual.logicalTileSize;
        const target = new GridCoord(Math.floor(local.x / size), Math.floor(local.y / size));
        const current = AppRoot.instance.state.require().expedition?.position;
        if (!current || !current.isAdjacentTo(target)) {
            AppRoot.instance.showFeedback('请选择相邻格');
            return;
        }
        void this.moveBy(target.x - current.x, target.y - current.y);
    };

    private refresh(options?: MapHudRenderOptions): void {
        const profile = AppRoot.instance.state.require();
        if (!this.map || !this.config || !this.nodes || !profile.expedition) return;
        renderMapHud(this.map, profile, this.config, this.nodes, options);
        this.actions?.syncOverlays();
    }

    private async refreshMainTask(): Promise<void> {
        try {
            const model = AppRoot.instance.campHud.current ?? await AppRoot.instance.campHud.refresh();
            this.nodes?.mainTaskSummary.render(model.mainTaskObjective);
        } catch (error) {
            console.error('[地图任务摘要] 刷新失败', error);
            this.nodes?.mainTaskSummary.render(undefined);
        }
    }

    private async handleObjectAt(position: GridCoord): Promise<void> {
        const map = this.map;
        const nodes = this.nodes;
        if (!map || !nodes) return;
        const object = demoObjectAt(map, position);
        if (!object) return;
        const completed = AppRoot.instance.state.require()
            .completedMapObjects[`${map.id}.${object.id}`] === true;
        if (completed && object.kind !== 'enemy_group' && !object.kind.startsWith('boss_')) {
            return;
        }
        if (object.kind === 'story_event') {
            const result = await AppRoot.instance.map.resolveObject(map, object);
            if (!result.ok) {
                AppRoot.instance.showFeedback(result.message);
                return;
            }
            if (!result.resolved) return;
            this.refresh();
        }
        this.eventPanel?.open(object);
    }

    private mapInputBlocked(): boolean {
        return Boolean(this.eventPanel?.isOpen || this.actions?.blocksMapInput);
    }

    private returnedToEntry(from: GridCoord, arrived: GridCoord): boolean {
        if (!this.map) return false;
        const arrivedAtEntry = arrived.x === this.map.entryX && arrived.y === this.map.entryY;
        const startedAtEntry = from.x === this.map.entryX && from.y === this.map.entryY;
        return arrivedAtEntry && !startedAtEntry;
    }

    private readonly onKeyDown = (event: EventKeyboard): void => {
        if (event.keyCode === KeyCode.ESCAPE) {
            if (this.eventPanel?.handleBack()) return;
            else if (!this.actions?.handleBack()) AppRoot.instance.showFeedback('请使用右上角“归营”');
            return;
        }
        switch (event.keyCode) {
            case KeyCode.ARROW_UP: this.moveUp(); break;
            case KeyCode.ARROW_DOWN: this.moveDown(); break;
            case KeyCode.ARROW_LEFT: this.moveLeft(); break;
            case KeyCode.ARROW_RIGHT: this.moveRight(); break;
        }
    };

    private fitDesignRoot(): void {
        const root = this.nodes?.designRoot;
        const hostSize = root?.parent?.getComponent(UITransform)?.contentSize;
        if (!root || !hostSize) return;
        const scale = Math.min(hostSize.width / MAP_LOGICAL_WIDTH, hostSize.height / MAP_LOGICAL_HEIGHT);
        root.setScale(scale, scale, 1);
        root.setPosition(0, 0, 0);
    }
}
