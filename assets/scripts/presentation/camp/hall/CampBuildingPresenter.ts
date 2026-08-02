import { _decorator, Button, Component } from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import {
    BUILDING_IDS,
    computeBadges,
    isBuildingUsable,
    resolveBuildingStates,
} from 'db://assets/scripts/domain/HallBadges';
import type { BuildingId, BuildingState, PendingAction } from 'db://assets/scripts/domain/HallBadges';
import {
    CAMP_BUILDING_PATHS,
    campBuildingPath,
} from 'db://assets/scripts/domain/CampSceneContract';
import { EntryActivationGate } from 'db://assets/scripts/domain/HallPanorama';
import { CampPanoramaController } from './CampPanoramaController';
import { CampExpeditionPresenter } from '../expedition/CampExpeditionPresenter';
import {
    applyCampBuildingVisualState,
    bindCampButton,
    campLabel,
    campNode,
    disposeCampBindings,
    warnCampTouchTarget,
} from '../shared/CampViewUtils';

const { ccclass } = _decorator;

/** 七座建筑、传送阵、建筑状态与红点。组件挂在 BuildingLayer。 */
@ccclass('CampBuildingPresenter')
export class CampBuildingPresenter extends Component {
    private readonly disposers: (() => void)[] = [];
    private readonly activationGate = new EntryActivationGate();
    private panorama: CampPanoramaController | null = null;
    private buildingStates: Readonly<Record<BuildingId, BuildingState>> = resolveBuildingStates({}, {});

    protected override onLoad(): void {
        this.panorama = this.node.parent?.parent?.getComponent(CampPanoramaController) ?? null;
        const app = AppRoot.instance;
        this.disposers.push(
            app.events.on('profile.loaded', () => this.renderAll()),
            app.events.on('story.changed', () => this.renderAll()),
            app.events.on('camp.badgesChanged', () => this.renderBadges([])),
            app.events.on<{ pageId: string }>('router.pageChanged', ({ pageId }) => {
                if (pageId === 'camp') {
                    this.renderAll();
                }
            }),
        );

        BUILDING_IDS.forEach((buildingId, index) => {
            const node = campNode(this.node, campBuildingPath(buildingId));
            bindCampButton(this, node, () => this.activateBuilding(index), this.disposers);
            warnCampTouchTarget(node, `建筑 ${buildingId}`);
        });
        const expedition = campNode(this.node, CAMP_BUILDING_PATHS.expedition);
        bindCampButton(this, expedition, () => this.activateExpedition(), this.disposers);
        warnCampTouchTarget(expedition, '入山入口');
    }

    protected override start(): void {
        this.renderAll();
    }

    protected override onDestroy(): void {
        disposeCampBindings(this.disposers);
    }

    renderBadges(
        actions: readonly PendingAction[],
        acknowledgedBatches: readonly string[] = [],
    ): void {
        const shown = new Set(computeBadges(actions, acknowledgedBatches).primaryBadges);
        for (const buildingId of BUILDING_IDS) {
            const badge = campNode(this.node, campBuildingPath(buildingId, 'Badge'));
            badge && (badge.active = shown.has(buildingId));
        }
    }

    private renderAll(): void {
        const app = AppRoot.instance;
        if (!app.state.isLoaded) {
            return;
        }
        const profile = app.state.require();
        this.buildingStates = resolveBuildingStates(
            profile.camp.buildingLevels,
            profile.storyFlags,
        );
        for (const buildingId of BUILDING_IDS) {
            const node = campNode(this.node, campBuildingPath(buildingId));
            node && applyCampBuildingVisualState(node, buildingId, this.buildingStates[buildingId]);
            const button = node?.getComponent(Button);
            button && (button.interactable = true);
            const label = campLabel(this.node, campBuildingPath(buildingId, 'State'));
            label && (label.string = BUILDING_STATE_NAMES[this.buildingStates[buildingId]]);
        }
    }

    private activateBuilding(index: number): BuildingId | null {
        if (this.panorama?.isBuildingClickSuppressed()) {
            return null;
        }
        const buildingId = BUILDING_IDS[index];
        if (!buildingId || !this.activationGate.tryActivate(buildingId, Date.now())) {
            return null;
        }
        const app = AppRoot.instance;
        const state = this.buildingStates[buildingId];
        app.events.emit('building.selected', { buildingId });
        if (!isBuildingUsable(state)) {
            app.showFeedback(BUILDING_STATE_FEEDBACK[state]);
            return buildingId;
        }
        if (buildingId === 'yi_shi_dian') {
            app.events.emit('camp.npcListRequested', {});
            return buildingId;
        }
        if (buildingId === 'ling_pu') {
            app.events.emit('camp.lingPuRequested', {});
            return buildingId;
        }
        app.showFeedback(`${BUILDING_NAMES[buildingId]}页面尚未开放`);
        return buildingId;
    }

    private activateExpedition(): void {
        if (this.panorama?.isBuildingClickSuppressed()) {
            return;
        }
        if (!this.activationGate.tryActivate('expedition', Date.now())) {
            return;
        }
        const app = AppRoot.instance;
        app.events.emit('expedition.requested', {});
        CampExpeditionPresenter.showFrom(this);
    }
}

const BUILDING_NAMES: Readonly<Record<BuildingId, string>> = {
    yi_shi_dian: '议事殿',
    ling_pu: '灵圃',
    zhao_xian_tai: '招贤馆',
    bai_bao_ku: '百宝库',
    lian_qi_fang: '炼器坊',
    jiao_yi_hang: '交易行',
    huan_hun_tan: '还魂殿',
};

const BUILDING_STATE_NAMES: Readonly<Record<BuildingState, string>> = {
    LOCKED: '未解锁',
    AVAILABLE: '可解锁',
    UNLOCKED: '可进入',
    UPGRADABLE: '可升级',
    UPGRADING: '升级中',
    MAX_LEVEL: '已满级',
    DISABLED: '暂不可用',
};

const BUILDING_STATE_FEEDBACK: Readonly<Record<BuildingState, string>> = {
    LOCKED: '尚未解锁，请继续推进主线',
    AVAILABLE: '已满足解锁条件，请前往议事殿交谈',
    UNLOCKED: '可进入',
    UPGRADABLE: '可升级',
    UPGRADING: '正在升级',
    MAX_LEVEL: '已达当前最高等级',
    DISABLED: '当前暂不可用',
};
