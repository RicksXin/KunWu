import type { P1LingPuJob } from 'db://assets/scripts/domain/LingPu';
import type { CampSystemEntryId } from 'db://assets/scripts/domain/CampBottomHud';

export interface CampTopResourcesViewModel {
    readonly spiritGrain: number;
    readonly spiritWood: number;
    readonly darkIron: number;
    readonly spiritCrystal: number;
    readonly gengJing: number;
}

export interface CampSystemEntryViewModel {
    readonly enabled: boolean;
    readonly hidden: boolean;
    readonly unavailableReason: string | null;
}

export interface CampHudViewModel {
    readonly stateVersion: string;
    readonly resources: CampTopResourcesViewModel;
    readonly mainTaskObjective: string | null;
    readonly systemEntries: Readonly<Record<CampSystemEntryId, CampSystemEntryViewModel>>;
    readonly spiritStoneBalance: number;
}

export interface LingPuStorageUpgradeViewModel {
    readonly currentLevel: number;
    readonly maxLevel: number;
    readonly currentCapacity: number;
    readonly nextCapacity: number | null;
    readonly spiritWoodCost: number | null;
    readonly canAfford: boolean;
    readonly isMaxLevel: boolean;
}

export interface LingPuResourceViewModel {
    readonly job: P1LingPuJob;
    readonly stock: number;
    readonly capacity: number;
    readonly workerCount: number;
    readonly workerLimit: number;
    readonly displayedProduction: number;
    readonly isFull: boolean;
    readonly isShutdown: boolean;
    readonly shutdownReason: string | null;
    readonly upgrade: LingPuStorageUpgradeViewModel;
}

export interface LingPuViewModel {
    readonly stateVersion: string;
    readonly serverTimeUtc: number;
    readonly cycleSeconds: number;
    readonly nextSettlementAtUtc: number;
    readonly workerTotal: number;
    readonly workerIdle: number;
    readonly resources: Readonly<Record<P1LingPuJob, LingPuResourceViewModel>>;
    readonly recruit: {
        readonly spiritGrainCost: number;
        readonly workersGranted: number;
        readonly canAfford: boolean;
    };
}

export interface LingPuTimerViewModel {
    readonly secondsUntilNextCycle: number;
    readonly cycleProgress: number;
}
