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
import { GridCoord } from 'db://assets/scripts/domain/GridCoord';
import { findPath, pathGrainCost } from 'db://assets/scripts/domain/Movement';
import {
    demoObjectAt,
    demoTileAt,
} from 'db://assets/scripts/domain/map/DemoMapDefinition';
import type { DemoMapDefinition } from 'db://assets/scripts/domain/map/DemoMapDefinition';
import { createViewportSafeAreaRoot } from 'db://assets/scripts/presentation/core/ViewportAdapter';
import {
    buildMapScene,
    MAP_LOGICAL_HEIGHT,
    MAP_LOGICAL_WIDTH,
    setMapButtonEnabled,
} from 'db://assets/scripts/presentation/map/MapSceneView';
import type { MapSceneNodes } from 'db://assets/scripts/presentation/map/MapSceneView';
import {
    animateMapMove,
    loadDemoMapDefinition,
    loadMapVisual,
    renderFallbackTerrain,
    renderMapState,
    resizeMapWorld,
    showMapObjectOverlay,
} from 'db://assets/scripts/presentation/map/MapVisualRenderer';
import type { MapRenderOptions } from 'db://assets/scripts/presentation/map/MapVisualRenderer';

const { ccclass } = _decorator;
@ccclass('MapPresenter')
export class MapPresenter extends Component {
    private map: DemoMapDefinition | null = null;
    private nodes: MapSceneNodes | null = null;
    private busy = false;
    private ready = false;
    private readonly encountered = new Set<string>();

    protected override onLoad(): void {
        const safeAreaRoot = createViewportSafeAreaRoot(this.node, 'MapSafeAreaRoot');
        this.nodes = buildMapScene(safeAreaRoot, MAP_LOGICAL_WIDTH, MAP_LOGICAL_HEIGHT);
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
            this.map = await loadDemoMapDefinition();
            if (!this.nodes) throw new Error('Map 场景节点尚未创建');
            resizeMapWorld(this.map, this.nodes);
            renderFallbackTerrain(this.map, this.nodes.terrainGraphics);

            const entered = await AppRoot.instance.map.enter(this.map);
            if (!entered.ok) {
                this.nodes.loadingLabel.string = entered.message;
                this.nodes.returnButtonLabel.string = '返回营地';
                this.nodes.loadingRoot.active = true;
                return;
            }

            this.nodes.loadingRoot.active = false;
            this.refresh();
            const expedition = AppRoot.instance.state.require().expedition;
            if (expedition) await this.handleObjectAt(expedition.position);
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
        nodes.returnButton.on(Button.EventType.CLICK, this.returnToCamp, this);
        nodes.encounterCloseButton.on(Button.EventType.CLICK, this.closeEncounter, this);
        nodes.viewport.on(Node.EventType.TOUCH_END, this.onMapTouch, this);
    }

    private unbindNodes(): void {
        const nodes = this.nodes;
        if (!nodes) return;
        nodes.upButton.off(Button.EventType.CLICK, this.moveUp, this);
        nodes.downButton.off(Button.EventType.CLICK, this.moveDown, this);
        nodes.leftButton.off(Button.EventType.CLICK, this.moveLeft, this);
        nodes.rightButton.off(Button.EventType.CLICK, this.moveRight, this);
        nodes.returnButton.off(Button.EventType.CLICK, this.returnToCamp, this);
        nodes.encounterCloseButton.off(Button.EventType.CLICK, this.closeEncounter, this);
        nodes.viewport.off(Node.EventType.TOUCH_END, this.onMapTouch, this);
    }

    private readonly moveUp = (): void => { void this.moveBy(0, 1); };
    private readonly moveDown = (): void => { void this.moveBy(0, -1); };
    private readonly moveLeft = (): void => { void this.moveBy(-1, 0); };
    private readonly moveRight = (): void => { void this.moveBy(1, 0); };

