import type { LingPuConfig, LingPuMutationFailure } from 'db://assets/scripts/domain/LingPu';
import type { Profile } from 'db://assets/scripts/services/GameState';
import type { LingPuOperationResult } from 'db://assets/scripts/services/LingPuService';
import type { LingPuService } from 'db://assets/scripts/services/LingPuService';
import type { SettleResult } from 'db://assets/scripts/services/CampEconomy';
import type {
    CampHudSnapshotDto,
    LingPuMutationResponseDto,
    LingPuSnapshotDto,
} from './CampApiDtos';
import { CampApiError } from './CampApiPort';
import type {
    CampApiErrorCode,
    CampApiPort,
    RecruitLingPuWorkersRequest,
    ResumeLingPuSessionRequest,
    SetLingPuAssignmentRequest,
    SettleLingPuRequest,
    UpgradeLingPuStorageRequest,
    VersionedCampMutationRequest,
} from './CampApiPort';
import {
    createCampHudSnapshot,
    createLingPuSnapshot,
    createSettlementDto,
    lingPuJobFromApi,
} from './LocalCampApiMapper';
import { cloneCampProfile, emptySettleResult } from './LocalCampApiState';

export type LocalCampApiFault = 'offline' | 'timeout' | 'conflict' | 'internal';

export interface LocalCampApiAdapterDeps {
    readonly readProfile: () => Profile;
    readonly readLingPuConfig: () => LingPuConfig | null;
    readonly lingPuDomain: LingPuService;
    readonly nowUtcSeconds: () => number;
}

export class LocalCampApiAdapter implements CampApiPort {
    private readonly deps: LocalCampApiAdapterDeps;
    private readonly completedRequests = new Map<string, LingPuMutationResponseDto>();
    private readonly completedErrors = new Map<string, CampApiError>();
    private readonly requestSignatures = new Map<string, string>();
    private revision = 1;
    private nextFault: LocalCampApiFault | null = null;

    constructor(deps: LocalCampApiAdapterDeps) {
        this.deps = deps;
    }

    simulateNextFailure(fault: LocalCampApiFault): void {
        this.nextFault = fault;
    }

    async getCampHud(): Promise<CampHudSnapshotDto> {
        await this.prepareRequest();
        return createCampHudSnapshot(
            this.profile(),
            this.deps.readLingPuConfig(),
            this.revision,
            this.deps.nowUtcSeconds(),
        );
    }

    async getLingPu(): Promise<LingPuSnapshotDto> {
        await this.prepareRequest();
        return this.snapshot(this.profile(), this.config());
    }

    async settleLingPu(request: SettleLingPuRequest): Promise<LingPuMutationResponseDto> {
        const cached = await this.prepareMutation('settle', request);
        if (cached) return cached;
        const profile = cloneCampProfile(this.profile());
        const config = this.config();
        const result = this.deps.lingPuDomain.settleOnline(profile, config);
        if (result.output.cycles > 0) this.revision += 1;
        return this.complete(request.idempotency_key, profile, config, result);
    }

    async setLingPuAssignment(
        request: SetLingPuAssignmentRequest,
    ): Promise<LingPuMutationResponseDto> {
        const cached = await this.prepareMutation('assignment', request);
        if (cached) return cached;
        const profile = cloneCampProfile(this.profile());
        const config = this.config();
        const job = lingPuJobFromApi(request.resource_id);
        const current = profile.camp.workerAssignments[job] ?? 0;
        const delta = request.target_worker_count - current;
        if (delta === 0) {
            return this.complete(request.idempotency_key, profile, config, emptySettleResult());
        }
        if (delta !== -1 && delta !== 1) {
            const error = this.error(
                'invalid_request',
                '单次调岗只能增加或减少一名杂役',
                400,
                false,
            );
            this.completedErrors.set(request.idempotency_key, error);
            throw error;
        }
        const result = this.deps.lingPuDomain.reassign(profile, config, job, delta);
        return this.completeOperation(request.idempotency_key, profile, config, result);
    }

    async recruitLingPuWorkers(
        request: RecruitLingPuWorkersRequest,
    ): Promise<LingPuMutationResponseDto> {
        const cached = await this.prepareMutation('recruit', request);
        if (cached) return cached;
        const profile = cloneCampProfile(this.profile());
        const config = this.config();
        const result = this.deps.lingPuDomain.recruit(profile, config);
        return this.completeOperation(request.idempotency_key, profile, config, result);
    }

    async upgradeLingPuStorage(
        request: UpgradeLingPuStorageRequest,
    ): Promise<LingPuMutationResponseDto> {
        const cached = await this.prepareMutation('storage_upgrade', request);
        if (cached) return cached;
        const profile = cloneCampProfile(this.profile());
        const config = this.config();
        const result = this.deps.lingPuDomain.upgradeStorage(
            profile,
            config,
            lingPuJobFromApi(request.resource_id),
        );
        return this.completeOperation(request.idempotency_key, profile, config, result);
    }

