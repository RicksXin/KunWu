import type { Profile } from 'db://assets/scripts/services/GameState';

export function mapMoveRejectionMessage(reason: string): string {
    switch (reason) {
        case 'not_adjacent': return '只能移动到相邻格';
        case 'out_of_bounds': return '前方已超出当前开放区域';
        case 'not_walkable': return '前方被残禁封锁';
        case 'insufficient_grain': return '护体灵息已耗尽，队伍无法继续行进';
        default: return '当前无法移动';
    }
}

export function replaceSet(target: Set<string>, values: readonly string[]): void {
    target.clear();
    values.forEach((value) => target.add(value));
}

export function restoreStamina(
    profile: Profile,
    values: readonly (readonly [string, number])[],
): void {
    const lookup = new Map(values);
    profile.roster.forEach((hero) => {
        const previous = lookup.get(hero.instanceId);
        if (previous !== undefined) hero.stamina = previous;
    });
}

export function restoreRecordValue(
    record: Record<string, number>,
    key: string,
    value: number | undefined,
): void {
    if (value === undefined) delete record[key];
    else record[key] = value;
}

export function replaceRecord(
    target: Record<string, number>,
    values: Readonly<Record<string, number>>,
): void {
    Object.keys(target).forEach((key) => delete target[key]);
    Object.assign(target, values);
}

export function mapErrorMessage(prefix: string, error: unknown): string {
    return `${prefix}：${error instanceof Error ? error.message : String(error)}`;
}
