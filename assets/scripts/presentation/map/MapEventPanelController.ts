import { Button, Label, Node } from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import type {
    DemoMapDefinition,
    DemoMapObjectDefinition,
} from 'db://assets/scripts/domain/map/DemoMapDefinition';
import type { DemoMapEventActionId } from 'db://assets/scripts/domain/map/DemoMapEvents';
import type { MapSceneNodes } from 'db://assets/scripts/presentation/map/MapSceneView';

export interface MapEventPanelHost {
    readonly nodes: MapSceneNodes;
    readonly getMap: () => DemoMapDefinition | null;
    readonly refresh: () => void;
}

/** 地图事件统一交互层；只调度操作，不持有地图业务真相。 */
export class MapEventPanelController {
    private readonly host: MapEventPanelHost;
    private currentObject: DemoMapObjectDefinition | null = null;
    private busy = false;

    constructor(host: MapEventPanelHost) {
        this.host = host;
    }

    get isOpen(): boolean {
        return this.host.nodes.eventRoot.active;
    }

    bind(): void {
        const nodes = this.host.nodes;
        nodes.eventEngageButton.on(Button.EventType.CLICK, this.engage, this);
        nodes.eventInspectButton.on(Button.EventType.CLICK, this.inspect, this);
        nodes.eventTalkButton.on(Button.EventType.CLICK, this.talk, this);
        nodes.eventOperateButton.on(Button.EventType.CLICK, this.operate, this);
        nodes.eventSmallTalkButton.on(Button.EventType.CLICK, this.smallTalk, this);
        nodes.eventLeaveButton.on(Button.EventType.CLICK, this.leave, this);
    }

    unbind(): void {
        const nodes = this.host.nodes;
        nodes.eventEngageButton.off(Button.EventType.CLICK, this.engage, this);
        nodes.eventInspectButton.off(Button.EventType.CLICK, this.inspect, this);
        nodes.eventTalkButton.off(Button.EventType.CLICK, this.talk, this);
        nodes.eventOperateButton.off(Button.EventType.CLICK, this.operate, this);
        nodes.eventSmallTalkButton.off(Button.EventType.CLICK, this.smallTalk, this);
        nodes.eventLeaveButton.off(Button.EventType.CLICK, this.leave, this);
    }

    open(object: DemoMapObjectDefinition): void {
        this.currentObject = object;
        this.host.nodes.eventKindLabel.string = eventKindName(object);
        this.host.nodes.eventTitle.string = object.title;
        this.host.nodes.eventMessage.string = object.description;
        this.renderActions(object.eventActions, object);
        this.host.nodes.eventRoot.active = true;
    }

    handleBack(): boolean {
        if (!this.isOpen) return false;
        this.leave();
        return true;
    }

    private readonly engage = (): void => {
        const map = this.host.getMap();
        const object = this.currentObject;
        if (!map || !object || this.busy) return;
        AppRoot.instance.events.emit('map.encounterTriggered', {
            mapId: map.id,
            objectId: object.id,
            enemyId: object.enemyId ?? object.id,
        });
        AppRoot.instance.showFeedback('战斗场景尚未接入');
    };

    private readonly inspect = (): void => {
        const map = this.host.getMap();
        const object = this.currentObject;
        const expedition = AppRoot.instance.state.require().expedition;
        if (!map || !object || !expedition || this.busy) return;
        if ((expedition.carriedItems.lens ?? 0) <= 0) {
            AppRoot.instance.showFeedback('未携带探灵镜，无法探查敌情');
            return;
        }
        const result = object.inspectionText ?? '对方气机混沌，暂无法辨明更多底细。';
        this.host.nodes.eventMessage.string = `${object.description}\n\n探灵结果：${result}`;
        AppRoot.instance.events.emit('map.enemyInspected', {
            mapId: map.id,
            objectId: object.id,
            enemyId: object.enemyId ?? object.id,
        });
    };

    private readonly talk = (): void => {
        const map = this.host.getMap();
        const object = this.currentObject;
        if (!map || !object || this.busy) return;
        const line = object.dialogueText ?? '对方暂未回应，这段剧情尚待接入。';
        this.host.nodes.eventMessage.string = `${object.description}\n\n${line}`;
        AppRoot.instance.events.emit('map.dialogueRequested', {
            mapId: map.id,
            objectId: object.id,
        });
    };

    private readonly smallTalk = (): void => {
        const map = this.host.getMap();
        const object = this.currentObject;
        if (!map || !object || this.busy) return;
        const line = object.smallTalkText ?? '你与对方闲谈片刻，并未获得新的线索。';
        this.host.nodes.eventMessage.string = `${object.description}\n\n${line}`;
        AppRoot.instance.events.emit('map.smallTalkRequested', {
            mapId: map.id,
            objectId: object.id,
        });
    };

