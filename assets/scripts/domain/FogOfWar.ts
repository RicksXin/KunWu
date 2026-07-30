/**
 * 迷雾状态与视野揭示（PRD-05 §5、任务 P1-MAP-002）。
 *
 * 纯逻辑、无引擎依赖。三条要点：
 *   1. 状态只能单向推进：UNKNOWN → DISCOVERED → VISIBLE，
 *      且离开后从 VISIBLE 退回 DISCOVERED——已探明的地形不该重新变黑。
 *   2. 视野用整数圆 dx² + dy² <= r²（GridCoord.squaredDistanceTo），
 *      不开平方以免浮点误差让边界格时隐时现。
 *   3. P2 只做圆形半径，不做障碍遮挡（PRD-05 §5 明确）。
 */

import { GridCoord } from './GridCoord';
import type { FogState } from './MapTypes';
import { BASE_VISION_RADIUS } from './MapTypes';

/** 探灵灯各级视野半径（PRD-05 §5：基础 2，升级 3/4/5）。 */
export const VISION_RADIUS_BY_LAMP_LEVEL: readonly number[] = [
    BASE_VISION_RADIUS,
    3,
    4,
    5,
];

/** 取某个探灵灯等级的视野半径。超出范围取最大档。 */
export function visionRadiusFor(lampLevel: number): number {
    if (lampLevel < 0) {
        throw new Error(`探灵灯等级不能为负，收到 ${lampLevel}`);
    }
    const index = Math.min(lampLevel, VISION_RADIUS_BY_LAMP_LEVEL.length - 1);
    return VISION_RADIUS_BY_LAMP_LEVEL[index]!;
}

/**
 * 迷雾图。用坐标键集合而非二维数组：
 * 大地图多为稀疏揭示，集合更省内存，也便于直接存档（技术方案 §9.3）。
 */
export class FogMap {
    private readonly discovered = new Set<string>();
    private readonly visible = new Set<string>();

    readonly width: number;
    readonly height: number;

    // 不用构造函数参数属性（constructor(readonly width: number)）：
    // Node 的类型擦除模式不支持，那需要生成代码而非仅删类型。
    constructor(width: number, height: number) {
        if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
            throw new Error(`迷雾图尺寸必须为正整数，收到 ${width}×${height}`);
        }
        this.width = width;
        this.height = height;
    }

    /** 从存档恢复。 */
    static fromRevealed(width: number, height: number, revealedKeys: Iterable<string>): FogMap {
        const map = new FogMap(width, height);
        for (const key of revealedKeys) {
            map.discovered.add(key);
        }
        return map;
    }

    inBounds(coord: GridCoord): boolean {
        return coord.x >= 0 && coord.y >= 0 && coord.x < this.width && coord.y < this.height;
    }

    stateAt(coord: GridCoord): FogState {
        const key = coord.toKey();
        if (this.visible.has(key)) {
            return 'VISIBLE';
        }
        return this.discovered.has(key) ? 'DISCOVERED' : 'UNKNOWN';
    }

    /**
     * 以 center 为中心揭示视野。
     *
     * 上一轮的 VISIBLE 格降为 DISCOVERED——队伍走开后不再看到敌人实时状态，
     * 但地形与已发现的 POI 保持可见（PRD-05 §5）。
     */
    revealAround(center: GridCoord, radius: number): void {
        if (!Number.isInteger(radius) || radius < 0) {
            throw new Error(`视野半径必须为非负整数，收到 ${radius}`);
        }

        // 先清空 visible：离开的格子退回 DISCOVERED，而非保持 VISIBLE
        this.visible.clear();

        const squaredRadius = radius * radius;
        for (let dy = -radius; dy <= radius; dy += 1) {
            for (let dx = -radius; dx <= radius; dx += 1) {
                // 整数圆判定，不开平方
                if (dx * dx + dy * dy > squaredRadius) {
                    continue;
                }
                const coord = new GridCoord(center.x + dx, center.y + dy);
                if (!this.inBounds(coord)) {
                    continue;
                }
                const key = coord.toKey();
                this.visible.add(key);
                // 一旦看见就永久记为已探明
                this.discovered.add(key);
            }
        }
    }

    /** 已探明格数，用于探索度显示。 */
    get discoveredCount(): number {
        return this.discovered.size;
    }

    get visibleCount(): number {
        return this.visible.size;
    }

    /** 导出供存档使用。排序保证存档内容稳定，便于校验值比对。 */
    toRevealedKeys(): string[] {
        return Array.from(this.discovered).sort();
    }
}
