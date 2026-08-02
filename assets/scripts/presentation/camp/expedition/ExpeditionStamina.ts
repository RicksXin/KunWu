import { settleNaturalStamina } from 'db://assets/scripts/domain/ExpeditionPreparation';
import type {
    ExpeditionPreparationConfig,
    StaminaSettlement,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { Profile } from 'db://assets/scripts/services/GameState';

/** 结算领域结果并原子应用到当前 Profile。 */
export function settleExpeditionStamina(
    profile: Profile,
    config: ExpeditionPreparationConfig,
    nowUtcSeconds: number,
): StaminaSettlement {
    const state = profile.expeditionPreparation;
    const result = settleNaturalStamina({
        heroes: profile.roster,
        lastSettledAtUtc: state.lastStaminaSettledAtUtc,
        nowUtcSeconds,
        isInExpedition: profile.expedition !== null,
        config,
    });
    if (!result.changed) return result;
    for (const hero of profile.roster) {
        hero.stamina = result.staminaByHero[hero.instanceId] ?? hero.stamina;
    }
    state.lastStaminaSettledAtUtc = result.nextSettledAtUtc;
    return result;
}
