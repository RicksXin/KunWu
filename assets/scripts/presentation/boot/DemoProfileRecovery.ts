import type { Profile } from 'db://assets/scripts/services/GameState';
import { recoverDemoRoster } from 'db://assets/scripts/services/ProfileCodec';

const AUTO_RECOVERY_FLAG = 'debug_d0_auto_revive_20260803_03';

export interface DemoProfileRecovery {
    readonly recovered: boolean;
    readonly clearRequest: boolean;
    readonly message: string;
}

export function prepareDemoProfileRecovery(profile: Profile): DemoProfileRecovery {
    if (!isLocalPreview()) return noRecovery();
    const explicitlyRequested = new URLSearchParams(window.location.search)
        .get('d0_profile_recovery') === 'revive_party';
    const allDead = profile.roster.length > 0 && profile.roster.every((hero) => hero.isDead);
    const activePreset = profile.expeditionPreparation.partyPresets.find(
        (preset) => preset.presetId === profile.expeditionPreparation.activePresetId,
    );
    const activeMemberIds = activePreset?.slots.filter((id): id is string => id !== null) ?? [];
    const activePartyWiped = activeMemberIds.length > 0 && activeMemberIds.every((id) =>
        profile.roster.find((hero) => hero.instanceId === id)?.isDead === true,
    );
    const automatic = (allDead || activePartyWiped)
        && profile.storyFlags[AUTO_RECOVERY_FLAG] !== true;
    if (!explicitlyRequested && !automatic) return noRecovery();
    profile.storyFlags[AUTO_RECOVERY_FLAG] = true;
    recoverDemoRoster(profile);
    return {
        recovered: true,
        clearRequest: explicitlyRequested,
        message: '四名修士已恢复并重新编入当前队伍',
    };
}

export function finishDemoProfileRecovery(recovery: DemoProfileRecovery): void {
    if (!recovery.clearRequest || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('d0_profile_recovery');
    window.history.replaceState(window.history.state, '', url.toString());
}

function isLocalPreview(): boolean {
    if (typeof window === 'undefined') return false;
    return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

function noRecovery(): DemoProfileRecovery {
    return { recovered: false, clearRequest: false, message: '' };
}
