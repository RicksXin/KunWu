import { _decorator, Component, Label } from 'cc';
import type { CampTopResourcesViewModel } from 'db://assets/scripts/services/camp/CampApplicationModels';

const { ccclass, property } = _decorator;

/**
 * 常驻顶部资源栏（PRD-01 §2、任务 P0-HALL-001）。
 *
 * 职责边界：只渲染 Application Service 产出的 ViewModel，不读取存档或 DTO。
 *
 * 常驻顺序为灵粮、灵木、玄铁、灵晶、庚精。
 * 底部灵石（Wallet.immortalCoin）由 CampBottomHudPresenter 独立接线，
 * 不进入本组件，避免和顶部灵晶串用余额。
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

    protected override onLoad(): void {
        this.renderPlaceholder();
    }

    /** 刷新显示。由 Presenter 在 Wallet 变更时调用。 */
    render(resources: CampTopResourcesViewModel): void {
        setLabel(this.spiritGrainLabel, resources.spiritGrain);
        setLabel(this.spiritWoodLabel, resources.spiritWood);
        setLabel(this.darkIronLabel, resources.darkIron);
        setLabel(this.spiritStoneLabel, resources.spiritCrystal);
        setLabel(this.gengJingLabel, resources.gengJing);
    }

    /** 存档未就绪时显示占位符，禁止闪过场景假数值。 */
    renderPlaceholder(): void {
        for (const label of [
            this.spiritGrainLabel,
            this.spiritWoodLabel,
            this.darkIronLabel,
            this.spiritStoneLabel,
            this.gengJingLabel,
        ]) {
            if (label) {
                label.string = '--';
            }
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
