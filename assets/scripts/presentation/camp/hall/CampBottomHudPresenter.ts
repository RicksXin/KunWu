import { _decorator, Color, Component, Sprite, Widget } from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import {
    CAMP_SYSTEM_ENTRY_FEEDBACK,
    CAMP_SYSTEM_ENTRY_IDS,
} from 'db://assets/scripts/domain/CampBottomHud';
import type { CampSystemEntryId } from 'db://assets/scripts/domain/CampBottomHud';
import type { CampHudViewModel } from 'db://assets/scripts/services/camp/CampApplicationModels';
import {
    CAMP_BOTTOM_HUD_PATHS,
    campSystemEntryPath,
} from 'db://assets/scripts/domain/CampSceneContract';
import { EntryActivationGate } from 'db://assets/scripts/domain/HallPanorama';
import {
    bindCampButton,
    campLabel,
    campNode,
    disposeCampBindings,
    warnCampTouchTarget,
} from 'db://assets/scripts/presentation/camp/shared/CampViewUtils';

const { ccclass } = _decorator;

/** 底部 HUD：系统快捷入口与右下灵石余额。 */
@ccclass('CampBottomHudPresenter')
export class CampBottomHudPresenter extends Component {
    private readonly disposers: (() => void)[] = [];
    private readonly activationGate = new EntryActivationGate();

    protected override onLoad(): void {
        const app = AppRoot.instance;
        this.disposers.push(
            app.events.on<CampHudViewModel>('camp.hudChanged', (model) => this.render(model)),
            app.events.on('wallet.changed', () => this.requestRefresh()),
            app.events.on('profile.loaded', () => this.requestRefresh()),
            app.events.on<{ pageId: string }>('router.pageChanged', ({ pageId }) => {
                if (pageId === 'camp') {
                    this.requestRefresh();
                }
            }),
        );
        this.configureVisuals();

        // 按 id 而非下标绑定：两份平行数组一旦顺序不一致，点「成就」会打开设置。
        for (const entryId of CAMP_SYSTEM_ENTRY_IDS) {
            const node = campNode(this.node, campSystemEntryPath(entryId));
            bindCampButton(this, node, () => this.activateEntry(entryId), this.disposers);
            warnCampTouchTarget(node, `底部系统入口 ${entryId}`);
        }
    }

    protected override start(): void {
        this.render(AppRoot.instance.campHud.current);
        this.requestRefresh();
    }

    protected override onDestroy(): void {
        disposeCampBindings(this.disposers);
    }

    private activateEntry(entryId: CampSystemEntryId): CampSystemEntryId | null {
        if (!this.activationGate.tryActivate(`system_${entryId}`, Date.now())) {
            return null;
        }
        const app = AppRoot.instance;
        const entry = app.campHud.current?.systemEntries[entryId] ?? null;
        if (!entry) {
            app.showFeedback('入口状态尚未加载');
            this.requestRefresh();
            return null;
        }
        if (!entry.enabled) {
            const fallback = entryId === 'settings'
                ? '设置暂不可用'
                : CAMP_SYSTEM_ENTRY_FEEDBACK[entryId];
            app.showFeedback(entry.unavailableReason ?? fallback);
            return entryId;
        }
        if (entryId === 'settings') {
            app.events.emit('camp.settingsRequested', {});
            return entryId;
        }
        app.showFeedback(CAMP_SYSTEM_ENTRY_FEEDBACK[entryId]);
        return entryId;
    }

    private render(model: CampHudViewModel | null): void {
        for (const entryId of CAMP_SYSTEM_ENTRY_IDS) {
            const entryNode = campNode(this.node, campSystemEntryPath(entryId));
            if (entryNode) {
                const entry = model?.systemEntries[entryId] ?? null;
                entryNode.active = entry ? !entry.hidden : entryId === 'settings';
                const icon = entryNode.getChildByName('Label')?.getComponent(Sprite);
                if (icon) {
                    icon.type = Sprite.Type.SIMPLE;
                    icon.grayscale = entry ? !entry.enabled : entryId !== 'settings';
                }
            }
        }
        const label = campLabel(this.node, CAMP_BOTTOM_HUD_PATHS.immortalCoinValue);
        if (!label) {
            return;
        }
        if (!model) {
            label.string = '--';
            return;
        }
        label.string = formatHudNumber(model.spiritStoneBalance);
    }

    private configureVisuals(): void {
        const widget = this.node.getComponent(Widget);
        if (widget) {
            widget.bottom = 69.12;
            widget.updateAlignment();
        }
        const currencyIcon = campNode(
            this.node,
            'BottomRightCurrency/ImmortalCoinIcon',
        )?.getComponent(Sprite);
        currencyIcon && (currencyIcon.type = Sprite.Type.SIMPLE);
        const value = campLabel(this.node, CAMP_BOTTOM_HUD_PATHS.immortalCoinValue);
        if (value) {
            value.fontSize = 35;
            value.lineHeight = 69;
            value.isBold = true;
            value.color = new Color(232, 220, 187, 255);
        }
    }

    private requestRefresh(): void {
        void AppRoot.instance.campHud.refresh()
            .then((model) => {
                if (this.node.isValid) this.render(model);
            })
            .catch((error) => {
                console.error('[底部 HUD] 数据刷新失败', error);
            });
    }
}

const HUD_NUMBER_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function formatHudNumber(value: number): string {
    return HUD_NUMBER_FORMAT.format(Math.trunc(value));
}
