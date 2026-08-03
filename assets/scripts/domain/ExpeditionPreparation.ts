/** 入山整备领域规则的稳定公共入口。 */

export {
    EXPEDITION_CONFIG_ID,
    EXPEDITION_CONFIG_TABLE,
    EXPEDITION_ITEM_IDS,
    parseExpeditionPreparationConfig,
} from './expedition/ExpeditionConfig';
export type {
    ExpeditionHeroSnapshot,
    ExpeditionFieldConfig,
    ExpeditionFoodConfig,
    ExpeditionItemConfig,
    ExpeditionItemId,
    ExpeditionLoadout,
    ExpeditionMapOption,
    ExpeditionPreparationConfig,
    ExpeditionReadiness,
    StaminaSettlement,
} from './expedition/ExpeditionConfig';
export {
    currentExpeditionBurden,
    currentExpeditionBurdenLimit,
    fieldItemNameKey,
    fieldItemWeight,
    restUseLimit,
} from './expedition/FieldExpeditionRules';
export type { FieldExpeditionSnapshot } from './expedition/FieldExpeditionRules';
export {
    createEmptyLoadout,
    loadoutWeight,
    partyBurdenLimit,
    settleNaturalStamina,
    validateExpeditionReadiness,
} from './expedition/ExpeditionRules';
