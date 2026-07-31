import { _decorator, Component } from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import {
    CAMP_SYSTEM_ENTRY_FEEDBACK,
    CAMP_SYSTEM_ENTRY_IDS,
    campCurrencyBalances,
} from 'db://assets/scripts/domain/CampBottomHud';
import type { CampSystemEntryId } from 'db://assets/scripts/domain/CampBottomHud';
import { EntryActivationGate } from 'db://assets/scripts/domain/HallPanorama';
import {
    bindCampButton,
    campLabel,
    campNode,
    disposeCampBindings,
    warnCampTouchTarget,
} from './CampViewUtils';

const { ccclass } = _decorator;

const SYSTEM_BUTTON_NAMES = [
    'SettingsButton',
    'AchievementsButton',
    'LeaderboardButton',
    'MailButton',
    'DailyProgressButton',
] as const;

/** 底部 HUD：系统快捷入口与右下灵石余额。 */
@ccclass('CampBottomHudPresenter')
export class CampBottomHudPresenter extends Component {
    private readonly disposers: (() => void)[] = [];
    private readonly activationGate = new EntryActivationGate();

    protected override onLoad(): void {
        const app = AppRoot.instance;
        this.disposers.push(
            app.events.on('wallet.changed', () => this.renderWallet()),
            app.events.on('profile.loaded', () => this.renderWallet()),
            app.events.on<{ pageId: string }>('router.pageChanged', ({ pageId }) => {
                if (pageId === 'camp') {
                    this.renderWallet();
                }
            }),
        );

        SYSTEM_BUTTON_NAMES.forEach((buttonName, index) => {
            const node = campNode(this.node, `BottomLeftSlots/${buttonName}`);
            bindCampButton(this, node, () => this.activateEntry(index), this.disposers);
            warnCampTouchTarget(node, `底部系统入口 ${buttonName}`);
        });
    }

    protected override start(): void {
        this.renderWallet();
    }

    protected override onDestroy(): void {
        disposeCampBindings(this.disposers);
    }

    private activateEntry(index: number): CampSystemEntryId | null {
        const entryId = CAMP_SYSTEM_ENTRY_IDS[index];
        if (!entryId || !this.activationGate.tryActivate(`system_${entryId}`, Date.now())) {
            return null;
        }
        const app = AppRoot.instance;
        if (entryId === 'settings') {
            app.events.emit('camp.settingsRequested', {});
            return entryId;
        }
        app.showFeedback(CAMP_SYSTEM_ENTRY_FEEDBACK[entryId]);
        return entryId;
    }

    private renderWallet(): void {
        const label = campLabel(this.node, 'BottomRightCurrency/ImmortalCoinValue');
        if (!label) {
            return;
        }
        const app = AppRoot.instance;
        if (!app.state.isLoaded) {
            label.string = '--';
            return;
        }
        const balances = campCurrencyBalances(app.state.require().wallet);
        label.string = String(Math.trunc(balances.bottomSpiritStone));
    }
}
