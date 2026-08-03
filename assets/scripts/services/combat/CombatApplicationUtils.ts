import type { CombatContext, CombatSettlementResult } from './CombatApplicationModels';

export function combatSeedFrom(context: CombatContext): number {
    const text = `${context.mapId}.${context.objectId}.${context.enemyId}`;
    let seed = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
        seed ^= text.charCodeAt(index);
        seed = Math.imul(seed, 16777619);
    }
    return seed >>> 0 || 1;
}

export function combatPendingResult(
    outcome: CombatSettlementResult['outcome'],
): CombatSettlementResult {
    return { ok: false, message: '战斗结算处理中', destination: 'map', outcome };
}