    private async moveBy(dx: number, dy: number): Promise<void> {
        const map = this.map;
        const nodes = this.nodes;
        if (!this.ready || this.busy || !map || !nodes || nodes.encounterRoot.active) return;
        const expedition = AppRoot.instance.state.require().expedition;
        if (!expedition) return;

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
            this.refresh({ centerCamera: false, playerPosition: from });
            await animateMapMove(map, from, result.position ?? target, nodes);
            this.refresh();
            await this.handleObjectAt(result.position ?? target);
        } finally {
            this.busy = false;
        }
    }

    private readonly onMapTouch = (event: EventTouch): void => {
        if (!this.ready || this.busy || !this.map || !this.nodes) return;
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

    private refresh(options?: MapRenderOptions): void {
        const map = this.map;
        const nodes = this.nodes;
        const profile = AppRoot.instance.state.require();
        const expedition = profile.expedition;
        if (!map || !nodes || !expedition) return;
        renderMapState(map, expedition, profile.completedMapObjects ?? {}, nodes, options);
        nodes.titleLabel.string = map.name;
        nodes.grainLabel.string = `灵粮 ${expedition.remainingGrain}`;
        nodes.positionLabel.string = `坐标 ${expedition.position.x},${expedition.position.y}`;

        const path = findPath({
            start: expedition.position,
            goal: new GridCoord(map.entryX, map.entryY),
            bounds: { width: map.width, height: map.height },
            costAt: (coord) => {
                const tile = demoTileAt(map, coord);
                return tile.walkable ? tile.moveCost : null;
            },
        });
        const returnCost = path ? pathGrainCost(path, (coord) => demoTileAt(map, coord).moveCost) : null;
        nodes.returnCostLabel.string = `返程 ${returnCost ?? '--'}`;
        const atEntry = expedition.position.x === map.entryX && expedition.position.y === map.entryY;
        nodes.returnButtonLabel.string = expedition.remainingGrain === 0 && !atEntry ? '紧急撤退' : '返营';
        nodes.hintLabel.string = atEntry ? '入口传送阵可安全返营' : '返回青色传送阵才能返营';

        setMapButtonEnabled(nodes.upButton, this.canMove(expedition.position, 0, 1));
        setMapButtonEnabled(nodes.downButton, this.canMove(expedition.position, 0, -1));
        setMapButtonEnabled(nodes.leftButton, this.canMove(expedition.position, -1, 0));
        setMapButtonEnabled(nodes.rightButton, this.canMove(expedition.position, 1, 0));
    }

    private canMove(from: GridCoord, dx: number, dy: number): boolean {
        if (!this.map) return false;
        const expedition = AppRoot.instance.state.require().expedition;
        if (!expedition) return false;
        const tile = demoTileAt(this.map, new GridCoord(from.x + dx, from.y + dy));
        return tile.walkable && tile.moveCost <= expedition.remainingGrain;
    }

    private async handleObjectAt(position: GridCoord): Promise<void> {
        const map = this.map;
        const nodes = this.nodes;
        if (!map || !nodes) return;
        const object = demoObjectAt(map, position);
        if (!object) return;
        if (object.kind === 'enemy_group') {
            if (this.encountered.has(object.id)) return;
            this.encountered.add(object.id);
            showMapObjectOverlay(nodes, object);
            AppRoot.instance.events.emit('map.encounterTriggered', {
                mapId: map.id,
                objectId: object.id,
                enemyId: 'can_jin_shi_kui',
            });
            return;
        }
        const result = await AppRoot.instance.map.resolveObject(map, object);
        if (!result.ok) {
            AppRoot.instance.showFeedback(result.message);
            return;
        }
        if (!result.resolved) return;
        this.refresh();
        showMapObjectOverlay(nodes, object);
    }

    private readonly closeEncounter = (): void => {
        if (this.nodes) this.nodes.encounterRoot.active = false;
    };

    private readonly returnToCamp = (): void => {
        void this.performReturn();
    };

    private async performReturn(): Promise<void> {
        if (this.busy) return;
        if (!this.ready || !this.map) {
            AppRoot.instance.map.cancelStagedDeparture();
            await AppRoot.instance.router.replaceRoot({ pageId: 'camp' });
            return;
        }
        const expedition = AppRoot.instance.state.require().expedition;
        if (!expedition) return;
        const atEntry = expedition.position.x === this.map.entryX
            && expedition.position.y === this.map.entryY;
        const emergency = expedition.remainingGrain === 0 && !atEntry;
        this.busy = true;
        const result = await AppRoot.instance.map.returnToCamp(this.map, emergency);
        this.busy = false;
        if (!result.ok) {
            AppRoot.instance.showFeedback(result.message);
            return;
        }
        await AppRoot.instance.router.replaceRoot({ pageId: 'camp' });
    }

    private readonly onKeyDown = (event: EventKeyboard): void => {
        switch (event.keyCode) {
            case KeyCode.ARROW_UP: this.moveUp(); break;
            case KeyCode.ARROW_DOWN: this.moveDown(); break;
            case KeyCode.ARROW_LEFT: this.moveLeft(); break;
            case KeyCode.ARROW_RIGHT: this.moveRight(); break;
            case KeyCode.ESCAPE: this.returnToCamp(); break;
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
