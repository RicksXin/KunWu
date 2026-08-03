import { recordOf } from './ProfileValueReaders';

/** v7 → v8：持久化断粮后的衰竭移动步数。 */
export function migrateProfileV7ToV8(payload: Record<string, unknown>): Record<string, unknown> {
    const profile = recordOf(payload, 'profile');
    if (!profile.expedition || typeof profile.expedition !== 'object'
        || Array.isArray(profile.expedition)) {
        return { ...profile };
    }
    const expedition = profile.expedition as Record<string, unknown>;
    return {
        ...profile,
        expedition: {
            ...expedition,
            grainDepletionSteps: expedition.grainDepletionSteps ?? 0,
        },
    };
}
