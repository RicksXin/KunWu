import { _decorator, Component } from 'cc';
import { CAMP_HALL_INSTALL_PATHS } from 'db://assets/scripts/domain/CampSceneContract';
import { CampBottomHudPresenter } from './CampBottomHudPresenter';
import { CampBuildingPresenter } from './CampBuildingPresenter';
import { CampHudPresenter } from './CampHudPresenter';
import { CampPanoramaController } from './CampPanoramaController';
import { campNode } from '../shared/CampViewUtils';

const { ccclass } = _decorator;

/**
 * 旧 Camp.scene 的兼容安装器。
 *
 * 正式职责已经拆给独立页面组件；这里保留原脚本 UUID，只为旧场景安装大厅内的
 * 四个组件。NPC 与设置 Presenter 已挂在各自 Prefab 根节点，不能再装到 SafeAreaRoot。
 */
@ccclass('CampPresenter')
export class CampPresenter extends Component {
    protected override onLoad(): void {
        const worldViewport = campNode(this.node, CAMP_HALL_INSTALL_PATHS.panorama);
        const buildingLayer = campNode(this.node, CAMP_HALL_INSTALL_PATHS.buildings);
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
    }
}
