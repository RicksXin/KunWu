import type { P1LingPuJob } from 'db://assets/scripts/domain/LingPu';
import type { EventBus } from 'db://assets/scripts/services/EventBus';
import type { GameState } from 'db://assets/scripts/services/GameState';
import type { TimeService } from 'db://assets/scripts/services/TimeService';
import { CampApiError } from 'db://assets/scripts/services/camp/api/CampApiPort';
import type {
    CampApiPort,
    LingPuSettlementReason,
    VersionedCampMutationRequest,
} from 'db://assets/scripts/services/camp/api/CampApiPort';
import type {
    LingPuMutationResponseDto,
    LingPuSnapshotDto,
} from 'db://assets/scripts/services/camp/api/CampApiDtos';
import {
    CampApplicationError,
    toCampApplicationError,
} from './CampApplicationError';
import {
    apiResourceIdForJob,
    applyLingPuSnapshot,
    toLingPuViewModel,
} from './CampApplicationMappers';
import type { LingPuTimerViewModel, LingPuViewModel } from './CampApplicationModels';

export interface LingPuApplicationServiceDeps {
    readonly api: CampApiPort;
    readonly state: GameState;
    readonly events: EventBus;
    readonly time: TimeService;
    readonly save: () => Promise<void>;
}

export class LingPuApplicationService {
    private readonly deps: LingPuApplicationServiceDeps;
    private model: LingPuViewModel | null = null;
    private refreshInFlight: Promise<LingPuViewModel> | null = null;
    private mutationTail: Promise<void> = Promise.resolve();
    private requestSequence = 0;
    private generation = 0;

    constructor(deps: LingPuApplicationServiceDeps) {
        this.deps = deps;
    }

    get current(): LingPuViewModel | null {
        return this.model;
    }

    invalidate(): void {
        this.model = null;
        this.refreshInFlight = null;
        this.generation += 1;
    }

    refresh(): Promise<LingPuViewModel> {
        if (this.refreshInFlight) return this.refreshInFlight;
        const request = this.load(this.generation);
        this.refreshInFlight = request;
        request.then(
            () => this.clearRefresh(request),
            () => this.clearRefresh(request),
        );
        return request;
    }

    async settle(reason: LingPuSettlementReason): Promise<LingPuViewModel> {
        return this.enqueueMutation(async () => {
            const base = await this.requestBase(`settle-${reason}`);
            return this.execute(() => this.deps.api.settleLingPu({ ...base, reason }));
        });
    }

    async reassign(job: P1LingPuJob, delta: -1 | 1): Promise<LingPuViewModel> {
        return this.enqueueMutation(async () => {
            const current = await this.ensureCurrent();
            const base = this.requestBaseFrom(current, `assign-${job}`);
            return this.execute(() => this.deps.api.setLingPuAssignment({
                ...base,
                resource_id: apiResourceIdForJob(job),
                target_worker_count: current.resources[job].workerCount + delta,
            }));
        });
    }

    async recruit(): Promise<LingPuViewModel> {
        return this.enqueueMutation(async () => {
            const base = await this.requestBase('recruit');
            return this.execute(() => this.deps.api.recruitLingPuWorkers(base));
        });
    }

    async upgradeStorage(job: P1LingPuJob): Promise<LingPuViewModel> {
        return this.enqueueMutation(async () => {
            const base = await this.requestBase(`upgrade-${job}`);
            return this.execute(() => this.deps.api.upgradeLingPuStorage({
                ...base,
                resource_id: apiResourceIdForJob(job),
            }));
        });
    }

    async resumeOnlineSession(): Promise<LingPuViewModel> {
        return this.enqueueMutation(async () => {
            const base = await this.requestBase('resume');
            return this.execute(() => this.deps.api.resumeLingPuSession(base));
        });
    }

    async settleIfDue(): Promise<boolean> {
        await this.ensureCurrent();
        const timer = this.timer();
        if (!timer || timer.secondsUntilNextCycle > 0) return false;
        await this.settle('timer');
        return true;
    }

    timer(): LingPuTimerViewModel | null {
        if (!this.model) return null;
        const remaining = Math.max(
            0,
            Math.ceil(this.model.nextSettlementAtUtc - this.deps.time.nowUtcSeconds()),
        );
        const elapsed = this.model.cycleSeconds - Math.min(remaining, this.model.cycleSeconds);
        return {
            secondsUntilNextCycle: remaining,
            cycleProgress: Math.max(0, Math.min(1, elapsed / this.model.cycleSeconds)),
        };
    }

    private async load(generation: number): Promise<LingPuViewModel> {
        try {
            const snapshot = await this.deps.api.getLingPu();
            if (generation !== this.generation) {
                return this.refresh();
            }
            return this.commit(snapshot, false);
        } catch (error) {
            throw toCampApplicationError(error);
        }
    }

    private async execute(
        request: () => Promise<LingPuMutationResponseDto>,
    ): Promise<LingPuViewModel> {
        try {
            const response = await request();
            const model = await this.commit(response.snapshot, true);
            if (response.settlement.clock_rolled_back) {
                this.deps.events.emit('camp.lingPuNotice', {
                    message: '系统时间异常，生产已暂停',
                });
            }
            return model;
        } catch (error) {
            if (error instanceof CampApiError && error.latestLingPuSnapshot) {
                await this.commit(error.latestLingPuSnapshot, true);
            } else if (error instanceof CampApiError && error.code === 'conflict') {
                await this.refresh();
            }
            throw toCampApplicationError(error);
        }
    }

    private async commit(
        snapshot: LingPuSnapshotDto,
        persist: boolean,
    ): Promise<LingPuViewModel> {
        const profile = this.deps.state.require();
        applyLingPuSnapshot(profile, snapshot);
        const model = toLingPuViewModel(snapshot);
        this.model = model;
        this.deps.events.emit('wallet.changed', { source: 'ling_pu_api' });
        this.deps.events.emit('camp.productionChanged', { source: 'ling_pu_api' });
        this.deps.events.emit('camp.lingPuStateChanged', model);
        if (persist) {
            try {
                await this.deps.save();
            } catch {
                throw new CampApplicationError(
                    'save_failed',
                    '操作已生效，但存档失败',
                    true,
                );
            }
        }
        return model;
    }

    private async ensureCurrent(): Promise<LingPuViewModel> {
        return this.model ?? this.refresh();
    }

    private clearRefresh(request: Promise<LingPuViewModel>): void {
        if (this.refreshInFlight === request) {
            this.refreshInFlight = null;
        }
    }

    private enqueueMutation(
        operation: () => Promise<LingPuViewModel>,
    ): Promise<LingPuViewModel> {
        const result = this.mutationTail.then(operation);
        this.mutationTail = result.then(
            () => undefined,
            () => undefined,
        );
        return result;
    }

    private async requestBase(action: string): Promise<VersionedCampMutationRequest> {
        return this.requestBaseFrom(await this.ensureCurrent(), action);
    }

    private requestBaseFrom(
        model: LingPuViewModel,
        action: string,
    ): VersionedCampMutationRequest {
        this.requestSequence += 1;
        return {
            idempotency_key: `${action}-${Date.now()}-${this.requestSequence}`,
            expected_version: model.stateVersion,
        };
    }
}
