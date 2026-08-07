import { Button, Color, Label, Node, Sprite, SpriteFrame } from 'cc';
import type { P1LingPuJob } from 'db://assets/scripts/domain/LingPu';
import type { CampModalPanelFrame } from 'db://assets/scripts/presentation/camp/shared/CampModalPanelFrame';
import { applyCampResizableButtonStyle } from 'db://assets/scripts/presentation/camp/shared/CampResizableButtonStyle';

export const TEXT_PRIMARY = new Color(232, 220, 187, 255);
export const TEXT_SECONDARY = new Color(145, 164, 158, 255);
export const TEXT_WARNING = new Color(185, 74, 62, 255);

export type LingPuResourceRowId = P1LingPuJob | 'spiritCrystal' | 'gengJing';

export interface LingPuResourceRowDefinition {
    readonly id: LingPuResourceRowId;
    readonly job: P1LingPuJob | null;
    readonly name: string;
}

export const RESOURCE_NAMES: Readonly<Record<LingPuResourceRowId, string>> = {
    spiritGrain: '灵粮',
    spiritWood: '灵木',
    darkIron: '玄铁',
    spiritCrystal: '灵晶',
    gengJing: '庚精',
};

export const RESOURCE_ICON_PATHS: Readonly<Record<LingPuResourceRowId, string>> = {
    spiritGrain: 'ui/top/icon_resource_spirit_grain/spriteFrame',
    spiritWood: 'ui/top/icon_resource_spirit_wood/spriteFrame',
    darkIron: 'ui/top/icon_resource_dark_iron/spriteFrame',
    spiritCrystal: 'ui/top/icon_resource_spirit_crystal/spriteFrame',
    gengJing: 'ui/top/icon_resource_geng_jing/spriteFrame',
};

export const RESOURCE_ROW_DEFINITIONS: readonly LingPuResourceRowDefinition[] = [
    { id: 'spiritGrain', job: 'spiritGrain', name: RESOURCE_NAMES.spiritGrain },
    { id: 'spiritWood', job: 'spiritWood', name: RESOURCE_NAMES.spiritWood },
    { id: 'darkIron', job: 'darkIron', name: RESOURCE_NAMES.darkIron },
    { id: 'spiritCrystal', job: null, name: RESOURCE_NAMES.spiritCrystal },
    { id: 'gengJing', job: null, name: RESOURCE_NAMES.gengJing },
];

export interface VisualBackground {
    readonly node: Node;
    readonly sprite: Sprite;
}

export interface ButtonView {
    readonly node: Node;
    readonly button: Button;
    readonly visual: VisualBackground;
    readonly label: Label | null;
}

export interface ResourceRowView {
    readonly root: Node;
    readonly background: VisualBackground;
    readonly warningOutline: Node;
    readonly icon: Sprite;
    readonly name: Label;
    readonly stock: Label;
    readonly rate: Label;
    readonly workers: Label;
    readonly status: Label;
    readonly minus: ButtonView;
    readonly plus: ButtonView;
    readonly upgrade: ButtonView;
}

export interface ResourceRowRenderState {
    readonly stock: number;
    readonly capacity: number;
    readonly workerCount: number;
    readonly workerLimit: number;
    readonly displayedProduction: number;
    readonly isFull: boolean;
    readonly isShutdown: boolean;
    readonly hasIdleWorker: boolean;
    readonly isMaxLevel: boolean;
}

export class LingPuResourceRowComponent {
    readonly id: LingPuResourceRowId;
    readonly job: P1LingPuJob | null;
    readonly view: ResourceRowView;

    constructor(definition: LingPuResourceRowDefinition, view: ResourceRowView) {
        this.id = definition.id;
        this.job = definition.job;
        this.view = view;
    }

