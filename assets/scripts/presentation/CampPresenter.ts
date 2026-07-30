import { _decorator, Component, Node, Button, UITransform } from 'cc';
import { AppRoot } from '../AppRoot';
import { ResourceBar } from './ResourceBar';
import {
    BOTTOM_NAV_ITEMS,
    BUILDING_IDS,
    computeBadges,
    isBuildingInteractive,
} from '../domain/HallBadges';
import type { BottomNavItem, BuildingId, BuildingState, PendingAction } from '../domain/HallBadges';
import { meetsTouchTarget, MIN_TOUCH_TARGET_DP } from '../domain/ViewportLayout';

const { ccclass, property } = _decorator;

/**
 * 营地大厅（PRD-01、任务 P0-HALL-001）。
 *
 * 职责边界：只做「读状态 → 更新节点」与「收集点击 → 转交路由」，
 * 不含红点规则（在 HallBadges，20 个单测）也不含资源计算。
 *
 * 建筑按钮与导航按钮的可点击性由 domain 判定，
 * 避免 UI 自行推断章节名称（PRD-01 §5 明确禁止）。
 */
@ccclass('CampPresenter')
export class CampPresenter extends Component {
    @property(ResourceBar)
    resourceBar: ResourceBar | null = null;

    /** 七座建筑的节点，顺序须与 BUILDING_IDS 一致。 */
    @property([Node])
    buildingNodes: Node[] = [];

    /** 底部导航五个按钮，顺序须与 BOTTOM_NAV_ITEMS 一致。 */
    @property([Node])
    bottomNavNodes: Node[] = [];

    /** 红点节点，与 buildingNodes 一一对应。 */
    @property([Node])
    badgeNodes: Node[] = [];

    private disposers: (() => void)[] = [];

    protected override onLoad(): void {
        const app = AppRoot.instance;

        // 钱包变化时刷新资源栏。不轮询——EventBus 推送即可
        this.disposers.push(
            app.events.on('wallet.changed', () => this.renderWallet()),
            app.events.on('camp.badgesChanged', () => this.renderBadges([])),
        );

        this.renderWallet();
        this.bindButtons();
        this.warnUndersizedTouchTargets();
    }

    protected override onDestroy(): void {
        for (const dispose of this.disposers) {
            dispose();
        }
        this.disposers = [];
    }

    private renderWallet(): void {
        const app = AppRoot.instance;
        if (!app.state.isLoaded) {
            return;
        }
        this.resourceBar?.render(app.state.require().wallet);
    }

    /** 按 domain 计算结果显示红点。超出上限的收纳进建筑内部。 */
    renderBadges(actions: readonly PendingAction[], acknowledgedBatches: readonly string[] = []): void {
        const { primaryBadges } = computeBadges(actions, acknowledgedBatches);
        const shown = new Set<BuildingId>(primaryBadges);

        this.badgeNodes.forEach((node, index) => {
            const buildingId = BUILDING_IDS[index];
            if (!node || !buildingId) {
                return;
            }
            node.active = shown.has(buildingId);
        });
    }

    /** 应用建筑状态：LOCKED/DISABLED 不可点（PRD-01 §5）。 */
    applyBuildingStates(states: Readonly<Record<BuildingId, BuildingState>>): void {
        this.buildingNodes.forEach((node, index) => {
            const buildingId = BUILDING_IDS[index];
            if (!node || !buildingId) {
                return;
            }
            const button = node.getComponent(Button);
            if (button) {
                button.interactable = isBuildingInteractive(states[buildingId]);
            }
        });
    }

    /** 底部导航点击。索引对应 BOTTOM_NAV_ITEMS。 */
    onNavClicked(index: number): BottomNavItem | null {
        const item = BOTTOM_NAV_ITEMS[index];
        if (!item) {
            return null;
        }
        const app = AppRoot.instance;
        app.events.emit('nav.selected', { item });
        app.showFeedback(NAV_FEEDBACK[item]);
        return item;
    }

    /** 七座建筑点击。页面未接入前也必须给出反馈。 */
    onBuildingClicked(index: number): BuildingId | null {
        const buildingId = BUILDING_IDS[index];
        if (!buildingId) {
            return null;
        }
        const app = AppRoot.instance;
        app.events.emit('building.selected', { buildingId });
        app.showFeedback(`${BUILDING_NAMES[buildingId]}尚未开放`);
        return buildingId;
    }

    /**
     * 场景生成器只需维护节点引用，点击在运行时统一绑定。
     * 这样新增入口不会因为漏配 Component.EventHandler 而“点了没反应”。
     */
    private bindButtons(): void {
        this.buildingNodes.forEach((node, index) => {
            const handler = (): void => {
                this.onBuildingClicked(index);
            };
            node.on(Button.EventType.CLICK, handler, this);
            this.disposers.push(() => node.off(Button.EventType.CLICK, handler, this));
        });

        this.bottomNavNodes.forEach((node, index) => {
            const handler = (): void => {
                this.onNavClicked(index);
            };
            node.on(Button.EventType.CLICK, handler, this);
            this.disposers.push(() => node.off(Button.EventType.CLICK, handler, this));
        });
    }

    /**
     * 触控区域自检（PRD-09 §4：最小 48×48dp）。
     *
     * 只警告不修正：自动放大会破坏美术排版，
     * 但静默放过会让移动端玩家点不中。
     */
    private warnUndersizedTouchTargets(): void {
        const check = (node: Node | null, label: string): void => {
            const transform = node?.getComponent(UITransform);
            if (!transform) {
                return;
            }
            const { width, height } = transform.contentSize;
            if (!meetsTouchTarget(width, height)) {
                console.warn(
                    `[CampPresenter] ${label} 触控区域 ${width}×${height} ` +
                        `小于 ${MIN_TOUCH_TARGET_DP}×${MIN_TOUCH_TARGET_DP}dp（PRD-09 §4）`,
                );
            }
        };

        this.bottomNavNodes.forEach((node, index) => check(node, `导航按钮 ${index}`));
        this.buildingNodes.forEach((node, index) => check(node, `建筑按钮 ${index}`));
    }
}

const BUILDING_NAMES: Readonly<Record<BuildingId, string>> = {
    yi_shi_dian: '议事殿',
    ling_pu: '灵圃',
    zhao_xian_tai: '招贤台',
    bai_bao_ku: '百宝库',
    lian_qi_fang: '炼器坊',
    jiao_yi_hang: '交易行',
    huan_hun_tan: '还魂坛',
};

const NAV_FEEDBACK: Readonly<Record<BottomNavItem, string>> = {
    camp: '已在营地',
    heroes: '修士页面尚未开放',
    inventory: '背包页面尚未开放',
    quests: '任务页面尚未开放',
    expedition: '出征准备尚未开放',
};
