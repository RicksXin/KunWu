import { _decorator, Component, Node } from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import {
    availableCampNpcs,
    completeCampNpcDialogue,
    dialogueForCampNpc,
} from 'db://assets/scripts/domain/CampNpcs';
import type { CampNpcId } from 'db://assets/scripts/domain/CampNpcs';
import { EntryActivationGate } from 'db://assets/scripts/domain/HallPanorama';
import { CAMP_NPC_PATHS } from 'db://assets/scripts/domain/CampSceneContract';
import {
    bindCampButton,
    campLabel,
    campNode,
    disposeCampBindings,
    fitCampPageRoot,
    warnCampTouchTarget,
} from './CampViewUtils';

const { ccclass } = _decorator;

/** NPC 列表与对话页面。组件挂在始终激活的 NpcPage Prefab 根节点。 */
@ccclass('CampNpcPresenter')
export class CampNpcPresenter extends Component {
    private readonly disposers: (() => void)[] = [];
    private readonly activationGate = new EntryActivationGate();
    private listPanel: Node | null = null;
    private dialogPanel: Node | null = null;
    private activeNpcId: CampNpcId | null = null;
    private dialogueLines: readonly string[] = [];
    private dialogueIndex = 0;

    protected override onLoad(): void {
        fitCampPageRoot(this, this.disposers);
        this.listPanel = campNode(this.node, CAMP_NPC_PATHS.listPanel);
        this.dialogPanel = campNode(this.node, CAMP_NPC_PATHS.dialogPanel);
        this.listPanel && (this.listPanel.active = false);
        this.dialogPanel && (this.dialogPanel.active = false);

        const app = AppRoot.instance;
        this.disposers.push(
            app.events.on('camp.npcListRequested', () => this.openList()),
            app.events.on('profile.loaded', () => this.renderNpcList()),
            app.events.on('story.changed', () => this.renderNpcList()),
        );

        const npc = campNode(this.node, CAMP_NPC_PATHS.cenShouyi);
        const listBack = campNode(this.node, CAMP_NPC_PATHS.listBack);
        const dialogBack = campNode(this.node, CAMP_NPC_PATHS.dialogBack);
        const dialogNext = campNode(this.node, CAMP_NPC_PATHS.dialogNext);
        bindCampButton(this, npc, () => this.openCenShouyi(), this.disposers);
        bindCampButton(this, listBack, () => this.closeList(), this.disposers);
        bindCampButton(this, dialogBack, () => this.backToList(), this.disposers);
        bindCampButton(this, dialogNext, () => this.advanceDialogue(), this.disposers);
        warnCampTouchTarget(npc, '岑守一人物项');
        warnCampTouchTarget(listBack, '人物列表返回');
        warnCampTouchTarget(dialogBack, '对话返回');
        warnCampTouchTarget(dialogNext, '对话继续');
    }

    protected override onDestroy(): void {
        disposeCampBindings(this.disposers);
    }

    openList(): void {
        this.dialogPanel && (this.dialogPanel.active = false);
        this.listPanel && (this.listPanel.active = true);
        this.renderNpcList();
    }

    closeList(): void {
        this.dialogPanel && (this.dialogPanel.active = false);
        this.listPanel && (this.listPanel.active = false);
    }

    private renderNpcList(): void {
        const app = AppRoot.instance;
        if (!app.state.isLoaded) {
            return;
        }
        const npc = availableCampNpcs(app.state.require().storyFlags)[0];
        const button = campNode(this.node, CAMP_NPC_PATHS.cenShouyi);
        if (!npc) {
            button && (button.active = false);
            return;
        }
        button && (button.active = true);
        const name = campLabel(this.node, CAMP_NPC_PATHS.cenShouyiName);
        const role = campLabel(this.node, CAMP_NPC_PATHS.cenShouyiRole);
        const status = campLabel(this.node, CAMP_NPC_PATHS.cenShouyiStatus);
        name && (name.string = npc.name);
        role && (role.string = npc.role);
        status && (status.string = npc.status);
    }

    private openCenShouyi(): void {
        if (!this.activationGate.tryActivate('npc_cen_shouyi', Date.now())) {
            return;
        }
        const app = AppRoot.instance;
        if (!app.state.isLoaded) {
            return;
        }
        this.activeNpcId = 'npc_cen_shouyi';
        this.dialogueLines = dialogueForCampNpc(
            this.activeNpcId,
            app.state.require().storyFlags,
        );
        this.dialogueIndex = 0;
        this.listPanel && (this.listPanel.active = false);
        this.dialogPanel && (this.dialogPanel.active = true);
        this.renderDialogueLine();
    }

    private advanceDialogue(): void {
        if (!this.activationGate.tryActivate('npc_dialog_next', Date.now())) {
            return;
        }
        if (this.dialogueIndex + 1 < this.dialogueLines.length) {
            this.dialogueIndex += 1;
            this.renderDialogueLine();
            return;
        }
        this.finishDialogue();
    }

    private backToList(): void {
        this.activeNpcId = null;
        this.dialogueLines = [];
        this.dialogueIndex = 0;
        this.dialogPanel && (this.dialogPanel.active = false);
        this.listPanel && (this.listPanel.active = true);
        this.renderNpcList();
    }

    private renderDialogueLine(): void {
        const text = campLabel(this.node, CAMP_NPC_PATHS.dialogText);
        const next = campLabel(this.node, CAMP_NPC_PATHS.dialogNextLabel);
        text && (text.string = this.dialogueLines[this.dialogueIndex] ?? '……');
        next &&
            (next.string =
                this.dialogueIndex + 1 >= this.dialogueLines.length ? '完成' : '继续');
    }

    private finishDialogue(): void {
        const npcId = this.activeNpcId;
        const app = AppRoot.instance;
        if (!npcId || !app.state.isLoaded) {
            this.backToList();
            return;
        }
        const profile = app.state.require();
        const wasMet = profile.storyFlags.met_cen_shou_yi === true;
        Object.assign(profile.storyFlags, completeCampNpcDialogue(npcId, profile.storyFlags));
        app.events.emit('story.changed', { npcId });
        app.events.emit('camp.badgesChanged', {});
        if (!wasMet) {
            void app.saveCurrentProfile().catch((error: unknown) => {
                console.error('[CampNpcPresenter] 保存岑守一对话进度失败', error);
                app.showFeedback('剧情进度保存失败');
            });
            app.showFeedback('营地交接已完成');
        }
        this.backToList();
    }
}
