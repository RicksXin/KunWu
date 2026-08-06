import type { CampSystemEntryId } from 'db://assets/scripts/domain/CampBottomHud';
import type { P1LingPuJob } from 'db://assets/scripts/domain/LingPu';
import type { Profile } from 'db://assets/scripts/services/GameState';
import type {
    CampBottomEntryId,
    CampHudSnapshotDto,
    LingPuApiResourceId,
    LingPuResourceDto,
    LingPuSnapshotDto,
} from 'db://assets/scripts/services/camp/api/CampApiDtos';
import type {
    CampHudViewModel,
    CampSystemEntryViewModel,
    LingPuResourceViewModel,
    LingPuViewModel,
} from './CampApplicationModels';

const API_ENTRY_TO_DOMAIN: Readonly<Record<CampBottomEntryId, CampSystemEntryId>> = {
    settings: 'settings',
    achievements: 'achievements',
    leaderboard: 'leaderboard',
    mail: 'mail',
    daily_progress: 'dailyProgress',
};

const API_RESOURCE_TO_JOB: Readonly<Record<LingPuApiResourceId, P1LingPuJob>> = {
    spirit_grain: 'spiritGrain',
    spirit_wood: 'spiritWood',
    dark_iron: 'darkIron',
};

const JOB_TO_API_RESOURCE: Readonly<Record<P1LingPuJob, LingPuApiResourceId>> = {
    spiritGrain: 'spirit_grain',
    spiritWood: 'spirit_wood',
    darkIron: 'dark_iron',
};

export function apiResourceIdForJob(job: P1LingPuJob): LingPuApiResourceId {
    return JOB_TO_API_RESOURCE[job];
}

export function applyCampHudSnapshot(profile: Profile, dto: CampHudSnapshotDto): void {
    for (const resource of dto.top_resources) {
        switch (resource.resource_id) {
            case 'spirit_grain': profile.wallet.spiritGrain = resource.amount; break;
            case 'spirit_wood': profile.wallet.spiritWood = resource.amount; break;
            case 'dark_iron': profile.wallet.darkIron = resource.amount; break;
            case 'spirit_crystal': profile.wallet.spiritStone = resource.amount; break;
            case 'geng_jing': profile.wallet.gengJing = resource.amount; break;
        }
    }
    profile.wallet.immortalCoin = dto.spirit_stone_balance;
}

export function toCampHudViewModel(dto: CampHudSnapshotDto): CampHudViewModel {
    const amount = (resourceId: CampHudSnapshotDto['top_resources'][number]['resource_id']) =>
        dto.top_resources.find((resource) => resource.resource_id === resourceId)?.amount ?? 0;
    const disabledEntry = (): CampSystemEntryViewModel => ({
        enabled: false,
        hidden: false,
        unavailableReason: '入口状态尚未加载',
    });
    const entries: Record<CampSystemEntryId, CampSystemEntryViewModel> = {
        settings: disabledEntry(),
        achievements: disabledEntry(),
        leaderboard: disabledEntry(),
        mail: disabledEntry(),
        dailyProgress: disabledEntry(),
    };
    for (const entry of dto.bottom_entries) {
        entries[API_ENTRY_TO_DOMAIN[entry.entry_id]] = {
            enabled: entry.state === 'enabled',
            hidden: entry.state === 'hidden',
            unavailableReason: entry.unavailable_reason,
        };
    }
    return {
        stateVersion: dto.state_version,
        resources: {
            spiritGrain: amount('spirit_grain'),
            spiritWood: amount('spirit_wood'),
            darkIron: amount('dark_iron'),
            spiritCrystal: amount('spirit_crystal'),
            gengJing: amount('geng_jing'),
        },
        mainTaskObjective: dto.main_task.objective,
        systemEntries: entries,
        spiritStoneBalance: dto.spirit_stone_balance,
    };
}

export function applyLingPuSnapshot(profile: Profile, dto: LingPuSnapshotDto): void {
    profile.camp.workerCount = dto.worker_total;
    profile.camp.lastSettledAtUtc = dto.last_settled_at_utc;
    for (const resource of dto.resources) {
        const job = API_RESOURCE_TO_JOB[resource.resource_id];
        profile.wallet[job] = resource.stock;
        profile.camp.workerAssignments[job] = resource.assigned_workers;
        profile.camp.resourceStorageLevels[job] = resource.storage_upgrade.current_level;
    }
}

export function toLingPuViewModel(dto: LingPuSnapshotDto): LingPuViewModel {
    const resource = (job: P1LingPuJob): LingPuResourceViewModel =>
        toResourceViewModel(requireResource(dto, JOB_TO_API_RESOURCE[job]));
    return {
        stateVersion: dto.state_version,
        serverTimeUtc: dto.server_time_utc,
        cycleSeconds: dto.cycle_seconds,
        nextSettlementAtUtc: dto.next_settlement_at_utc,
        workerTotal: dto.worker_total,
        workerIdle: dto.worker_idle,
        resources: {
            spiritGrain: resource('spiritGrain'),
            spiritWood: resource('spiritWood'),
            darkIron: resource('darkIron'),
        },
        recruit: {
            spiritGrainCost: dto.recruit.spirit_grain_cost,
            workersGranted: dto.recruit.workers_granted,
            canAfford: dto.recruit.can_afford,
        },
    };
}

function requireResource(
    dto: LingPuSnapshotDto,
    resourceId: LingPuApiResourceId,
): LingPuResourceDto {
    const resource = dto.resources.find((item) => item.resource_id === resourceId);
    if (!resource) throw new Error(`灵源院响应缺少资源 ${resourceId}`);
    return resource;
}

function toResourceViewModel(dto: LingPuResourceDto): LingPuResourceViewModel {
    return {
        job: API_RESOURCE_TO_JOB[dto.resource_id],
        stock: dto.stock,
        capacity: dto.capacity,
        workerCount: dto.assigned_workers,
        workerLimit: dto.worker_limit,
        displayedProduction: dto.production_per_cycle,
        isFull: dto.is_full,
        isShutdown: dto.is_shutdown,
        shutdownReason: dto.shutdown_reason,
        upgrade: {
            currentLevel: dto.storage_upgrade.current_level,
            maxLevel: dto.storage_upgrade.max_level,
            currentCapacity: dto.storage_upgrade.current_capacity,
            nextCapacity: dto.storage_upgrade.next_capacity,
            spiritWoodCost: dto.storage_upgrade.spirit_wood_cost,
            canAfford: dto.storage_upgrade.can_afford,
            isMaxLevel: dto.storage_upgrade.is_max_level,
        },
    };
}
