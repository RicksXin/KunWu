import { Button, Color, SpriteFrame, UIOpacity } from 'cc';
import { SIMULATION_TICK_HZ } from 'db://assets/scripts/domain/CombatTypes';
import type { CombatOutcome, CombatUnit } from 'db://assets/scripts/domain/CombatState';
import type { CombatSessionView } from 'db://assets/scripts/services/combat/CombatApplicationModels';
import type { CombatSceneNodes } from './CombatSceneView';
import { combatStatusText, combatText } from './CombatText';
import { createCombatUnitView, setUnitPortrait } from './CombatUnitView';
import type { CombatUnitView } from './CombatUnitView';
import { setCombatButtonEnabled } from './CombatUiPrimitives';

export function createCombatUnitViews(
    nodes: CombatSceneNodes,
    session: CombatSessionView,
): Map<number, CombatUnitView> {
    const result = new Map<number, CombatUnitView>();
    const allies = session.snapshot.units.filter((unit) => unit.side === 'ally');
    const enemies = session.snapshot.units.filter((unit) => unit.side === 'enemy');
    allies.forEach((unit, index) => {
        const view = createCombatUnitView(
            nodes.allyLayer,
            unit.unitId,
            true,
            slotX(index, allies.length),
            -235,
        );
        result.set(unit.unitId, view);
    });
    enemies.forEach((unit, index) => {
        const view = createCombatUnitView(
            nodes.enemyLayer,
            unit.unitId,
            false,
            slotX(index, enemies.length),
            150,
        );
        result.set(unit.unitId, view);
    });
    return result;
}

export function applyCombatPortraits(
    session: CombatSessionView,
    views: ReadonlyMap<number, CombatUnitView>,
    portraits: ReadonlyMap<string, SpriteFrame>,
): void {
    session.snapshot.units.forEach((unit) => {
        const view = views.get(unit.unitId);
        const key = session.unitMeta.get(unit.unitId)?.portraitKey;
        if (view && key) setUnitPortrait(view, portraits.get(key) ?? null);
    });
}

export function renderCombat(
    nodes: CombatSceneNodes,
    views: ReadonlyMap<number, CombatUnitView>,
    session: CombatSessionView,
): void {
    nodes.tickLabel.string = `战斗 ${(session.snapshot.tick / SIMULATION_TICK_HZ).toFixed(1)} 秒`;
    nodes.escapeButton.active = session.escapeAvailable;
    session.snapshot.units.forEach((unit) => {
        const view = views.get(unit.unitId);
        if (view) renderUnit(view, unit, session);
    });
    renderSkills(nodes, session);
}

export function renderCombatOutcome(nodes: CombatSceneNodes, outcome: CombatOutcome): void {
    const content: Readonly<Record<CombatOutcome, readonly [string, string, string]>> = {
        ally_win: ['战斗胜利', '残禁石傀已经停止活动。\n结算后可继续探索。', '返回地图'],
        enemy_win: ['全队阵亡', '本次入山队伍失去战斗能力。\n修士将进入还魂殿待处理。', '返回营地'],
        draw: ['战斗僵持', '双方都未能在限定时间内结束战斗。', '退出战斗'],
    };
    const [title, message, button] = content[outcome];
    nodes.resultTitle.string = title;
    nodes.resultMessage.string = message;
    nodes.resultButtonLabel.string = button;
    nodes.resultRoot.active = true;
    nodes.skillRoot.active = false;
    nodes.escapeButton.active = false;
}

function renderUnit(
    view: CombatUnitView,
    unit: CombatUnit,
    session: CombatSessionView,
): void {
    const meta = session.unitMeta.get(unit.unitId);
    const name = combatText(meta?.nameKey ?? unit.nameKey);
    const auto = unit.isDead
        ? '·阵亡'
        : unit.side === 'ally'
        ? session.autoUnitIds.has(unit.unitId) ? '·自' : '·手'
        : '';
    view.nameLabel.string = `${name}${auto}`;
    view.nameLabel.color = unit.side === 'ally'
        ? new Color(204, 235, 227)
        : new Color(246, 213, 187);
    view.raceLabel.string = combatText(meta?.raceKey ?? '--');
    const hpRatio = ratio(unit.currentHp, unit.maxHp);
    view.hpFill.node.setScale(hpRatio, 1, 1);
    view.hpLabel.string = `${unit.currentHp}/${unit.maxHp}`;
    const maximum = session.actionMaximums.get(unit.unitId) ?? Math.max(1, unit.actionTimer);
    const actionRatio = unit.actionTimer === 0 ? 1 : ratio(maximum - unit.actionTimer, maximum);
    view.actionFill.node.setScale(actionRatio, 1, 1);
    view.statusLabel.string = statusSummary(unit);
    const opacity = view.artRoot.getComponent(UIOpacity) ?? view.artRoot.addComponent(UIOpacity);
    opacity.opacity = unit.isDead ? 82 : 255;
    view.nameButton.active = true;
    const button = view.nameButton.getComponent(Button);
    if (button && unit.side === 'ally') button.interactable = !unit.isDead;
}

function renderSkills(nodes: CombatSceneNodes, session: CombatSessionView): void {
    const readyId = session.readyAllyId;
    if (readyId === null || session.snapshot.outcome !== null) {
        nodes.skillRoot.active = false;
        return;
    }
    const unit = session.snapshot.units.find((candidate) => candidate.unitId === readyId);
    if (!unit) {
        nodes.skillRoot.active = false;
        return;
    }
    nodes.skillRoot.active = true;
    unit.skillIds.forEach((skillId, index) => {
        const button = nodes.skillButtons[index];
        const label = nodes.skillLabels[index];
        if (!button || !label) return;
        const definition = session.catalog.skills.get(skillId);
        const cooldown = unit.cooldowns[skillId] ?? 0;
        label.string = cooldown > 0
            ? `${combatText(definition?.nameKey ?? skillId)}\n冷却`
            : combatText(definition?.nameKey ?? skillId);
        setCombatButtonEnabled(button, cooldown === 0);
    });
}

function statusSummary(unit: CombatUnit): string {
    const visible = unit.statuses.slice(0, 3).map((status) => `[${combatStatusText(status.kind)}]`);
    if (unit.tauntStrength > 0 && !unit.statuses.some((status) => status.kind === 'gather_spirit')) {
        visible.unshift('[引]');
    }
    const hidden = Math.max(0, unit.statuses.length - 3);
    return `${visible.join('')}${hidden > 0 ? `+${hidden}` : ''}`;
}

function slotX(index: number, count: number): number {
    if (count <= 1) return 0;
    const spacing = Math.min(86, 320 / (count - 1));
    return (index - (count - 1) / 2) * spacing;
}

function ratio(value: number, maximum: number): number {
    if (maximum <= 0) return 0;
    return Math.max(0, Math.min(1, value / maximum));
}
