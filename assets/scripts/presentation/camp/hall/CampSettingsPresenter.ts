import { _decorator, Component, Node } from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import { CAMP_SETTINGS_PATHS } from 'db://assets/scripts/domain/CampSceneContract';
import {
    bindCampButton,
    campNode,
    disposeCampBindings,
    fitCampPageRoot,
    warnCampTouchTarget,
} from '../shared/CampViewUtils';

const { ccclass } = _decorator;

/** 设置页面壳。组件挂在始终激活的 SettingsPage Prefab 根节点。 */
@ccclass('CampSettingsPresenter')
export class CampSettingsPresenter extends Component {
    private readonly disposers: (() => void)[] = [];
    private panel: Node | null = null;

    protected override onLoad(): void {
        fitCampPageRoot(this, this.disposers);
        this.panel = campNode(this.node, CAMP_SETTINGS_PATHS.panel);
        this.panel && (this.panel.active = false);
        this.disposers.push(
            AppRoot.instance.events.on('camp.settingsRequested', () => this.open()),
        );
        const back = campNode(this.node, CAMP_SETTINGS_PATHS.back);
        bindCampButton(this, back, () => this.close(), this.disposers);
        warnCampTouchTarget(back, '设置页返回');
    }

    protected override onDestroy(): void {
        disposeCampBindings(this.disposers);
    }

    open(): void {
        this.panel && (this.panel.active = true);
    }

    close(): void {
        this.panel && (this.panel.active = false);
    }
}
