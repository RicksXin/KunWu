import type { LingPuMutationFailure } from 'db://assets/scripts/domain/LingPu';
import type {
    CampHudSnapshotDto,
    LingPuApiResourceId,
    LingPuMutationResponseDto,
    LingPuSnapshotDto,
} from './CampApiDtos';

export type CampApiErrorCode =
    | 'profile_not_loaded'
    | 'config_unavailable'
    | 'unauthorized'
    | 'forbidden'
    | 'offline'
    | 'timeout'
    | 'conflict'
    | 'idempotency_key_reused'
    | 'invalid_request'
    | LingPuMutationFailure
    | 'internal';

export class CampApiError extends Error {
    readonly code: CampApiErrorCode;
    readonly httpStatus: number;
    readonly retryable: boolean;
    readonly latestLingPuSnapshot: LingPuSnapshotDto | null;

    constructor(options: {
        readonly code: CampApiErrorCode;
        readonly message: string;
        readonly httpStatus: number;
        readonly retryable: boolean;
        readonly latestLingPuSnapshot?: LingPuSnapshotDto | null;
    }) {
        super(options.message);
        this.name = 'CampApiError';
        this.code = options.code;
        this.httpStatus = options.httpStatus;
        this.retryable = options.retryable;
        this.latestLingPuSnapshot = options.latestLingPuSnapshot ?? null;
    }
}

export type LingPuSettlementReason =
    | 'panel_open'
    | 'panel_close'
    | 'timer'
    | 'app_hide';

export interface VersionedCampMutationRequest {
    readonly idempotency_key: string;
    readonly expected_version: string;
}

export interface SettleLingPuRequest extends VersionedCampMutationRequest {
    readonly reason: LingPuSettlementReason;
}

export interface SetLingPuAssignmentRequest extends VersionedCampMutationRequest {
    readonly resource_id: LingPuApiResourceId;
    readonly target_worker_count: number;
}

export type RecruitLingPuWorkersRequest = VersionedCampMutationRequest;

export interface UpgradeLingPuStorageRequest extends VersionedCampMutationRequest {
    readonly resource_id: LingPuApiResourceId;
}

export type ResumeLingPuSessionRequest = VersionedCampMutationRequest;

export interface CampApiPort {
    getCampHud(): Promise<CampHudSnapshotDto>;
    getLingPu(): Promise<LingPuSnapshotDto>;
    settleLingPu(request: SettleLingPuRequest): Promise<LingPuMutationResponseDto>;
    setLingPuAssignment(
        request: SetLingPuAssignmentRequest,
    ): Promise<LingPuMutationResponseDto>;
    recruitLingPuWorkers(
        request: RecruitLingPuWorkersRequest,
    ): Promise<LingPuMutationResponseDto>;
    upgradeLingPuStorage(
        request: UpgradeLingPuStorageRequest,
    ): Promise<LingPuMutationResponseDto>;
    resumeLingPuSession(
        request: ResumeLingPuSessionRequest,
    ): Promise<LingPuMutationResponseDto>;
}
