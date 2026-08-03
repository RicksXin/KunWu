import type { CombatEventPayload, CombatOutcome, CombatSnapshot } from 'db://assets/scripts/domain/CombatState';
import type { CombatCatalog, CombatEncounterDefinition } from './CombatCatalog';

export interface CombatContext {
    readonly mapId: string;
    readonly objectId: string;
    readonly enemyId: string;
}

export interface CombatUnitMeta {
    readonly unitId: number;
    readonly nameKey: string;
    readonly raceKey: string;
    readonly heroInstanceId?: string;
    readonly portraitKey?: string;
}

export interface CombatSessionView {
    readonly context: CombatContext;
    readonly snapshot: CombatSnapshot;
    readonly unitMeta: ReadonlyMap<number, CombatUnitMeta>;
    readonly autoUnitIds: ReadonlySet<number>;
    readonly readyAllyId: number | null;
    readonly escapeAvailable: boolean;
    readonly actionMaximums: ReadonlyMap<number, number>;
    readonly catalog: CombatCatalog;
    readonly encounter: CombatEncounterDefinition;
}

export interface CombatFrameResult {
    readonly view: CombatSessionView;
    readonly events: readonly CombatEventPayload[];
}

export interface CombatActionResult extends CombatFrameResult {
    readonly ok: boolean;
    readonly message?: string;
}

export interface CombatLootEntry {
    readonly itemId: string;
    readonly nameKey: string;
    readonly amount: number;
    readonly unitWeight: number;
}

export interface CombatLootPanelView {
    readonly backpack: readonly CombatLootEntry[];
    readonly rewards: readonly CombatLootEntry[];
    readonly soulCrystalReward: number;
    readonly soulCrystalGranted: boolean;
    readonly currentBurden: number;
    readonly burdenLimit: number;
    readonly rewardWeight: number;
    readonly projectedBurden: number;
    readonly canTakeAll: boolean;
}

export interface CombatLootActionResult {
    readonly ok: boolean;
    readonly message: string;
    readonly view: CombatLootPanelView;
}

export interface CombatSettlementResult {
    readonly ok: boolean;
    readonly message: string;
    readonly destination: 'map' | 'camp';
    readonly outcome: CombatOutcome | 'escaped';
}
