import { MAX_PARTY_SIZE } from '../CombatTypes';
import { membersOf } from '../Party';
import type { PartySlots } from '../Party';
import { EXPEDITION_ITEM_IDS } from './ExpeditionConfig';
import type {
    ExpeditionHeroSnapshot,
    ExpeditionLoadout,
    ExpeditionMapOption,
    ExpeditionPreparationConfig,
    ExpeditionReadiness,
    StaminaSettlement,
} from './ExpeditionConfig';

export function createEmptyLoadout(): ExpeditionLoadout {
    return { spiritGrain: 0, pickaxe: 0, lens: 0 };
}

export function loadoutWeight(
    loadout: Readonly<ExpeditionLoadout>,
    config: ExpeditionPreparationConfig,
): number {
    return EXPEDITION_ITEM_IDS.reduce((sum, id) => sum + loadout[id] * config.items[id].weight, 0);
}

export function partyBurdenLimit(
    slots: PartySlots,
    heroes: readonly ExpeditionHeroSnapshot[],
    config: ExpeditionPreparationConfig,
): number {
    const selected = new Set(membersOf(slots));
    let strength = 0;
    let constitution = 0;
    for (const hero of heroes) {
        if (!selected.has(hero.instanceId)) continue;
        strength += hero.attributes.strength;
        constitution += hero.attributes.constitution;
    }
    return config.baseBurden
        + strength * config.strengthBurdenFactor
        + constitution * config.constitutionBurdenFactor;
}

export function settleNaturalStamina(input: {
    readonly heroes: readonly Pick<ExpeditionHeroSnapshot, 'instanceId' | 'stamina'>[];
    readonly lastSettledAtUtc: number;
    readonly nowUtcSeconds: number;
    readonly isInExpedition: boolean;
    readonly config: ExpeditionPreparationConfig;
}): StaminaSettlement {
    const current = Object.fromEntries(input.heroes.map((hero) => [hero.instanceId, hero.stamina]));
    if (input.isInExpedition || input.nowUtcSeconds <= input.lastSettledAtUtc) {
        return { staminaByHero: current, nextSettledAtUtc: input.lastSettledAtUtc, recovered: 0, changed: false };
    }
    const interval = input.config.staminaRecoveryIntervalSeconds;
    const cycles = Math.floor((input.nowUtcSeconds - input.lastSettledAtUtc) / interval);
    if (cycles <= 0) {
        return { staminaByHero: current, nextSettledAtUtc: input.lastSettledAtUtc, recovered: 0, changed: false };
    }
    const staminaByHero: Record<string, number> = {};
    let recovered = 0;
    for (const hero of input.heroes) {
        const next = Math.min(input.config.staminaMax, hero.stamina + cycles * input.config.staminaRecoveryAmount);
        staminaByHero[hero.instanceId] = next;
        recovered += next - hero.stamina;
    }
    return {
        staminaByHero,
        nextSettledAtUtc: input.lastSettledAtUtc + cycles * interval,
        recovered,
        changed: true,
    };
}

export function validateExpeditionReadiness(input: {
    readonly slots: PartySlots;
    readonly heroes: readonly ExpeditionHeroSnapshot[];
    readonly loadout: Readonly<ExpeditionLoadout>;
    readonly map: ExpeditionMapOption;
    readonly config: ExpeditionPreparationConfig;
}): ExpeditionReadiness {
    const problems: string[] = [];
    if (input.slots.length !== MAX_PARTY_SIZE) problems.push(`队伍槽位数应为 ${MAX_PARTY_SIZE}`);
    const memberIds = membersOf(input.slots);
    if (memberIds.length === 0) problems.push('至少选择 1 名存活修士');
    const seen = new Set<string>();
    for (const id of memberIds) {
        if (seen.has(id)) {
            problems.push(`修士 ${id} 重复上阵`);
            continue;
        }
        seen.add(id);
        const hero = input.heroes.find((candidate) => candidate.instanceId === id);
        if (!hero) problems.push(`修士 ${id} 不存在`);
        else if (hero.isDead) problems.push(`修士 ${id} 已阵亡`);
        else if (hero.stamina < input.map.staminaCost) problems.push(`有修士灵息不足（需要 ${input.map.staminaCost}）`);
    }
    if (input.loadout.spiritGrain < input.map.minimumCarriedGrain) {
        problems.push(`至少携带 ${input.map.minimumCarriedGrain} 灵粮`);
    }
    const burden = loadoutWeight(input.loadout, input.config);
    const limit = partyBurdenLimit(input.slots, input.heroes, input.config);
    if (burden > limit) problems.push(`负重超限（${burden}/${limit}）`);
    return { isReady: problems.length === 0, problems };
}
