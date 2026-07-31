import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CAMP_SYSTEM_ENTRY_FEEDBACK,
    CAMP_SYSTEM_ENTRY_IDS,
    CAMP_SYSTEM_ENTRY_NAMES,
    campCurrencyBalances,
} from 'db://assets/scripts/domain/CampBottomHud';

describe('大厅底部系统入口', () => {
    test('从左到右固定为设置、成就、排行榜、邮件、日常进度', () => {
        assert.deepEqual(CAMP_SYSTEM_ENTRY_IDS, [
            'settings',
            'achievements',
            'leaderboard',
            'mail',
            'dailyProgress',
        ]);
        assert.deepEqual(
            CAMP_SYSTEM_ENTRY_IDS.map((id) => CAMP_SYSTEM_ENTRY_NAMES[id]),
            ['设置', '成就', '排行', '邮件', '日常'],
        );
    });

    test('除设置外统一提供未开放反馈', () => {
        assert.deepEqual(Object.keys(CAMP_SYSTEM_ENTRY_FEEDBACK), [
            'achievements',
            'leaderboard',
            'mail',
            'dailyProgress',
        ]);
        for (const message of Object.values(CAMP_SYSTEM_ENTRY_FEEDBACK)) {
            assert.match(message, /尚未开放$/);
        }
    });
});

describe('灵晶与灵石字段映射', () => {
    test('顶部读取 spiritStone，底部读取 immortalCoin', () => {
        assert.deepEqual(
            campCurrencyBalances({ spiritStone: 17, immortalCoin: 29 }),
            {
                topSpiritCrystal: 17,
                bottomSpiritStone: 29,
            },
        );
    });
});
