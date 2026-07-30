import { _decorator, Component, Label, Node } from 'cc';
import type { Wallet } from '../services/GameState';

const { ccclass, property } = _decorator;

/**
 * 常驻顶部资源栏（PRD-01 §2、任务 P0-HALL-001）。
 *
 * 职责边界：只把 Wallet 的数值显示出来，不做生产结算也不改数据。
 * 数值来源是 GameState，变更经 EventBus 通知——本组件不主动轮询。
 *
 * 常驻显示五种：灵粮、灵木、玄铁、灵石、庚精。
 * 仙铢与魂晶通过展开按钮显示（PRD-01 §2），故不在常驻区。
 */
@ccclass('ResourceBar')
export class ResourceBar extends Component {
    @property(Label)
    spiritGrainLabel: Label | null = null;

    @property(Label)
    spiritWoodLabel: Label | null = null;

    @property(Label)
    darkIronLabel: Label | null = null;

    @property(Label)
    spiritStoneLabel: Label | null = null;

    @property(Label)
    gengJingLabel: Label | null = null;

    /** 展开后显示仙铢与魂晶的容器。 */
    @property(Node)
    expandedGroup: Node | null = null;

    @property(Label)
    immortalCoinLabel: Label | null = null;

    @property(Label)
    soulCrystalLabel: Label | null = null;

    private expanded = false;

    protected override onLoad(): void {
        this.applyExpanded();
    }

    /** 刷新显示。由 Presenter 在 Wallet 变更时调用。 */
    render(wallet: Wallet): void {
        setLabel(this.spiritGrainLabel, wallet.spiritGrain);
        setLabel(this.spiritWoodLabel, wallet.spiritWood);
        setLabel(this.darkIronLabel, wallet.darkIron);
        setLabel(this.spiritStoneLabel, wallet.spiritStone);
        setLabel(this.gengJingLabel, wallet.gengJing);
        setLabel(this.immortalCoinLabel, wallet.immortalCoin);
        setLabel(this.soulCrystalLabel, wallet.soulCrystal);
    }

    /** 切换仙铢／魂晶的展开状态。 */
    toggleExpanded(): void {
        this.expanded = !this.expanded;
        this.applyExpanded();
    }

    private applyExpanded(): void {
        if (this.expandedGroup) {
            this.expandedGroup.active = this.expanded;
        }
    }
}

/**
 * 资源一律整数显示（技术方案 §7）。
 * 用 Math.trunc 而非 toFixed：后者会把 1000 显示成 "1000.0" 之类，
 * 也会在浮点误差下出现 "99.99999"。
 */
function setLabel(label: Label | null, value: number): void {
    if (!label) {
        return;
    }
    label.string = String(Math.trunc(value));
}