    private readonly operate = (): void => {
        void this.performOperation();
    };

    private async performOperation(): Promise<void> {
        const map = this.host.getMap();
        const object = this.currentObject;
        if (!map || !object || this.busy) return;
        const expedition = AppRoot.instance.state.require().expedition;
        if (!expedition) return;
        if (object.requiredItemId && (expedition.carriedItems[object.requiredItemId] ?? 0) <= 0) {
            const itemName = object.requiredItemName ?? '所需法器';
            AppRoot.instance.showFeedback(`未携带${itemName}，无法${operationLabel(object)}`);
            return;
        }
        if (object.kind === 'dungeon_entrance') {
            AppRoot.instance.events.emit('map.dungeonEntryRequested', {
                mapId: map.id,
                objectId: object.id,
            });
            AppRoot.instance.showFeedback('秘境交接尚未接入');
            return;
        }
        if (object.kind === 'resource_node') {
            AppRoot.instance.events.emit('map.resourceOperationRequested', {
                mapId: map.id,
                objectId: object.id,
            });
            AppRoot.instance.showFeedback('采集结算尚未接入');
            return;
        }
        this.busy = true;
        const result = await AppRoot.instance.map.resolveObject(map, object);
        this.busy = false;
        if (!result.ok) {
            AppRoot.instance.showFeedback(result.message);
            return;
        }
        if (!result.resolved) {
            AppRoot.instance.showFeedback('此处已无可取之物');
            this.renderActions(['leave'], object);
            return;
        }
        this.host.refresh();
        this.host.nodes.eventMessage.string = operationResultText(object);
        this.renderActions(['leave'], object);
    }

    private readonly leave = (): void => {
        if (this.busy) return;
        this.host.nodes.eventRoot.active = false;
        this.currentObject = null;
    };

    private renderActions(
        actions: readonly DemoMapEventActionId[],
        object: DemoMapObjectDefinition,
    ): void {
        const entries = actionEntries(this.host.nodes);
        entries.forEach(({ node }) => { node.active = false; });
        const visible = actions.map((action) => entries.find((entry) => entry.action === action)!);
        visible.forEach((entry, index) => {
            const row = Math.floor(index / 3);
            const rowStart = row * 3;
            const rowCount = Math.min(3, visible.length - rowStart);
            const column = index - rowStart;
            entry.node.setPosition((column - (rowCount - 1) / 2) * 103, row === 0 ? -96 : -151);
            entry.node.active = true;
        });
        setButtonText(this.host.nodes.eventOperateButton, operationLabel(object));
    }
}

function actionEntries(nodes: MapSceneNodes): readonly {
    readonly action: DemoMapEventActionId;
    readonly node: Node;
}[] {
    return [
        { action: 'engage', node: nodes.eventEngageButton },
        { action: 'inspect', node: nodes.eventInspectButton },
        { action: 'talk', node: nodes.eventTalkButton },
        { action: 'operate', node: nodes.eventOperateButton },
        { action: 'small_talk', node: nodes.eventSmallTalkButton },
        { action: 'leave', node: nodes.eventLeaveButton },
    ];
}

function eventKindName(object: DemoMapObjectDefinition): string {
    if (object.kind === 'enemy_group' || object.kind.startsWith('boss_')) return '敌情';
    if (object.kind === 'npc') return '人物';
    if (object.kind === 'resource_node') return '资源点';
    if (object.kind === 'treasure_chest') return '遗物';
    if (object.kind === 'dungeon_entrance') return '秘境入口';
    if (object.kind === 'attribute_check') return '机缘检定';
    return '奇遇';
}

function operationLabel(object: DemoMapObjectDefinition): string {
    if (object.operationLabel) return object.operationLabel;
    if (object.kind === 'resource_node') return '开采';
    if (object.kind === 'treasure_chest') return '开启';
    if (object.kind === 'dungeon_entrance') return '进入';
    return '处理';
}

function operationResultText(object: DemoMapObjectDefinition): string {
    if (!object.reward) return `${object.description}\n\n操作已完成。`;
    return [
        object.description,
        `获得：${object.reward.itemName} ×${object.reward.amount}`,
        '已收入本次入山所得，安全归营后入库。',
    ].join('\n');
}

function setButtonText(node: Node, text: string): void {
    const label = node.getChildByName('Label')?.getComponent(Label);
    if (label) label.string = text;
}
