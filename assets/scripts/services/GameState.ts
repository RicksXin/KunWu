/**
 * 当前存档的聚合状态（技术方案 §4.1、§5）。
 *
 * 职责边界：持有玩家数据，不直接操作 UI。
 * UI 通过 Presenter/ViewModel 读取，变更经 EventBus 通知。
 */

// 只作类型使用，必须用 import type：类型擦除不会移除值导入，
// 而 Attributes 是类型别名，运行期没有对应导出。
import type { Attributes } from '../domain/Attributes';
import type { GridCoord } from '../domain/GridCoord';

/** 资源一律用整数，乘法在整数域完成（技术方案 §7）。 */
export interface Wallet {
    /** 灵粮：既是生产成本也是探索步数，本作核心资源。 */
    spiritGrain: number;
    spiritWood: number;
    darkIron: number;
    spiritStone: number;
    gengJing: number;
    soulCrystal: number;
    immortalCoin: number;
}

export interface CampState {
    /** 建筑 ID → 等级。 */
    readonly buildingLevels: Record<string, number>;
    /** 岗位 ID → 分配人数。 */
    readonly workerAssignments: Record<string, number>;
    /** 上次生产结算的 UTC 秒。 */
    lastSettledAtUtc: number;
}

export interface HeroInstance {
    readonly instanceId: string;
    readonly definitionId: string;
    readonly careerId: string;
    level: number;
    /** 七维当前值，含装备加成前的基础值。 */
    readonly attributes: Attributes;
    currentHp: number;
    /** 阵亡后进入还魂名单。 */
    isDead: boolean;
}

export interface ExpeditionState {
    readonly mapId: string;
    position: GridCoord;
    remainingGrain: number;
    /** 已揭露格，用位集或坐标键集合保存（技术方案 §9.3）。 */
    readonly revealedTiles: Set<string>;
    /** 本次出征的临时战利品，战败会遗失。 */
    readonly temporaryLoot: Record<string, number>;
}

export interface Profile {
    readonly wallet: Wallet;
    readonly camp: CampState;
    readonly roster: HeroInstance[];
    readonly inventory: Record<string, number>;
    readonly storyFlags: Record<string, boolean>;
    expedition: ExpeditionState | null;
}

export class GameState {
    private profile: Profile | null = null;

    get isLoaded(): boolean {
        return this.profile !== null;
    }

    /** 未加载存档时访问即抛错，避免默认空对象掩盖流程错误。 */
    require(): Profile {
        if (!this.profile) {
            throw new Error('GameState 尚未加载存档');
        }
        return this.profile;
    }

    load(profile: Profile): void {
        this.profile = profile;
    }

    clear(): void {
        this.profile = null;
    }
}
