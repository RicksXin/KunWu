import {
    CAMP_SYSTEM_ENTRY_FEEDBACK,
} from 'db://assets/scripts/domain/CampBottomHud';
import {
    P1_LING_PU_JOBS,
    storageCapacity,
} from 'db://assets/scripts/domain/LingPu';
import type {
    LingPuConfig,
    P1LingPuJob,
} from 'db://assets/scripts/domain/LingPu';
import {
    BASE_CYCLE_SECONDS,
    createAssignment,
    grainUpkeepPerCycle,
    JOB_RATES,
    resolveShutdown,
    totalWorkers,
} from 'db://assets/scripts/domain/Production';
import type { SettlementOutput } from 'db://assets/scripts/domain/Production';
import type { Profile } from 'db://assets/scripts/services/GameState';
import type { LingPuService } from 'db://assets/scripts/services/LingPuService';
import type {
    CampHudSnapshotDto,
    CampResourceStatusDto,
    CampTopResourceId,
    LingPuApiResourceId,
    LingPuSettlementDto,
    LingPuSnapshotDto,
} from './CampApiDtos';

const API_TO_JOB: Readonly<Record<LingPuApiResourceId, P1LingPuJob>> = {
    spirit_grain: 'spiritGrain',
    spirit_wood: 'spiritWood',
    dark_iron: 'darkIron',
};

const JOB_TO_API: Readonly<Record<P1LingPuJob, LingPuApiResourceId>> = {
    spiritGrain: 'spirit_grain',
    spiritWood: 'spirit_wood',
    darkIron: 'dark_iron',
};

export function lingPuJobFromApi(resourceId: LingPuApiResourceId): P1LingPuJob {
    return API_TO_JOB[resourceId];
}

export function lingPuApiResourceFromJob(job: P1LingPuJob): LingPuApiResourceId {
    return JOB_TO_API[job];
}

export function createCampHudSnapshot(
    profile: Profile,
    config: LingPuConfig | null,
    revision: number,
    nowUtc: number,
): CampHudSnapshotDto {
    const topResources: Readonly<Record<CampTopResourceId, number>> = {
        spirit_grain: profile.wallet.spiritGrain,
        spirit_wood: profile.wallet.spiritWood,
        dark_iron: profile.wallet.darkIron,
        spirit_crystal: profile.wallet.spiritStone,
        geng_jing: profile.wallet.gengJing,
    };
    const status = (resourceId: CampTopResourceId, amount: number): CampResourceStatusDto => {
        if (!config || resourceId === 'spirit_crystal' || resourceId === 'geng_jing') {
            return 'normal';
        }
        const capacity = storageCapacity(
            profile.camp.resourceStorageLevels,
            API_TO_JOB[resourceId],
            config,
        );
        return amount >= capacity ? 'full' : 'normal';
    };
    return {
        api_version: 'v1',
        state_version: localVersion(revision),
        server_time_utc: nowUtc,
        top_resources: Object.entries(topResources).map(([resourceId, amount]) => ({
            resource_id: resourceId as CampTopResourceId,
            amount,
            status: status(resourceId as CampTopResourceId, amount),
        })),
        main_task: { objective: currentMainTaskObjective(profile.storyFlags) },
        bottom_entries: [
            { entry_id: 'settings', state: 'enabled', unavailable_reason: null },
            {
                entry_id: 'achievements',
                state: 'disabled',
                unavailable_reason: CAMP_SYSTEM_ENTRY_FEEDBACK.achievements,
            },
            {
                entry_id: 'leaderboard',
                state: 'disabled',
                unavailable_reason: CAMP_SYSTEM_ENTRY_FEEDBACK.leaderboard,
            },
            {
                entry_id: 'mail',
                state: 'disabled',
                unavailable_reason: CAMP_SYSTEM_ENTRY_FEEDBACK.mail,
            },
            {
                entry_id: 'daily_progress',
                state: 'disabled',
                unavailable_reason: CAMP_SYSTEM_ENTRY_FEEDBACK.dailyProgress,
            },
        ],
        spirit_stone_balance: profile.wallet.immortalCoin,
    };
}

export function createLingPuSnapshot(
    profile: Profile,
    config: LingPuConfig,
    revision: number,
    nowUtc: number,
    lingPu: LingPuService,
): LingPuSnapshotDto {
    const assignment = createAssignment(profile.camp.workerAssignments);
    const idle = Math.max(0, profile.camp.workerCount - totalWorkers(assignment));
    const grainProduced = assignment.spiritGrain * JOB_RATES.spiritGrain.outputPerWorker;
    const netGrain = grainProduced - grainUpkeepPerCycle(assignment);
    const shutdown = new Set(resolveShutdown(
        assignment,
        profile.wallet.spiritGrain + grainProduced,
    ));
    return {
        api_version: 'v1',
        state_version: localVersion(revision),
        server_time_utc: nowUtc,
        cycle_seconds: BASE_CYCLE_SECONDS,
        last_settled_at_utc: profile.camp.lastSettledAtUtc,
        next_settlement_at_utc: profile.camp.lastSettledAtUtc + BASE_CYCLE_SECONDS,
        worker_total: profile.camp.workerCount,
        worker_idle: idle,
        resources: P1_LING_PU_JOBS.map((job) => {
            const stock = profile.wallet[job];
            const capacity = storageCapacity(profile.camp.resourceStorageLevels, job, config);
            const preview = lingPu.previewUpgrade(profile, config, job);
            const isShutdown = shutdown.has(job);
            return {
                resource_id: JOB_TO_API[job],
                stock,
                capacity,
                assigned_workers: assignment[job],
                worker_limit: assignment[job] + idle,
                production_per_cycle: job === 'spiritGrain'
                    ? netGrain
                    : assignment[job] * JOB_RATES[job].outputPerWorker,
                is_full: stock >= capacity,
                is_shutdown: isShutdown,
                shutdown_reason: isShutdown ? 'insufficient_spirit_grain' : null,
                storage_upgrade: {
                    current_level: preview.currentLevel,
                    max_level: preview.maxLevel,
                    current_capacity: preview.currentCapacity,
                    next_capacity: preview.nextCapacity,
                    spirit_wood_cost: preview.spiritWoodCost,
                    can_afford: preview.canAfford,
                    is_max_level: preview.isMaxLevel,
                },
            };
        }),
        recruit: {
            spirit_grain_cost: config.recruitSpiritGrainCost,
            workers_granted: config.workersPerRecruit,
            can_afford: profile.wallet.spiritGrain >= config.recruitSpiritGrainCost,
        },
    };
}

export function createSettlementDto(
    output: SettlementOutput,
    clockRolledBack: boolean,
    discardedSeconds: number,
): LingPuSettlementDto {
    return {
        cycles: output.cycles,
        yields: {
            spirit_grain: output.netGrainChange,
            spirit_wood: output.yields.spiritWood,
            dark_iron: output.yields.darkIron,
        },
        clock_rolled_back: clockRolledBack,
        discarded_seconds: discardedSeconds,
    };
}

export function localVersion(revision: number): string {
    return `local-${revision}`;
}

function currentMainTaskObjective(flags: Readonly<Record<string, boolean>>): string | null {
    if (flags.main_story_complete === true) return null;
    if (flags.met_cen_shou_yi === true) return '整备营地，准备首次入山';
    return '前往议事殿，与岑守一交谈';
}
