import { _decorator, Component } from 'cc';
import { CAMP_HALL_INSTALL_PATHS } from 'db://assets/scripts/domain/CampSceneContract';
import { CampBottomHudPresenter } from './CampBottomHudPresenter';
import { CampBuildingPresenter } from './CampBuildingPresenter';
import { CampHudPresenter } from './CampHudPresenter';
import { CampNpcPresenter } from './CampNpcPresenter';
import { CampPanoramaController } from './CampPanoramaController';
import { CampSettingsPresenter } from './CampSettingsPresenter';
import { campNode } from '../shared/CampViewUtils';

const { ccclass } = _decorator;

/**
 * 旧 Camp.scene 的兼容安装器。
 *
 * 正式职责已经拆给六个页面组件；这里保留原脚本 UUID，让尚未完成 Prefab 迁移的
 * Camp.scene 无需重绑组件。等场景改为独立 Prefab 后可从 Canvas 移除此组件。
 */
@ccclass('CampPresenter')
export class CampPresenter extends Component {
    protected override onLoad(): void {
        const worldViewport = campNode(this.node, CAMP_HALL_INSTALL_PATHS.panorama);
        const buildingLayer = campNode(this.node, CAMP_HALL_INSTALL_PATHS.buildings);
        const safeAreaRoot = campNode(this.node, CAMP_HALL_INSTALL_PATHS.safeAreaRoot);
        const topHud = campNode(this.node, CAMP_HALL_INSTALL_PATHS.topHud);
        const bottomHud = campNode(this.node, CAMP_HALL_INSTALL_PATHS.bottomHud);

        if (worldViewport && !worldViewport.getComponent(CampPanoramaController)) {
            worldViewport.addComponent(CampPanoramaController);
        }
        if (buildingLayer && !buildingLayer.getComponent(CampBuildingPresenter)) {
            buildingLayer.addComponent(CampBuildingPresenter);
        }
        if (topHud && !topHud.getComponent(CampHudPresenter)) {
            topHud.addComponent(CampHudPresenter);
        }
        if (bottomHud && !bottomHud.getComponent(CampBottomHudPresenter)) {
            bottomHud.addComponent(CampBottomHudPresenter);
        }
        if (safeAreaRoot && !safeAreaRoot.getComponent(CampNpcPresenter)) {
            safeAreaRoot.addComponent(CampNpcPresenter);
        }
        if (safeAreaRoot && !safeAreaRoot.getComponent(CampSettingsPresenter)) {
            safeAreaRoot.addComponent(CampSettingsPresenter);
        }
    }
}