    async resumeLingPuSession(
        request: ResumeLingPuSessionRequest,
    ): Promise<LingPuMutationResponseDto> {
        const cached = await this.prepareMutation('session_resume', request);
        if (cached) return cached;
        const profile = cloneCampProfile(this.profile());
        const config = this.config();
        this.deps.lingPuDomain.resetOnlineAnchor(profile);
        this.revision += 1;
        return this.complete(request.idempotency_key, profile, config, emptySettleResult());
    }

    private async prepareRequest(): Promise<void> {
        await Promise.resolve();
        const fault = this.nextFault;
        this.nextFault = null;
        if (!fault) return;
        if (fault === 'offline') throw this.error('offline', '本地接口模拟断网', 503, true);
        if (fault === 'timeout') throw this.error('timeout', '本地接口模拟超时', 504, true);
        if (fault === 'conflict') {
            this.revision += 1;
            throw this.error('conflict', '本地接口模拟版本冲突', 409, true);
        }
        throw this.error('internal', '本地接口模拟服务异常', 500, true);
    }

    private async prepareMutation(
        operation: string,
        request: VersionedCampMutationRequest,
    ): Promise<LingPuMutationResponseDto | null> {
        const signature = requestSignature(operation, request);
        const previousSignature = this.requestSignatures.get(request.idempotency_key);
        if (previousSignature && previousSignature !== signature) {
            throw this.error(
                'idempotency_key_reused',
                '同一请求标识不能用于不同操作',
                409,
                false,
            );
        }
        const cached = this.completedRequests.get(request.idempotency_key);
        if (cached) return cached;
        const cachedError = this.completedErrors.get(request.idempotency_key);
        if (cachedError) throw cachedError;
        await this.prepareRequest();
        if (request.expected_version !== `local-${this.revision}`) {
            const profile = this.profile();
            const config = this.config();
            throw new CampApiError({
                code: 'conflict',
                message: '灵源院状态版本已变化',
                httpStatus: 409,
                retryable: true,
                latestLingPuSnapshot: this.snapshot(profile, config),
            });
        }
        this.requestSignatures.set(request.idempotency_key, signature);
        return null;
    }

    private completeOperation(
        requestId: string,
        profile: Profile,
        config: LingPuConfig,
        result: LingPuOperationResult,
    ): LingPuMutationResponseDto {
        if (result.ok || result.settlement.cycles > 0) this.revision += 1;
        const response = this.complete(requestId, profile, config, {
            state: {} as SettleResult['state'],
            output: result.settlement,
            clockRolledBack: result.clockRolledBack,
            discardedSeconds: 0,
        });
        if (!result.ok) {
            this.completedRequests.delete(requestId);
            const error = this.businessError(result.failure!, response.snapshot);
            this.completedErrors.set(requestId, error);
            throw error;
        }
        return response;
    }

    private complete(
        requestId: string,
        profile: Profile,
        config: LingPuConfig,
        settlement: SettleResult,
    ): LingPuMutationResponseDto {
        const response = {
            request_id: requestId,
            snapshot: this.snapshot(profile, config),
            settlement: createSettlementDto(
                settlement.output,
                settlement.clockRolledBack,
                settlement.discardedSeconds,
            ),
        };
        this.completedRequests.set(requestId, response);
        return response;
    }

    private profile(): Profile {
        try {
            return this.deps.readProfile();
        } catch {
            throw this.error('profile_not_loaded', 'Profile 尚未加载', 503, true);
        }
    }

    private config(): LingPuConfig {
        const config = this.deps.readLingPuConfig();
        if (!config) throw this.error('config_unavailable', '灵源院配置尚未加载', 503, true);
        return config;
    }

    private snapshot(profile: Profile, config: LingPuConfig): LingPuSnapshotDto {
        return createLingPuSnapshot(
            profile,
            config,
            this.revision,
            this.deps.nowUtcSeconds(),
            this.deps.lingPuDomain,
        );
    }

    private businessError(
        code: LingPuMutationFailure,
        snapshot: LingPuSnapshotDto,
    ): CampApiError {
        return new CampApiError({
            code,
            message: code,
            httpStatus: 422,
            retryable: false,
            latestLingPuSnapshot: snapshot,
        });
    }

    private error(
        code: CampApiErrorCode,
        message: string,
        httpStatus: number,
        retryable: boolean,
    ): CampApiError {
        return new CampApiError({ code, message, httpStatus, retryable });
    }
}

function requestSignature(operation: string, request: VersionedCampMutationRequest): string {
    const entries = Object.entries(request).sort(([left], [right]) => left.localeCompare(right));
    return `${operation}:${JSON.stringify(entries)}`;
}
