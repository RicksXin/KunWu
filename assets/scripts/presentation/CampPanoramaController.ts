import { _decorator, Component, EventTouch, Node, UITransform } from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import {
    PanoramaPositionMemory,
    advanceDragGesture,
    panoramaBounds,
    stepPanoramaInertia,
} from 'db://assets/scripts/domain/HallPanorama';
import type { DragGesture, PanoramaBounds } from 'db://assets/scripts/domain/HallPanorama';
import { campNode, disposeCampBindings } from './CampViewUtils';

const { ccclass } = _decorator;
const PANORAMA_MEMORY = new PanoramaPositionMemory();
const MAX_DRAG_SPEED = 4000;

/** 全景拖动、惯性、边界和位置恢复；不处理任何建筑业务。 */
@ccclass('CampPanoramaController')
export class CampPanoramaController extends Component {
    private readonly disposers: (() => void)[] = [];
    private content: Node | null = null;
    private bounds: PanoramaBounds = { minX: 0, maxX: 0, scrollable: false };
    private gesture: DragGesture = { distanceDp: 0, isDragging: false };
    private pointerActive = false;
    private suppressBuildingClick = false;
    private velocity = 0;
    private lastMoveAtMs = 0;
    private initialized = false;

    protected override onLoad(): void {
        this.content = campNode(this.node, 'PanoramaContent');
        this.bindInput();
        const app = AppRoot.instance;
        this.disposers.push(
            app.events.on('camp.panorama.reset', () => this.reset()),
            app.events.on('expedition.settlementClosed', () => this.reset()),
            app.events.on('camp.npcListRequested', () => this.stopMotion()),
            app.events.on('camp.settingsRequested', () => this.stopMotion()),
        );
    }

    protected override start(): void {
        this.initialize();
    }

    protected override update(deltaTime: number): void {
        if (!this.content || this.pointerActive || this.velocity === 0) {
            return;
        }
        const step = stepPanoramaInertia(
            this.content.position.x,
            this.velocity,
            deltaTime,
            this.bounds,
        );
        this.velocity = step.velocity;
        this.setX(step.x);
    }

    protected override onDestroy(): void {
        disposeCampBindings(this.disposers);
    }

    isBuildingClickSuppressed(): boolean {
        return this.suppressBuildingClick;
    }

    rememberForChildPage(): void {
        if (this.content) {
            PANORAMA_MEMORY.remember(this.content.position.x, this.bounds);
            PANORAMA_MEMORY.requestRestore();
        }
    }

    private bindInput(): void {
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this, true);
        this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this, true);
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this, true);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this, true);
        this.node.on(Node.EventType.SIZE_CHANGED, this.onViewportSizeChanged, this);
        this.disposers.push(() => {
            this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this, true);
            this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this, true);
            this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this, true);
            this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this, true);
            this.node.off(Node.EventType.SIZE_CHANGED, this.onViewportSizeChanged, this);
        });
    }

    private initialize(): void {
        const viewportSize = this.node.getComponent(UITransform)?.contentSize;
        const contentSize = this.content?.getComponent(UITransform)?.contentSize;
        if (!viewportSize || !contentSize) {
            return;
        }
        this.bounds = panoramaBounds(viewportSize.width, contentSize.width);
        const initialX = this.initialized
            ? this.content?.position.x ?? 0
            : PANORAMA_MEMORY.takeInitialX(this.bounds);
        this.initialized = true;
        this.setX(initialX);
    }

    private reset(): void {
        PANORAMA_MEMORY.reset();
        this.stopMotion();
        this.setX(0);
    }

    private stopMotion(): void {
        this.pointerActive = false;
        this.velocity = 0;
    }

    private readonly onViewportSizeChanged = (): void => {
        this.initialize();
    };

    private readonly onTouchStart = (): void => {
        this.pointerActive = true;
        this.gesture = { distanceDp: 0, isDragging: false };
        this.suppressBuildingClick = false;
        this.velocity = 0;
        this.lastMoveAtMs = Date.now();
    };

    private readonly onTouchMove = (event: EventTouch): void => {
        if (!this.pointerActive || !this.bounds.scrollable) {
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
        this.velocity = clamp(deltaX / elapsedSeconds, -MAX_DRAG_SPEED, MAX_DRAG_SPEED);
        this.setX((this.content?.position.x ?? 0) + deltaX);
    };

    private readonly onTouchEnd = (): void => {
        if (!this.pointerActive) {
            return;
        }
        this.pointerActive = false;
        if (this.content) {
            PANORAMA_MEMORY.remember(this.content.position.x, this.bounds);
        }
        if (!this.gesture.isDragging) {
            this.velocity = 0;
            return;
        }
        this.suppressBuildingClick = true;
        this.scheduleOnce(() => {
            this.suppressBuildingClick = false;
        }, 0);
    };

    private setX(x: number): void {
        if (!this.content) {
            return;
        }
        const clampedX = clamp(x, this.bounds.minX, this.bounds.maxX);
        this.content.setPosition(clampedX, this.content.position.y, this.content.position.z);
        if (clampedX !== x) {
            this.velocity = 0;
        }
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
