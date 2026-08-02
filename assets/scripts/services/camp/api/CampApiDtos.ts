export const CAMP_TOP_RESOURCE_IDS = [
    'spirit_grain',
    'spirit_wood',
    'dark_iron',
    'spirit_crystal',
    'geng_jing',
] as const;

export type CampTopResourceId = (typeof CAMP_TOP_RESOURCE_IDS)[number];

export const CAMP_BOTTOM_ENTRY_IDS = [
    'settings',
    'achievements',
    'leaderboard',
    'mail',
    'daily_progress',
] as const;

export type CampBottomEntryId = (typeof CAMP_BOTTOM_ENTRY_IDS)[number];

export const LING_PU_API_RESOURCE_IDS = [
    'spirit_grain',
    'spirit_wood',
    'dark_iron',
] as const;

export type LingPuApiResourceId = (typeof LING_PU_API_RESOURCE_IDS)[number];

export type CampResourceStatusDto = 'normal' | 'near_capacity' | 'full' | 'shutdown';
export type CampBottomEntryStateDto = 'enabled' | 'disabled' | 'hidden';

export interface CampTopResourceDto {
    readonly resource_id: CampTopResourceId;
    readonly amount: number;
    readonly status: CampResourceStatusDto;
}

export interface CampBottomEntryDto {
    readonly entry_id: CampBottomEntryId;
    readonly state: CampBottomEntryStateDto;
    readonly unavailable_reason: string | null;
}

export interface CampHudSnapshotDto {
    readonly api_version: 'v1';
    readonly state_version: string;
    readonly server_time_utc: number;
    readonly top_resources: readonly CampTopResourceDto[];
    readonly main_task: {
        readonly objective: string | null;
    };
    readonly bottom_entries: readonly CampBottomEntryDto[];
    readonly spirit_stone_balance: number;
}

export interface LingPuStorageUpgradeDto {
    readonly current_level: number;
    readonly max_level: number;
    readonly current_capacity: number;
    readonly next_capacity: number | null;
    readonly spirit_wood_cost: number | null;
    readonly can_afford: boolean;
    readonly is_max_level: boolean;
}

export interface LingPuResourceDto {
    readonly resource_id: LingPuApiResourceId;
    readonly stock: number;
    readonly capacity: number;
    readonly assigned_workers: number;
    readonly worker_limit: number;
    readonly production_per_cycle: number;
    readonly is_full: boolean;
    readonly is_shutdown: boolean;
    readonly shutdown_reason: string | null;
    readonly storage_upgrade: LingPuStorageUpgradeDto;
}

export interface LingPuSnapshotDto {
    readonly api_version: 'v1';
    readonly state_version: string;
    readonly server_time_utc: number;
    readonly cycle_seconds: number;
    readonly last_settled_at_utc: number;
    readonly next_settlement_at_utc: number;
    readonly worker_total: number;
    readonly worker_idle: number;
    readonly resources: readonly LingPuResourceDto[];
    readonly recruit: {
        readonly spirit_grain_cost: number;
        readonly workers_granted: number;
        readonly can_afford: boolean;
    };
}

export interface LingPuSettlementDto {
    readonly cycles: number;
    readonly yields: Readonly<Record<LingPuApiResourceId, number>>;
    readonly clock_rolled_back: boolean;
    readonly discarded_seconds: number;
}

export interface LingPuMutationResponseDto {
    readonly request_id: string;
    readonly snapshot: LingPuSnapshotDto;
    readonly settlement: LingPuSettlementDto;
}
