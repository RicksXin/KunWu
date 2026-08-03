import { BlockInputEvents, Color, HorizontalTextAlignment, Label, Node } from 'cc';
import type { CombatLootPanelView } from 'db://assets/scripts/services/combat/CombatApplicationModels';
import { combatText } from './CombatText';
import {
    combatButton,
    combatLabel,
    combatPanel,
    setCombatButtonEnabled,
} from './CombatUiPrimitives';

export interface CombatLootSceneNodes {
    readonly lootRoot: Node;
    readonly lootBurdenLabel: Label;
    readonly lootStatusLabel: Label;
    readonly lootBackpackButtons: readonly Node[];
    readonly lootBackpackLabels: readonly Label[];
    readonly lootRewardLabels: readonly Label[];
    readonly lootTakeAllButton: Node;
    readonly lootLeaveButton: Node;
}

export function buildCombatLootOverlay(root: Node): CombatLootSceneNodes {
    const lootRoot = combatPanel(root, 'LootOverlay', 0, 0, 375, 817, new Color(3, 6, 9, 218));
    lootRoot.addComponent(BlockInputEvents);
    const panel = combatPanel(
        lootRoot, 'LootPanel', 0, 8, 335, 530,
        new Color(24, 29, 30, 255), new Color(154, 126, 72, 255), 6,
    );
    combatLabel(panel, 'Title', '战利品', 0, 232, 290, 34, 23, new Color(237, 221, 173));
    const burden = combatLabel(
        panel, 'Burden', '当前负重 --/--', 0, 202, 290, 24, 13, new Color(205, 213, 193),
    );
    const backpack = combatPanel(
        panel, 'BackpackSection', 0, 92, 303, 190,
        new Color(17, 23, 24, 255), new Color(82, 101, 91, 255), 4,
    );
    combatLabel(backpack, 'Heading', '当前野外背包', -82, 76, 125, 22, 13, undefined,
        HorizontalTextAlignment.LEFT);
    combatLabel(
        backpack, 'Hint', '点击物品可丢弃 1 个并释放负重', 45, 76, 160, 20, 10,
        new Color(143, 154, 143), HorizontalTextAlignment.RIGHT,
    );
    const backpackRows = [44, 15, -14, -43, -72].map((y, index) => {
        const row = combatButton(backpack, `Backpack_${index}`, '空', 0, y, 277, 25, 11);
        row.label.horizontalAlign = HorizontalTextAlignment.LEFT;
        return row;
    });
    const rewards = combatPanel(
        panel, 'RewardSection', 0, -92, 303, 150,
        new Color(17, 23, 24, 255), new Color(82, 101, 91, 255), 4,
    );
    combatLabel(
        rewards, 'Heading', '本场战利品', -82, 56, 125, 22, 13, undefined,
        HorizontalTextAlignment.LEFT,
    );
    const rewardLabels = [28, 3, -22, -47].map((y, index) => combatLabel(
        rewards, `Reward_${index}`, '', 0, y, 273, 22, 11,
        new Color(213, 205, 170), HorizontalTextAlignment.LEFT,
    ));
    const status = combatLabel(
        panel, 'Status', '', 0, -190, 295, 34, 11, new Color(168, 194, 166),
    );
    const takeAll = combatButton(panel, 'TakeAll', '全部拾取', -78, -231, 134, 44, 13);
    const leave = combatButton(panel, 'Leave', '离开', 78, -231, 134, 44, 13);
    lootRoot.active = false;
    return {
        lootRoot,
        lootBurdenLabel: burden,
        lootStatusLabel: status,
        lootBackpackButtons: backpackRows.map((row) => row.node),
        lootBackpackLabels: backpackRows.map((row) => row.label),
        lootRewardLabels: rewardLabels,
        lootTakeAllButton: takeAll.node,
        lootLeaveButton: leave.node,
    };
}

export function renderCombatLootPanel(
    nodes: CombatLootSceneNodes,
    view: CombatLootPanelView,
): void {
    nodes.lootBurdenLabel.string = `当前负重 ${view.currentBurden}/${view.burdenLimit}`;
    nodes.lootBackpackButtons.forEach((button, index) => {
        const entry = view.backpack[index];
        button.active = Boolean(entry);
        if (!entry) return;
        nodes.lootBackpackLabels[index]!.string =
            `  ${combatText(entry.nameKey)} ×${entry.amount}    单重 ${entry.unitWeight}`;
    });
    if (view.backpack.length === 0) {
        nodes.lootBackpackButtons[0]!.active = true;
        nodes.lootBackpackLabels[0]!.string = '  背包为空';
        setCombatButtonEnabled(nodes.lootBackpackButtons[0]!, false);
    }
    const currencyLine = view.soulCrystalReward > 0
        ? `魂晶 +${view.soulCrystalReward}${view.soulCrystalGranted ? '（已获得）' : '（正在结算）'}`
        : null;
    const rewardLines = [
        ...(currencyLine ? [currencyLine] : []),
        ...view.rewards.map((entry) =>
            `${combatText(entry.nameKey)} ×${entry.amount}    重量 ${entry.amount * entry.unitWeight}`),
    ];
    nodes.lootRewardLabels.forEach((label, index) => {
        const line = rewardLines[index];
        label.node.active = Boolean(line);
        if (line) label.string = line;
    });
    if (rewardLines.length === 0) {
        nodes.lootRewardLabels[0]!.node.active = true;
        nodes.lootRewardLabels[0]!.string = '本场没有可拾取物品';
    }
    nodes.lootStatusLabel.string = view.canTakeAll
        ? `全部拾取后：${view.projectedBurden}/${view.burdenLimit}`
        : `全部拾取后：${view.projectedBurden}/${view.burdenLimit}，请先丢弃物品`;
    nodes.lootStatusLabel.color = view.canTakeAll
        ? new Color(168, 194, 166)
        : new Color(235, 139, 111);
    nodes.lootRoot.active = true;
}

export function setCombatLootBusy(
    nodes: CombatLootSceneNodes,
    busy: boolean,
    view: CombatLootPanelView,
): void {
    setCombatButtonEnabled(nodes.lootTakeAllButton, !busy);
    setCombatButtonEnabled(nodes.lootLeaveButton, !busy);
    nodes.lootBackpackButtons.forEach((button, index) => {
        if (button.active) setCombatButtonEnabled(button, !busy && Boolean(view.backpack[index]));
    });
}
