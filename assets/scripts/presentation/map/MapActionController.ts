import { Button } from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import type { ExpeditionPreparationConfig } from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { DemoMapDefinition } from 'db://assets/scripts/domain/map/DemoMapDefinition';
import {
    renderBackpackOverlay,
    renderRestOverlay,
} from 'db://assets/scripts/presentation/map/MapOverlayView';
import type { MapSceneNodes } from 'db://assets/scripts/presentation/map/MapSceneView';

export interface MapActionControllerHost {
    readonly nodes: MapSceneNodes;
    readonly getMap: () => DemoMapDefinition | null;
    readonly getConfig: () => ExpeditionPreparationConfig | null;
    readonly refresh: () => void;
}

export class MapActionController {
    private readonly host: MapActionControllerHost;
    private returning = false;

    constructor(host: MapActionControllerHost) {
        this.host = host;
    }

    bind(): void {
        const nodes = this.host.nodes;
        nodes.restButton.on(Button.EventType.CLICK, this.openRest, this);
        nodes.returnButton.on(Button.EventType.CLICK, this.returnToCamp, this);
        nodes.partyButton.on(Button.EventType.CLICK, this.openParty, this);
        nodes.backpackButton.on(Button.EventType.CLICK, this.openBackpack, this);
        nodes.settingsButton.on(Button.EventType.CLICK, this.openSettings, this);
        nodes.replenishButton.on(Button.EventType.CLICK, this.replenish, this);
        nodes.healButton.on(Button.EventType.CLICK, this.heal, this);
        nodes.continueButton.on(Button.EventType.CLICK, this.continueExploration, this);
        nodes.backpackCloseButton.on(Button.EventType.CLICK, this.closeBackpack, this);
        nodes.entryReturnConfirmButton.on(Button.EventType.CLICK, this.confirmEntryReturn, this);
        nodes.entryReturnCancelButton.on(Button.EventType.CLICK, this.cancelEntryReturn, this);
    }

    unbind(): void {
        const nodes = this.host.nodes;
        nodes.restButton.off(Button.EventType.CLICK, this.openRest, this);
        nodes.returnButton.off(Button.EventType.CLICK, this.returnToCamp, this);
        nodes.partyButton.off(Button.EventType.CLICK, this.openParty, this);
        nodes.backpackButton.off(Button.EventType.CLICK, this.openBackpack, this);
        nodes.settingsButton.off(Button.EventType.CLICK, this.openSettings, this);
        nodes.replenishButton.off(Button.EventType.CLICK, this.replenish, this);
        nodes.healButton.off(Button.EventType.CLICK, this.heal, this);
        nodes.continueButton.off(Button.EventType.CLICK, this.continueExploration, this);
        nodes.backpackCloseButton.off(Button.EventType.CLICK, this.closeBackpack, this);
        nodes.entryReturnConfirmButton.off(Button.EventType.CLICK, this.confirmEntryReturn, this);
        nodes.entryReturnCancelButton.off(Button.EventType.CLICK, this.cancelEntryReturn, this);
    }

    get blocksMapInput(): boolean {
        return this.returning
            || this.host.nodes.restRoot.active
            || this.host.nodes.backpackRoot.active
            || this.host.nodes.entryReturnRoot.active;
    }

    syncOverlays(): void {
        const expedition = AppRoot.instance.state.require().expedition;
        const config = this.host.getConfig();
        if (!expedition || !config) return;
        renderRestOverlay(expedition, config, this.host.nodes);
        if (this.host.nodes.backpackRoot.active) {
            renderBackpackOverlay(expedition, this.host.nodes);
        }
    }

    handleBack(): boolean {
        if (this.host.nodes.entryReturnRoot.active) {
            this.cancelEntryReturn();
            return true;
        }
        if (this.host.nodes.backpackRoot.active) {
            this.closeBackpack();
            return true;
        }
        if (this.host.nodes.restRoot.active) {
            AppRoot.instance.showFeedback('请点击“结束休整”继续探索');
            return true;
        }
        return false;
    }

    promptEntryReturn(): void {
        this.host.nodes.entryReturnRoot.active = true;
    }

    private readonly openRest = (): void => {
        void this.runRestAction(() => AppRoot.instance.mapRest.enter());
    };

    private readonly replenish = (): void => {
        const config = this.host.getConfig();
        if (config) void this.runRestAction(() => AppRoot.instance.mapRest.replenish(config));
    };

    private readonly heal = (): void => {
        const config = this.host.getConfig();
        if (config) void this.runRestAction(() => AppRoot.instance.mapRest.heal(config));
    };

    private readonly continueExploration = (): void => {
        void this.runRestAction(() => AppRoot.instance.mapRest.continueExploration());
    };

    private async runRestAction(
        action: () => Promise<{ readonly ok: boolean; readonly message: string }>,
    ): Promise<void> {
        const result = await action();
        AppRoot.instance.showFeedback(result.message);
        this.host.refresh();
    }

    private readonly returnToCamp = (): void => {
        void this.performReturn();
    };

    private async performReturn(): Promise<void> {
        const map = this.host.getMap();
        const config = this.host.getConfig();
        if (!map || !config || this.returning) return;
        const expedition = AppRoot.instance.state.require().expedition;
        if (!expedition) return;
        this.returning = true;
        const talismanId = config.field.returnTalismanItemId;
        const result = await AppRoot.instance.map.returnWithTalisman(map, talismanId);
        this.returning = false;
        if (!result.ok) {
            AppRoot.instance.showFeedback(result.message);
            return;
        }
        await AppRoot.instance.router.replaceRoot({ pageId: 'camp' }, 'fade');
    }

    private readonly openParty = (): void => {
        AppRoot.instance.showFeedback('队伍功能待定');
    };

    private readonly openSettings = (): void => {
        AppRoot.instance.showFeedback('设置功能待定');
    };

    private readonly openBackpack = (): void => {
        const expedition = AppRoot.instance.state.require().expedition;
        if (!expedition) return;
        renderBackpackOverlay(expedition, this.host.nodes);
        this.host.nodes.backpackRoot.active = true;
    };

    private readonly closeBackpack = (): void => {
        this.host.nodes.backpackRoot.active = false;
    };

    private readonly confirmEntryReturn = (): void => {
        void this.performEntryReturn();
    };

    private async performEntryReturn(): Promise<void> {
        const map = this.host.getMap();
        if (!map || this.returning) return;
        this.returning = true;
        const result = await AppRoot.instance.map.returnToCamp(map);
        this.returning = false;
        if (!result.ok) {
            AppRoot.instance.showFeedback(result.message);
            return;
        }
        this.host.nodes.entryReturnRoot.active = false;
        await AppRoot.instance.router.replaceRoot({ pageId: 'camp' }, 'fade');
    }

    private readonly cancelEntryReturn = (): void => {
        if (this.returning) return;
        this.host.nodes.entryReturnRoot.active = false;
    };
}
