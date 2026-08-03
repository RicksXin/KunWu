import type { GridCoord } from 'db://assets/scripts/domain/GridCoord';
import type { ExpeditionLoadout } from 'db://assets/scripts/domain/ExpeditionPreparation';
import type { EventBus } from 'db://assets/scripts/services/EventBus';
import type { GameState } from 'db://assets/scripts/services/GameState';

export interface StagedMapDeparture {
    readonly mapId: string;
    readonly partyPresetId: string;
    readonly partyMemberIds: readonly string[];
    readonly staminaCost: number;
    readonly loadout: ExpeditionLoadout;
    readonly carriedItems: Readonly<Record<string, number>>;
    readonly restUses: number;
}

export type MapActionResult =
    | { readonly ok: true }
    | { readonly ok: false; readonly message: string };

export type MapMoveResult =
    | {
        readonly ok: true;
        readonly position: GridCoord;
        readonly grainSpent: number;
        readonly grainDepletionSteps: number;
        readonly partyWiped: boolean;
    }
    | { readonly ok: false; readonly message: string };

export type MapObjectResolutionResult =
    | { readonly ok: true; readonly resolved: boolean }
    | { readonly ok: false; readonly message: string };

export interface MapApplicationServiceDeps {
    readonly state: GameState;
    readonly events: EventBus;
    readonly save: () => Promise<void>;
    readonly nowUtcSeconds: () => number;
    readonly readGrainDepletionStepLimit: () => number;
}
