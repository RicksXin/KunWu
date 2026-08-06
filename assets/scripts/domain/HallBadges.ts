/**
 * 营地红点与建筑状态（PRD-01 §5、§7、任务 P0-HALL-001）。
 *
 * 纯逻辑、无引擎依赖。红点规则看着简单，但有几条很容易写反：
 *   - 红点只表示「有可执行动作」，不表示「有可查看信息」
 *   - 资源不足、未满足条件**不**产生红点
 *   - 同屏最多三个一级红点，其余收纳到建筑内部
 * 把这些做成可单测的函数，避免各处 UI 各自判断导致规则漂移。
 */

/** 建筑状态机（PRD-01 §5）。 */
export const BUILDING_STATES = [
    'LOCKED',
    'AVAILABLE',
    'UNLOCKED',
    'UPGRADABLE',
    'UPGRADING',
    'MAX_LEVEL',
    'DISABLED',
] as const;
export type BuildingState = (typeof BUILDING_STATES)[number];

/** 七座建筑（PRD-01 §2、PRD-02 §4）。 */
export const BUILDING_IDS = [
    'yi_shi_dian',
    'ling_pu',
    'zhao_xian_tai',
    'bai_bao_ku',
    'lian_qi_fang',
    'jiao_yi_hang',
    'huan_hun_tan',
] as const;
export type BuildingId = (typeof BUILDING_IDS)[number];

/** 底部导航（PRD-01 §2）。顺序即显示顺序。 */
export const BOTTOM_NAV_ITEMS = ['camp', 'heroes', 'inventory', 'quests', 'expedition'] as const;
export type BottomNavItem = (typeof BOTTOM_NAV_ITEMS)[number];

/** 同屏一级红点上限（PRD-01 §7）。 */
export const MAX_PRIMARY_BADGES = 3;

/**
 * 一条待处理动作。
 * 只有「可执行」的动作才配红点——可查看的信息不算。
 */
export interface PendingAction {
    readonly buildingId: BuildingId;
    /** 动作类型，用于同建筑内合并。 */
    readonly actionId: string;
    /**
     * 是否真的可执行。资源不足或条件未满足时为 false，
     * 此时不产生红点（PRD-01 §7）。
     */
    readonly isActionable: boolean;
    /** 优先级，越大越先占用一级红点名额。 */
    readonly priority: number;
    /** 同一批只提醒一次的动作（如招贤馆高灵根候选）需给出批次 ID。 */
    readonly batchId?: string;
}

export interface BadgeState {
    /** 显示一级红点的建筑，已按优先级截断到上限。 */
    readonly primaryBadges: readonly BuildingId[];
    /** 超出上限、需收纳到建筑内部的建筑。 */
    readonly collapsedBadges: readonly BuildingId[];
}

/**
 * 建筑是否可交互。
 * LOCKED 与 DISABLED 不可点；AVAILABLE 可点以触发解锁（PRD-01 §5）。
 */
export function isBuildingInteractive(state: BuildingState): boolean {
    return state !== 'LOCKED' && state !== 'DISABLED';
}

/** 建筑是否已能正常使用（区别于仅可解锁）。 */
export function isBuildingUsable(state: BuildingState): boolean {
    return state === 'UNLOCKED' || state === 'UPGRADABLE' || state === 'MAX_LEVEL';
}

/** 零级建筑满足剧情条件后进入 AVAILABLE，否则为 LOCKED。 */
const BUILDING_UNLOCK_FLAGS: Partial<Record<BuildingId, string>> = {
    zhao_xian_tai: 'unlock_zhao_xian_tai',
    lian_qi_fang: 'unlock_lian_qi_fang',
    jiao_yi_hang: 'unlock_jiao_yi_hang',
    huan_hun_tan: 'unlock_huan_hun_tan',
};

/**
 * 根据存档等级和剧情 Flag 解析七建筑状态。
 * UI 不推断章节名，只消费稳定 ID。
 */
export function resolveBuildingStates(
    buildingLevels: Readonly<Record<string, number>>,
    storyFlags: Readonly<Record<string, boolean>>,
): Readonly<Record<BuildingId, BuildingState>> {
    return Object.fromEntries(
        BUILDING_IDS.map((buildingId) => {
            if ((buildingLevels[buildingId] ?? 0) > 0) {
                return [buildingId, 'UNLOCKED'];
            }
            const unlockFlag = BUILDING_UNLOCK_FLAGS[buildingId];
            return [buildingId, unlockFlag && storyFlags[unlockFlag] ? 'AVAILABLE' : 'LOCKED'];
        }),
    ) as unknown as Readonly<Record<BuildingId, BuildingState>>;
}

/**
 * 计算红点分布。
 *
 * @param actions 全部待处理动作
 * @param acknowledgedBatches 已提醒过的批次 ID，用于「同一批只提醒一次」
 */
export function computeBadges(
    actions: readonly PendingAction[],
    acknowledgedBatches: readonly string[] = [],
): BadgeState {
    const acknowledged = new Set(acknowledgedBatches);

    // 每个建筑只留优先级最高的一条——同一建筑只显示一个总红点（PRD-01 §7）
    const byBuilding = new Map<BuildingId, PendingAction>();
    for (const action of actions) {
        if (!action.isActionable) {
            continue;
        }
        if (action.batchId && acknowledged.has(action.batchId)) {
            continue;
        }
        const existing = byBuilding.get(action.buildingId);
        if (!existing || action.priority > existing.priority) {
            byBuilding.set(action.buildingId, action);
        }
    }

    // 优先级降序；同优先级按建筑声明顺序，保证结果可复现
    const declarationOrder = new Map(BUILDING_IDS.map((id, index) => [id, index]));
    const sorted = Array.from(byBuilding.values()).sort((a, b) => {
        if (b.priority !== a.priority) {
            return b.priority - a.priority;
        }
        return (
            (declarationOrder.get(a.buildingId) ?? 0) - (declarationOrder.get(b.buildingId) ?? 0)
        );
    });

    return {
        primaryBadges: sorted.slice(0, MAX_PRIMARY_BADGES).map((action) => action.buildingId),
        collapsedBadges: sorted.slice(MAX_PRIMARY_BADGES).map((action) => action.buildingId),
    };
}

/**
 * 还魂坛存在未处理死亡修士时必须提示（PRD-01 §7）。
 * 这条是强制的，不受同屏上限约束——玩家不处理会一直缺人。
 */
export function requiresRevivalBadge(deadHeroCount: number): boolean {
    return deadHeroCount > 0;
}