    renderActive(state: ResourceRowRenderState): void {
        const row = this.view;
        row.root.active = true;
        row.stock.string = `储量： ${state.stock} / ${state.capacity}`;
        row.workers.string = `${state.workerCount}/${state.workerLimit}`;
        row.rate.string = `产量 ${signed(state.displayedProduction)}`;
        row.rate.color = (state.displayedProduction < 0 ? TEXT_WARNING : TEXT_SECONDARY).clone();
        const states: string[] = [];
        if (state.isFull) states.push('已满仓');
        if (state.isShutdown) states.push('灵粮不足·停工');
        row.status.string = states.join(' / ');
        row.status.color = states.length > 0 ? TEXT_WARNING.clone() : TEXT_SECONDARY.clone();
        row.warningOutline.active = false;
        row.minus.button.interactable = state.workerCount > 0;
        row.plus.button.interactable = state.hasIdleWorker
            && state.workerCount < state.workerLimit;
        row.upgrade.button.interactable = !state.isMaxLevel;
        styleInlineButton(row.upgrade, !state.isMaxLevel);
        if (row.upgrade.label) row.upgrade.label.string = state.isMaxLevel ? '已满级' : '升级';
    }

    renderLocked(): void {
        const row = this.view;
        row.root.active = false;
        row.stock.string = 'P2 开放';
        row.rate.string = '产量 +0';
        row.rate.color = TEXT_SECONDARY.clone();
        row.workers.string = '0/0';
        row.status.string = '尚未开放';
        row.status.color = TEXT_SECONDARY.clone();
        row.warningOutline.active = false;
        row.minus.button.interactable = false;
        row.plus.button.interactable = false;
        row.upgrade.button.interactable = false;
        styleInlineButton(row.upgrade, false);
        if (row.upgrade.label) row.upgrade.label.string = '未开放';
    }
}

export type ConfirmationMode =
    | { readonly kind: 'recruit' }
    | { readonly kind: 'upgrade'; readonly job: P1LingPuJob };

export interface LingPuView {
    readonly mount: Node;
    readonly panelRoot: Node;
    readonly backdrop: Node;
    readonly mainPanel: Node;
    readonly contentNodes: readonly Node[];
    readonly panelBackground: VisualBackground;
    modalFrame: CampModalPanelFrame | null;
    readonly titleLabel: Label;
    readonly idleWorkerLabel: Label;
    panelBodyFrame: SpriteFrame | null;
    panelDecorationTopFrame: SpriteFrame | null;
    panelDecorationBottomFrame: SpriteFrame | null;
    readonly timerLabel: Label;
    readonly progressTrack: VisualBackground;
    readonly progressFill: Sprite;
    readonly recruitButton: ButtonView;
    readonly closeButton: ButtonView;
    readonly confirmationRoot: Node;
    readonly confirmationPanel: VisualBackground;
    readonly confirmationTitle: Label;
    readonly confirmationIcon: Sprite;
    readonly confirmationMessage: Label;
    readonly confirmationDetail: Label;
    readonly confirmationError: Label;
    readonly confirmationPrimary: ButtonView;
    readonly confirmationCancel: ButtonView;
    readonly rows: ReadonlyMap<LingPuResourceRowId, LingPuResourceRowComponent>;
    readonly labels: readonly Label[];
    readonly resourceIconFrames: Map<LingPuResourceRowId, SpriteFrame>;
}

export function setText(label: Label | null, value: string): void {
    if (label) label.string = value;
}

export function formatSeconds(value: number): string {
    return `00:${String(Math.max(0, Math.ceil(value))).padStart(2, '0')}`;
}

function signed(value: number): string {
    return value >= 0 ? `+${value}` : String(value);
}

function styleInlineButton(view: ButtonView, enabled: boolean): void {
    const visual = applyCampResizableButtonStyle(
        view.node,
        'inline',
        enabled ? 'default' : 'disabled',
    );
    view.button.target = visual;
    view.button.transition = Button.Transition.SCALE;
    view.button.zoomScale = 0.96;
    view.button.duration = 0.1;
}
