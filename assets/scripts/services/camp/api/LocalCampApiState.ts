import type { SettleResult } from 'db://assets/scripts/services/CampEconomy';
import type { Profile } from 'db://assets/scripts/services/GameState';

export function cloneCampProfile(profile: Profile): Profile {
    return {
        ...profile,
        wallet: { ...profile.wallet },
        camp: {
            ...profile.camp,
            buildingLevels: { ...profile.camp.buildingLevels },
            workerAssignments: { ...profile.camp.workerAssignments },
            resourceStorageLevels: { ...profile.camp.resourceStorageLevels },
        },
    };
}

export function emptySettleResult(): SettleResult {
    return {
        state: {} as SettleResult['state'],
        output: {
            yields: {
                spiritGrain: 0,
                spiritWood: 0,
                darkIron: 0,
                spiritStone: 0,
                gengJing: 0,
            },
            cycles: 0,
            shutdownJobs: [],
            grainUpkeepSpent: 0,
            netGrainChange: 0,
        },
        clockRolledBack: false,
        discardedSeconds: 0,
    };
}
