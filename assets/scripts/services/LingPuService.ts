import {
    adjustWorkerAssignment,
    previewStorageUpgrade,
    recruitWorkers,
    storageCapacities,
    upgradeStorage,
} from '../domain/LingPu';
import type {
    LingPuConfig,
    LingPuMutationFailure,
    P1LingPuJob,
    StorageUpgradePreview,
} from '../domain/LingPu';
import {
    BASE_CYCLE_SECONDS,
    createAssignment,
} from '../domain/Production';
import type { ProductionJob, SettlementOutput } from '../domain/Production';
import { CampEconomy } from './CampEconomy';
import type { CampEconomyState, SettleResult } from './CampEconomy';
import type { Profile } from './GameState';
import { TimeService } from './TimeService';

/** 防止异常长前台会话造成一次乘法过大；P1 后台时长会在 AppRoot 中主动丢弃。 */
const ONLINE_SESSION_CAP_SECONDS = 24 * 60 * 60;

export interface LingPuOperationResult {
    readonly ok: boolean;
    readonly failure?: LingPuMutationFailure;
    readonly settlement: SettlementOutput;
    readonly clockRolledBack: boolean;
}

/**
 * 灵圃业务编排。只修改传入 Profile，不依赖 Cocos，UI 只消费结果。
 * 所有操作先结算旧配置，再执行调岗、招募或储量升级。
 */
export class LingPuService {
    private readonly time: TimeService;

    constructor(time: TimeService) {
        this.time = time;
    }

    settleOnline(profile: Profile, config: LingPuConfig): SettleResult {
        const economy = this.createEconomy();
        const result = economy.settle(this.toEconomyState(profile, config));
        this.applyEconomyState(profile, result.state);
        return result;
    }

    reassign(
        profile: Profile,
        config: LingPuConfig,
        job: P1LingPuJob,
        delta: -1 | 1,
    ): LingPuOperationResult {
        const settled = this.settleOnline(profile, config);
        const assignment = createAssignment(profile.camp.workerAssignments);
        const adjusted = adjustWorkerAssignment(
            assignment,
            profile.camp.workerCount,
            job,
            delta,
        );
        if (!adjusted.ok) {
            return this.operationFailure(settled, adjusted.failure!);
        }
        for (const productionJob of Object.keys(adjusted.value) as ProductionJob[]) {
            profile.camp.workerAssignments[productionJob] = adjusted.value[productionJob];
        }
        return this.operationSuccess(settled);
    }

    recruit(profile: Profile, config: LingPuConfig): LingPuOperationResult {
        const settled = this.settleOnline(profile, config);
        const recruited = recruitWorkers(
            profile.camp.workerCount,
            profile.wallet.spiritGrain,
            config,
        );
        if (!recruited.ok) {
            return this.operationFailure(settled, recruited.failure!);
        }
        profile.camp.workerCount = recruited.value.workerCount;
        profile.wallet.spiritGrain = recruited.value.spiritGrain;
        return this.operationSuccess(settled);
    }

    upgradeStorage(
        profile: Profile,
        config: LingPuConfig,
        job: P1LingPuJob,
    ): LingPuOperationResult {
        // 必须先用旧上限结算，不能先扩容再追溯领取此前满仓时段的产出。
        const settled = this.settleOnline(profile, config);
        const upgraded = upgradeStorage(
            profile.camp.resourceStorageLevels,
            job,
            profile.wallet.spiritWood,
            config,
        );
        if (!upgraded.ok) {
            return this.operationFailure(settled, upgraded.failure!);
        }
        for (const [resource, level] of Object.entries(upgraded.value.levels)) {
            profile.camp.resourceStorageLevels[resource] = level;
        }
        profile.wallet.spiritWood = upgraded.value.spiritWood;
        return this.operationSuccess(settled);
    }

    previewUpgrade(
        profile: Profile,
        config: LingPuConfig,
        job: P1LingPuJob,
    ): StorageUpgradePreview {
        return previewStorageUpgrade(
            profile.camp.resourceStorageLevels,
            job,
            profile.wallet.spiritWood,
            config,
        );
    }

    /** P1 从后台恢复时丢弃后台时长，从当前时刻重新开始在线周期。 */
    resetOnlineAnchor(profile: Profile): void {
        profile.camp.lastSettledAtUtc = this.time.nowUtcSeconds();
    }

    secondsUntilNextCycle(profile: Profile): number {
        const elapsed = Math.max(
            0,
            this.time.nowUtcSeconds() - profile.camp.lastSettledAtUtc,
        );
        const remainder = elapsed % BASE_CYCLE_SECONDS;
        return remainder === 0 && elapsed > 0
            ? 0
            : BASE_CYCLE_SECONDS - remainder;
    }

    cycleProgress(profile: Profile): number {
        const elapsed = Math.max(
            0,
            this.time.nowUtcSeconds() - profile.camp.lastSettledAtUtc,
        );
        return (elapsed % BASE_CYCLE_SECONDS) / BASE_CYCLE_SECONDS;
    }

    private createEconomy(): CampEconomy {
        return new CampEconomy({
            computeWindow: (lastSettledAtUtc, capSeconds) =>
                this.time.computeSettlementWindow(lastSettledAtUtc, capSeconds),
            nowUtcSeconds: () => this.time.nowUtcSeconds(),
            offlineCapSeconds: ONLINE_SESSION_CAP_SECONDS,
        });
    }

    private toEconomyState(profile: Profile, config: LingPuConfig): CampEconomyState {
        return {
            stock: {
                spiritGrain: profile.wallet.spiritGrain,
                spiritWood: profile.wallet.spiritWood,
                darkIron: profile.wallet.darkIron,
                spiritStone: profile.wallet.spiritStone,
                gengJing: profile.wallet.gengJing,
            },
            assignment: createAssignment(profile.camp.workerAssignments),
            storageCaps: storageCapacities(
                profile.camp.resourceStorageLevels,
                config,
            ),
            lastSettledAtUtc: profile.camp.lastSettledAtUtc,
        };
    }

    private applyEconomyState(profile: Profile, state: CampEconomyState): void {
        for (const job of Object.keys(state.stock) as ProductionJob[]) {
            profile.wallet[job] = state.stock[job];
        }
        for (const job of Object.keys(state.assignment) as ProductionJob[]) {
            profile.camp.workerAssignments[job] = state.assignment[job];
        }
        profile.camp.lastSettledAtUtc = state.lastSettledAtUtc;
    }

    private operationSuccess(settled: SettleResult): LingPuOperationResult {
        return {
            ok: true,
            settlement: settled.output,
            clockRolledBack: settled.clockRolledBack,
        };
    }

    private operationFailure(
        settled: SettleResult,
        failure: LingPuMutationFailure,
    ): LingPuOperationResult {
        return {
            ok: false,
            failure,
            settlement: settled.output,
            clockRolledBack: settled.clockRolledBack,
        };
    }
}
