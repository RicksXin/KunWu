/**
 * 队伍编成（PRD-04 §2、任务 P1-HERO-001／P1-COMBAT-001 前置）。
 *
 * 纯逻辑、无引擎依赖。PRD-04 §2 的五条规则全部在此强制：
 *   - 每队固定 4 人
 *   - 无前排、后排、距离和站位承伤
 *   - 死亡角色不能上阵
 *   - 同一角色不能出现在多个活动队伍
 *   - 新档初始只开放 1 支队伍，后续队伍由出征准备面板解锁
 *
 * 「无站位」意味着槽位只决定 UI 顺序，不参与任何结算——
 * 这条必须在类型层面就守住，否则日后很容易冒出"前排承伤"这类逻辑。
 */

import { MAX_PARTY_SIZE } from './CombatTypes';

/** 新档与任何合法存档都必须至少保留第 1 队（PRD-04 §2）。 */
export const MIN_PARTY_PRESETS = 1;

/**
 * 队伍槽位。索引仅表示显示顺序，不含战术含义——
 * 美术站位只用于排版（PRD-09 §7）。
 */
export type PartySlots = readonly (string | null)[];

export interface PartyPreset {
    readonly presetId: string;
    readonly name: string;
    /** 长度恒为 MAX_PARTY_SIZE，空位为 null。 */
    readonly slots: PartySlots;
}

export type PartyRejection =
    /** 修士已死亡，不能上阵。 */
    | 'hero_dead'
    /** 该修士已在本队其它槽位。 */
    | 'duplicate_in_party'
    /** 该修士已在另一支活动队伍。 */
    | 'in_another_party'
    /** 槽位索引越界。 */
    | 'invalid_slot'
    /** 修士不存在。 */
    | 'hero_not_found';

export interface HeroSnapshot {
    readonly instanceId: string;
    readonly isDead: boolean;
}

export function createEmptyParty(): PartySlots {
    return new Array<string | null>(MAX_PARTY_SIZE).fill(null);
}

export function createPreset(presetId: string, name: string): PartyPreset {
    return { presetId, name, slots: createEmptyParty() };
}

/** 队伍内的成员 ID，已去掉空位。 */
export function membersOf(slots: PartySlots): readonly string[] {
    return slots.filter((id): id is string => id !== null);
}

export function partySize(slots: PartySlots): number {
    return membersOf(slots).length;
}

/** 队伍是否满编。出征通常要求满编。 */
export function isFull(slots: PartySlots): boolean {
    return partySize(slots) === MAX_PARTY_SIZE;
}

export interface AssignContext {
    /** 目标队伍当前状态。 */
    readonly slots: PartySlots;
    readonly slotIndex: number;
    readonly heroId: string;
    /** 全部修士，用于查存活状态。 */
    readonly heroes: readonly HeroSnapshot[];
    /**
     * 其它活动队伍的成员。同一角色不能出现在多个活动队伍（PRD-04 §2）。
     * 不含目标队伍自身。
     */
    readonly otherPartyMembers?: readonly string[];
}

export type AssignResult =
    | { readonly ok: true; readonly slots: PartySlots }
    | { readonly ok: false; readonly reason: PartyRejection };

/**
 * 把修士放入槽位。
 *
 * 返回结果对象而非抛错：编队失败是常规交互（玩家点了死亡角色），
 * 抛错会迫使 UI 用 try/catch 处理正常流程。
 */
export function assignToSlot(context: AssignContext): AssignResult {
    const { slots, slotIndex, heroId, heroes } = context;

    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= MAX_PARTY_SIZE) {
        return { ok: false, reason: 'invalid_slot' };
    }

    const hero = heroes.find((item) => item.instanceId === heroId);
    if (!hero) {
        return { ok: false, reason: 'hero_not_found' };
    }
    if (hero.isDead) {
        // 死亡角色进还魂坛，不能编队（PRD-03 §10）
        return { ok: false, reason: 'hero_dead' };
    }

    // 已在本队其它槽位：视为非法而非静默移动，
    // 否则玩家会以为"拖过去"能交换位置，实际是把人弄丢了
    const existingIndex = slots.indexOf(heroId);
    if (existingIndex >= 0 && existingIndex !== slotIndex) {
        return { ok: false, reason: 'duplicate_in_party' };
    }

    if ((context.otherPartyMembers ?? []).includes(heroId)) {
        return { ok: false, reason: 'in_another_party' };
    }

    const next = [...slots];
    next[slotIndex] = heroId;
    return { ok: true, slots: next };
}

/** 移出槽位。越界时原样返回，不抛错——重复点击移除按钮很常见。 */
export function clearSlot(slots: PartySlots, slotIndex: number): PartySlots {
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= MAX_PARTY_SIZE) {
        return slots;
    }
    const next = [...slots];
    next[slotIndex] = null;
    return next;
}

/**
 * 交换两个槽位。
 * 因为「无站位承伤」，交换只影响显示顺序，不影响战斗——
 * 提供它纯粹是为了让玩家整理界面。
 */
export function swapSlots(slots: PartySlots, a: number, b: number): PartySlots {
    const valid = (i: number): boolean =>
        Number.isInteger(i) && i >= 0 && i < MAX_PARTY_SIZE;
    if (!valid(a) || !valid(b)) {
        return slots;
    }
    const next = [...slots];
    [next[a], next[b]] = [next[b]!, next[a]!];
    return next;
}

/** 移除已死亡的成员。战败结算后调用（PRD-03 §10）。 */
export function pruneDead(
    slots: PartySlots,
    heroes: readonly HeroSnapshot[],
): PartySlots {
    const deadIds = new Set(
        heroes.filter((hero) => hero.isDead).map((hero) => hero.instanceId),
    );
    return slots.map((id) => (id !== null && deadIds.has(id) ? null : id));
}

export interface PartyValidation {
    readonly isValid: boolean;
    readonly problems: readonly string[];
}

/**
 * 校验队伍可否出征。
 * 收集全部问题而非首个即返回——玩家应一次看到所有需要修的地方。
 */
export function validateForExpedition(
    slots: PartySlots,
    heroes: readonly HeroSnapshot[],
): PartyValidation {
    const problems: string[] = [];

    if (slots.length !== MAX_PARTY_SIZE) {
        problems.push(`队伍槽位数应为 ${MAX_PARTY_SIZE}，实际 ${slots.length}`);
    }

    const members = membersOf(slots);
    if (members.length === 0) {
        problems.push('队伍为空');
    }

    const seen = new Set<string>();
    for (const id of members) {
        if (seen.has(id)) {
            problems.push(`修士 ${id} 重复上阵`);
        }
        seen.add(id);

        const hero = heroes.find((item) => item.instanceId === id);
        if (!hero) {
            problems.push(`修士 ${id} 不存在`);
        } else if (hero.isDead) {
            problems.push(`修士 ${id} 已死亡，不能上阵`);
        }
    }

    return { isValid: problems.length === 0, problems };
}

/** 校验预设集合至少保留第 1 队；可解锁上限由外置出征配置决定。 */
export function validatePresets(presets: readonly PartyPreset[]): PartyValidation {
    const problems: string[] = [];

    if (presets.length < MIN_PARTY_PRESETS) {
        problems.push(`预设数量应至少 ${MIN_PARTY_PRESETS} 套，实际 ${presets.length}`);
    }

    const ids = new Set<string>();
    for (const preset of presets) {
        if (ids.has(preset.presetId)) {
            problems.push(`预设 ID 重复: ${preset.presetId}`);
        }
        ids.add(preset.presetId);
    }

    return { isValid: problems.length === 0, problems };
}
