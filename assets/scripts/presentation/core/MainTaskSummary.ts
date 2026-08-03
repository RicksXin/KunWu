import { _decorator, Component, Label } from 'cc';

const { ccclass } = _decorator;

/** 营地与野外地图共用的主线任务单行摘要。 */
@ccclass('MainTaskSummary')
export class MainTaskSummary extends Component {
    private objectiveLabel: Label | null = null;

    bind(label: Label): void {
        this.objectiveLabel = label;
    }

    render(objective: string | null | undefined): void {
        if (!this.objectiveLabel) return;
        this.objectiveLabel.string = objective
            ? `主线：${truncateLine(objective)}`
            : objective === undefined
                ? '主线：--'
                : '暂无主线任务';
    }
}

function truncateLine(text: string, maxCharacters = 24): string {
    return text.length > maxCharacters ? `${text.slice(0, maxCharacters - 1)}…` : text;
}
