import type { Wallet } from '../services/GameState';

/** 大厅底部左侧固定入口，顺序即视觉上的从左到右顺序。 */
export const CAMP_SYSTEM_ENTRY_IDS = [
    'settings',
    'achievements',
    'leaderboard',
    'mail',
    'dailyProgress',
] as const;

export type CampSystemEntryId = (typeof CAMP_SYSTEM_ENTRY_IDS)[number];

export const CAMP_SYSTEM_ENTRY_NAMES: Readonly<Record<CampSystemEntryId, string>> = {
    settings: '设置',
    achievements: '成就',
    leaderboard: '排行',
    mail: '邮件',
    dailyProgress: '日常',
};

export const CAMP_SYSTEM_ENTRY_FEEDBACK: Readonly<
    Record<Exclude<CampSystemEntryId, 'settings'>, string>
> = {
    achievements: '成就尚未开放',
    leaderboard: '排行榜尚未开放',
    mail: '邮件尚未开放',
    dailyProgress: '日常进度尚未开放',
};

/** 明确顶部灵晶与底部灵石的字段映射，防止表现层串用余额。 */
export function campCurrencyBalances(
    wallet: Pick<Wallet, 'spiritStone' | 'immortalCoin'>,
): {
    readonly topSpiritCrystal: number;
    readonly bottomSpiritStone: number;
} {
    return {
        topSpiritCrystal: wallet.spiritStone,
        bottomSpiritStone: wallet.immortalCoin,
    };
}
