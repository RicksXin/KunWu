/**
 * 营地全景横滑的纯逻辑（PRD-01 §4.1）。
 *
 * 职责边界：只计算位置、边界、拖动阈值和惯性，
 * 不引用 Cocos API。表现层只需把输入位移和 deltaTime 传进来。
 */

export const PANORAMA_DRAG_THRESHOLD_DP = 12;
export const PANORAMA_CLICK_DEBOUNCE_MS = 350;
export const PANORAMA_STOP_SPEED = 8;

/** 每 60Hz 帧保留的速度比例；不依赖实际帧率。 */
const INERTIA_RETAINED_PER_FRAME = 0.9;

export interface PanoramaBounds {
    readonly minX: number;
    readonly maxX: number;
    readonly scrollable: boolean;
}

export interface DragGesture {
    readonly distanceDp: number;
    readonly isDragging: boolean;
}

export interface InertiaStep {
    readonly x: number;
    readonly velocity: number;
}

/**
 * 全景和视口都以中心为锚点。内容不足一屏时固定居中。
 */
export function panoramaBounds(viewportWidth: number, contentWidth: number): PanoramaBounds {
    assertPositiveFinite(viewportWidth, 'viewportWidth');
    assertPositiveFinite(contentWidth, 'contentWidth');

    if (contentWidth <= viewportWidth) {
        return { minX: 0, maxX: 0, scrollable: false };
    }

    const travel = (contentWidth - viewportWidth) / 2;
    return { minX: -travel, maxX: travel, scrollable: true };
}

export function clampPanoramaX(x: number, bounds: PanoramaBounds): number {
    if (!Number.isFinite(x)) {
        throw new Error(`x 必须是有限数，收到 ${x}`);
    }
    return Math.min(bounds.maxX, Math.max(bounds.minX, x));
}

/** 无恢复值时停在中部；旧值越界时按新视口夹取。 */
export function initialPanoramaX(
    rememberedX: number | null,
    bounds: PanoramaBounds,
): number {
    return rememberedX === null ? 0 : clampPanoramaX(rememberedX, bounds);
}

/** 累积横向路程，超过 12dp 后本次手势永久判定为拖动。 */
export function advanceDragGesture(
    gesture: DragGesture,
    deltaX: number,
): DragGesture {
    if (!Number.isFinite(deltaX)) {
        throw new Error(`deltaX 必须是有限数，收到 ${deltaX}`);
    }
    const distanceDp = gesture.distanceDp + Math.abs(deltaX);
    return {
        distanceDp,
        isDragging: gesture.isDragging || distanceDp > PANORAMA_DRAG_THRESHOLD_DP,
    };
}

/**
 * 计算一帧惯性。到边界立即清零速度，不回弹、不吸附。
 */
export function stepPanoramaInertia(
    x: number,
    velocity: number,
    deltaSeconds: number,
    bounds: PanoramaBounds,
): InertiaStep {
    if (!(deltaSeconds >= 0) || !Number.isFinite(deltaSeconds)) {
        throw new Error(`deltaSeconds 必须是非负有限数，收到 ${deltaSeconds}`);
    }
    if (!Number.isFinite(velocity)) {
        throw new Error(`velocity 必须是有限数，收到 ${velocity}`);
    }
    if (!bounds.scrollable || Math.abs(velocity) < PANORAMA_STOP_SPEED) {
        return { x: clampPanoramaX(x, bounds), velocity: 0 };
    }

    const unclampedX = x + velocity * deltaSeconds;
    const nextX = clampPanoramaX(unclampedX, bounds);
    if (nextX !== unclampedX) {
        return { x: nextX, velocity: 0 };
    }

    const retained = Math.pow(INERTIA_RETAINED_PER_FRAME, deltaSeconds * 60);
    const nextVelocity = velocity * retained;
    return {
        x: nextX,
        velocity: Math.abs(nextVelocity) < PANORAMA_STOP_SPEED ? 0 : nextVelocity,
    };
}

/** 跨场景保留离开营地时的位置，不进存档。 */
export class PanoramaPositionMemory {
    private rememberedX: number | null = null;
    private restoreRequested = false;

    remember(x: number, bounds: PanoramaBounds): void {
        this.rememberedX = clampPanoramaX(x, bounds);
    }

    /** 只有进入建筑等大厅子页面前才请求恢复。 */
    requestRestore(): void {
        this.restoreRequested = true;
    }

    /**
     * 每次创建 Camp 场景时消费一次。
     * 普通回城/重新登录没有请求，因此一律回中部。
     */
    takeInitialX(bounds: PanoramaBounds): number {
        const x = this.restoreRequested ? initialPanoramaX(this.rememberedX, bounds) : 0;
        this.restoreRequested = false;
        return x;
    }

    reset(): void {
        this.rememberedX = null;
        this.restoreRequested = false;
    }
}

/** 阻止同一入口在极短时间内被连续触发。 */
export class EntryActivationGate {
    private readonly lastActivatedAt = new Map<string, number>();

    tryActivate(id: string, nowMs: number): boolean {
        if (!Number.isFinite(nowMs)) {
            throw new Error(`nowMs 必须是有限数，收到 ${nowMs}`);
        }
        const last = this.lastActivatedAt.get(id);
        if (last !== undefined && nowMs - last < PANORAMA_CLICK_DEBOUNCE_MS) {
            return false;
        }
        this.lastActivatedAt.set(id, nowMs);
        return true;
    }
}

function assertPositiveFinite(value: number, label: string): void {
    if (!(value > 0) || !Number.isFinite(value)) {
        throw new Error(`${label} 必须是正有限数，收到 ${value}`);
    }
}
