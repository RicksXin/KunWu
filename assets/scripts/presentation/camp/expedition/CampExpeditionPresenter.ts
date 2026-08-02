import {
    _decorator,
    Component,
    EventKeyboard,
    input,
    Input,
    KeyCode,
    Node,
    UITransform,
} from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import type {
    ExpeditionItemId,
    ExpeditionMapOption,
    ExpeditionPreparationConfig,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import {
    CAMP_EXPEDITION_PATHS,
    CAMP_EXPEDITION_ROOT_NODE,
    CAMP_SCENE_NODE_NAMES,
} from 'db://assets/scripts/domain/CampSceneContract';
import type { HeroInstance } from 'db://assets/scripts/services/GameState';
import { campNode } from 'db://assets/scripts/presentation/camp/shared/CampViewUtils';
import {
    adjustExpeditionLoadout,
    toggleExpeditionHero,
    unlockExpeditionParty,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionMutations';
import { renderExpeditionPreparation } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionPreparationView';
import { renderExpeditionHeroSelection } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionHeroSelectionView';
import { renderExpeditionMapSelection } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionMapSelectionView';
import { prepareExpeditionDeparture } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionDeparture';
import { settleExpeditionStamina } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionStamina';
import {
    EXPEDITION_LOGICAL_HEIGHT,
    EXPEDITION_LOGICAL_WIDTH,
    expeditionText,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionTheme';
import { loadExpeditionVisualAssets } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionVisualAssets';
import {
    createEmptyExpeditionVisualAssets,
} from 'db://assets/scripts/presentation/camp/expedition/ExpeditionViewTypes';
import type { ExpeditionVisualAssets } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionViewTypes';

const { ccclass } = _decorator;

/** 营地传送阵唤起的入山整备页面协调器。 */
@ccclass('CampExpeditionPresenter')
export class CampExpeditionPresenter extends Component {
    private config: ExpeditionPreparationConfig | null = null;
    private preparationLayer: Node | null = null;
    private selectionLayer: Node | null = null;
    private mapLayer: Node | null = null;
    private visualAssets: ExpeditionVisualAssets = createEmptyExpeditionVisualAssets();
    private visualLoadStarted = false;
    private saveQueue: Promise<void> = Promise.resolve();

    static showFrom(owner: Component): void {
        const canvas = owner.node.scene?.getChildByName(CAMP_SCENE_NODE_NAMES.canvas) ?? null;
        const mount = canvas?.getChildByName(CAMP_SCENE_NODE_NAMES.safeAreaRoot) ?? canvas;
        if (!mount) {
            AppRoot.instance.showFeedback('入山整备面板挂载失败');
            return;
        }
        const host = mount.getChildByName(CAMP_EXPEDITION_ROOT_NODE);
        if (!host) {
            AppRoot.instance.showFeedback('入山整备 Prefab 尚未挂载');
            return;
        }
        host.active = true;
        (host.getComponent(CampExpeditionPresenter) ?? host.addComponent(CampExpeditionPresenter)).open();
    }

    protected override onLoad(): void {
        this.syncLogicalScale();
        this.node.parent?.on(Node.EventType.SIZE_CHANGED, this.syncLogicalScale, this);
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        this.schedule(this.tickStamina, 1);
        this.bindShell();
        void this.loadVisualAssets();
    }

    protected override onDestroy(): void {
        this.node.parent?.off(Node.EventType.SIZE_CHANGED, this.syncLogicalScale, this);
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        this.unschedule(this.tickStamina);
    }

    open(): void {
        const app = AppRoot.instance;
        this.config = app.getExpeditionPreparationConfig();
        if (!this.config || !app.state.isLoaded) {
            app.showFeedback('入山配置尚未就绪');
            return;
        }
        this.node.active = true;
        this.node.setSiblingIndex((this.node.parent?.children.length ?? 1) - 1);
        if (this.selectionLayer) this.selectionLayer.active = false;
        if (this.mapLayer) this.mapLayer.active = false;
        this.settleStamina();
        this.renderPreparation();
    }

    close(): void {
        this.node.active = false;
        if (this.selectionLayer) this.selectionLayer.active = false;
        if (this.mapLayer) this.mapLayer.active = false;
    }

    private readonly syncLogicalScale = (): void => {
        const size = this.node.parent?.getComponent(UITransform)?.contentSize;
        if (!size) return;
        const scale = Math.min(
            size.width / EXPEDITION_LOGICAL_WIDTH,
            size.height / EXPEDITION_LOGICAL_HEIGHT,
        );
        this.node.setScale(scale, scale, 1);
        this.node.setPosition(0, 0, 0);
    };

    private bindShell(): void {
        this.preparationLayer = campNode(this.node, CAMP_EXPEDITION_PATHS.preparation);
        this.selectionLayer = campNode(this.node, CAMP_EXPEDITION_PATHS.heroSelection);
        this.mapLayer = campNode(this.node, CAMP_EXPEDITION_PATHS.mapSelection);
        if (this.selectionLayer) this.selectionLayer.active = false;
        if (this.mapLayer) this.mapLayer.active = false;
    }

    private renderPreparation(): void {
        const app = AppRoot.instance;
        if (!this.preparationLayer || !this.config || !app.state.isLoaded) return;
        renderExpeditionPreparation(this.node, this.config, app.state.require(), this.visualAssets, {
            editParty: () => this.openHeroSelection(),
            switchParty: (presetId) => this.switchParty(presetId),
            unlockParty: (index) => this.unlockParty(index),
            adjustLoadout: (itemId, delta) => this.adjustLoadout(itemId, delta),
            restoreStamina: () => app.showFeedback('调息功能暂未开放'),
            adventure: () => app.showFeedback('历练功能暂未开放'),
            chooseMap: () => this.openMapSelection(),
            close: () => this.close(),
        });
    }

    private switchParty(presetId: string): void {
        const profile = AppRoot.instance.state.require();
        profile.expeditionPreparation.activePresetId = presetId;
        this.queueSave('切换队伍');
        this.renderPreparation();
    }

    private unlockParty(index: number): void {
        const app = AppRoot.instance;
        if (!this.config || !app.state.isLoaded) return;
        const profile = app.state.require();
        const result = unlockExpeditionParty(profile, this.config, index);
        if (result.walletChanged) app.events.emit('wallet.changed', { wallet: profile.wallet });
        if (result.changed) {
            this.queueSave('解锁队伍');
            this.renderPreparation();
        }
        result.message && app.showFeedback(result.message);
    }

    private adjustLoadout(itemId: ExpeditionItemId, delta: number): void {
        const app = AppRoot.instance;
        if (!this.config || !app.state.isLoaded) return;
        const result = adjustExpeditionLoadout(app.state.require(), this.config, itemId, delta);
        if (result.message) app.showFeedback(result.message);
        if (!result.changed) return;
        this.queueSave('调整入山物资');
        this.renderPreparation();
    }

    private openHeroSelection(): void {
        const app = AppRoot.instance;
        if (!this.selectionLayer || !app.state.isLoaded) return;
        renderExpeditionHeroSelection(this.node, app.state.require(), this.visualAssets, {
            toggleHero: (hero) => this.toggleHero(hero),
            close: () => {
                if (this.selectionLayer) this.selectionLayer.active = false;
                this.renderPreparation();
            },
        });
    }

    private toggleHero(hero: HeroInstance): void {
        const app = AppRoot.instance;
        const result = toggleExpeditionHero(app.state.require(), hero);
        if (result.message) app.showFeedback(result.message);
        if (!result.changed) return;
        this.queueSave('编辑队伍');
        this.openHeroSelection();
    }

    private openMapSelection(): void {
        const app = AppRoot.instance;
        if (!this.mapLayer || !this.config || !app.state.isLoaded) return;
        renderExpeditionMapSelection(
            this.node,
            app.state.require(),
            this.config.maps,
            this.visualAssets,
            {
                selectMap: (map) => this.selectMap(map),
                close: () => {
                    if (this.mapLayer) this.mapLayer.active = false;
                },
            },
        );
    }

    private selectMap(map: ExpeditionMapOption): void {
        const app = AppRoot.instance;
        if (!app.state.isLoaded || !this.config) return;
        const profile = app.state.require();
        const departure = prepareExpeditionDeparture(profile, this.config, map);
        if (!departure.ok) {
            app.showFeedback(departure.message, 3);
            return;
        }
        app.events.emit('expedition.mapSelected', {
            mapId: map.mapId,
            partyPresetId: departure.partyPresetId,
            staminaCost: map.staminaCost,
            loadout: departure.loadout,
        });
        app.showFeedback(`${expeditionText(map.nameKey)}已选定；地图场景尚未接入`, 3);
    }

    private async loadVisualAssets(): Promise<void> {
        if (this.visualLoadStarted) return;
        this.visualLoadStarted = true;
        const assets = await loadExpeditionVisualAssets();
        if (!this.node.isValid) return;
        this.visualAssets = assets;
        if (!this.node.active) return;
        this.renderPreparation();
        if (this.selectionLayer?.active) this.openHeroSelection();
        if (this.mapLayer?.active) this.openMapSelection();
    }

    private settleStamina(): void {
        const app = AppRoot.instance;
        if (!app.state.isLoaded || !this.config) return;
        const profile = app.state.require();
        const result = settleExpeditionStamina(profile, this.config, app.time.nowUtcSeconds());
        if (!result.changed) return;
        this.queueSave('灵息自然恢复');
        if (result.recovered > 0) app.events.emit('heroes.staminaChanged', { recovered: result.recovered });
    }

    private readonly tickStamina = (): void => {
        if (!this.node.active) return;
        const app = AppRoot.instance;
        const before = app.state.isLoaded
            ? app.state.require().roster.reduce((sum, hero) => sum + hero.stamina, 0)
            : 0;
        this.settleStamina();
        const after = app.state.isLoaded
            ? app.state.require().roster.reduce((sum, hero) => sum + hero.stamina, 0)
            : before;
        if (after === before) return;
        this.renderPreparation();
        if (this.selectionLayer?.active) this.openHeroSelection();
    };

    private queueSave(reason: string): void {
        const app = AppRoot.instance;
        this.saveQueue = this.saveQueue.then(() => app.saveCurrentProfile()).catch((error: unknown) => {
            console.error(`[入山整备] ${reason}保存失败`, error);
            app.showFeedback('入山整备保存失败');
        });
    }

    private readonly onKeyDown = (event: EventKeyboard): void => {
        if (!this.node.active || event.keyCode !== KeyCode.ESCAPE) return;
        if (this.mapLayer?.active) {
            this.mapLayer.active = false;
        } else if (this.selectionLayer?.active) {
            this.selectionLayer.active = false;
            this.renderPreparation();
        } else {
            this.close();
        }
    };
}
