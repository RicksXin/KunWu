/**
 * 逐格移动与地形成本（PRD-05 §2、§4、§6、任务 P1-MAP-002）。
 *
 * 纯逻辑、无引擎依赖。领域层只认 GridCoord，像素换算在表现层（技术方案 §9.1）。
 *
 * 两条不可放松的规则：
 *   1. 每次只移动上下左右一格，不允许斜走（PRD-05 §2）。
 *      判定用 GridCoord.isAdjacentTo，即曼哈顿距离恰好 1。
 *   2. 每步先校验灵粮，再扣除（PRD-05 §6）。
 *      顺序反了会出现「灵粮扣成负数后才发现走不了」。
 */

import { GridCoord } from './GridCoord';
import { canAffordStep, deductStep } from './BurdenAndGrain';
import type { TileDefinition } from './MapTypes';

/** 地形成本表（PRD-05 §4）。 */
export const TERRAIN_MOVE_COST: Readonly<Record<string, number>> = {
    stone_path: 1,
    jade_floor: 1,
    forest: 2,
    rubble: 2,
    demon_mist: 2,
    water_pool: 3,
    mud: 3,
    // 已激活的传送阵不消耗灵粮
    active_teleporter: 0,
};

/** 未知地形的默认成本。取 1 而非 0——0 会让未配置地形变成免费通道。 */
export const DEFAULT_MOVE_COST = 1;

export function moveCostFor(terrain: string): number {
    return TERRAIN_MOVE_COST[terrain] ?? DEFAULT_MOVE_COST;
}

export type MoveRejection =
    /** 目标格不相邻，或试图斜走。 */
    | 'not_adjacent'
    /** 目标格超出地图边界。 */
    | 'out_of_bounds'
    /** 目标格不可通行。 */
    | 'not_walkable'
    /** 灵粮不足。 */
    | 'insufficient_grain';

export type MoveResult =
    | {
          readonly ok: true;
          readonly to: GridCoord;
          readonly grainSpent: number;
          readonly remainingGrain: number;
      }
    | { readonly ok: false; readonly reason: MoveRejection };

export interface MapBounds {
    readonly width: number;
    readonly height: number;
}

export function isInBounds(coord: GridCoord, bounds: MapBounds): boolean {
    return coord.x >= 0 && coord.y >= 0 && coord.x < bounds.width && coord.y < bounds.height;
}

/**
 * 尝试移动一格。
 *
 * 返回结果对象而非抛错：走不动是常规交互（玩家点了不可达格），
 * 不是异常。抛错会迫使调用方用 try/catch 处理正常流程。
 */
export function tryMove(params: {
    readonly from: GridCoord;
    readonly to: GridCoord;
    readonly bounds: MapBounds;
    readonly tile: TileDefinition;
    readonly remainingGrain: number;
}): MoveResult {
    const { from, to, bounds, tile, remainingGrain } = params;

    // 不允许斜走：曼哈顿距离必须恰好为 1
    if (!from.isAdjacentTo(to)) {
        return { ok: false, reason: 'not_adjacent' };
    }
    if (!isInBounds(to, bounds)) {
        return { ok: false, reason: 'out_of_bounds' };
    }
    if (!tile.walkable) {
        return { ok: false, reason: 'not_walkable' };
    }

    // 先校验后扣除
    const cost = tile.moveCost;
    if (!canAffordStep(remainingGrain, cost)) {
        return { ok: false, reason: 'insufficient_grain' };
    }

    return {
        ok: true,
        to,
        grainSpent: cost,
        remainingGrain: deductStep(remainingGrain, cost),
    };
}

/**
 * 一条路径的总灵粮消耗。
 * 用于地图 UI 显示「按最短路径返回所需的估算灵粮」（PRD-05 §6）。
 *
 * 路径不含起点，每个元素是一步的目标格。
 */
export function pathGrainCost(
    path: readonly GridCoord[],
    costAt: (coord: GridCoord) => number,
): number {
    let total = 0;
    for (const step of path) {
        const cost = costAt(step);
        if (!Number.isInteger(cost) || cost < 0) {
            throw new Error(`格 ${step.toString()} 的移动成本非法: ${cost}`);
        }
        total += cost;
    }
    return total;
}

/**
 * 四方向最短路径（Dijkstra，因地形成本不等权）。
 *
 * 不用 A*：地图最大 72×80 = 5760 格，Dijkstra 足够快，
 * 而 A* 的启发式在不等权地形上要额外证明可采纳性，不值得。
 *
 * @returns 从 start 到 goal 的路径（不含 start），无路可走时返回 null
 */
export function findPath(params: {
    readonly start: GridCoord;
    readonly goal: GridCoord;
    readonly bounds: MapBounds;
    /** 返回该格成本；不可通行返回 null。 */
    readonly costAt: (coord: GridCoord) => number | null;
}): GridCoord[] | null {
    const { start, goal, bounds, costAt } = params;

    if (!isInBounds(start, bounds) || !isInBounds(goal, bounds)) {
        return null;
    }
    if (start.equals(goal)) {
        return [];
    }

    const dist = new Map<string, number>([[start.toKey(), 0]]);
    const prev = new Map<string, GridCoord>();
    const settled = new Set<string>();
    /** 待处理队列。规模小，线性取最小值即可，无需堆。 */
    const frontier: GridCoord[] = [start];

    while (frontier.length > 0) {
        // 取当前距离最小的格
        let bestIndex = 0;
        for (let i = 1; i < frontier.length; i += 1) {
            const a = dist.get(frontier[i]!.toKey()) ?? Infinity;
            const b = dist.get(frontier[bestIndex]!.toKey()) ?? Infinity;
            if (a < b) {
                bestIndex = i;
            }
        }
        const current = frontier.splice(bestIndex, 1)[0]!;
        const currentKey = current.toKey();

        if (settled.has(currentKey)) {
            continue;
        }
        settled.add(currentKey);

        if (current.equals(goal)) {
            break;
        }

        // neighbors() 顺序固定，保证同成本时路径可复现
        for (const next of current.neighbors()) {
            if (!isInBounds(next, bounds)) {
                continue;
            }
            const nextKey = next.toKey();
            if (settled.has(nextKey)) {
                continue;
            }
            const cost = costAt(next);
            if (cost === null) {
                continue;
            }

            const candidate = (dist.get(currentKey) ?? Infinity) + cost;
            if (candidate < (dist.get(nextKey) ?? Infinity)) {
                dist.set(nextKey, candidate);
                prev.set(nextKey, current);
                frontier.push(next);
            }
        }
    }

    if (!dist.has(goal.toKey())) {
        return null;
    }

    // 回溯路径
    const path: GridCoord[] = [];
    let cursor: GridCoord | undefined = goal;
    while (cursor && !cursor.equals(start)) {
        path.unshift(cursor);
        cursor = prev.get(cursor.toKey());
    }
    return path;
}
