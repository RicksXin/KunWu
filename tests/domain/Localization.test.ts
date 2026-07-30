import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    ALERT_LEVELS,
    CRITICAL_ALERTS,
    CRITICAL_ALERT_SPECS,
    ALERT_PRESENTATIONS,
} from 'db://assets/scripts/domain/AlertLevel';
import { BUILDING_IDS, BOTTOM_NAV_ITEMS } from 'db://assets/scripts/domain/HallBadges';
import { ATTRIBUTE_KEYS } from 'db://assets/scripts/domain/Attributes';
import {
    BOOT_STAGES,
    BOOT_STAGE_MESSAGE_KEYS,
} from 'db://assets/scripts/services/BootSequence';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/**
 * 本地化表。缺 Key 的症状是界面显示原始 Key（如 `alert.level.info`），
 * 不报错但很难看，故用测试守住。
 */
const table: Record<string, string> = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'assets/data/localization/zh_cn.json'), 'utf8'),
);

function has(key: string): boolean {
    return typeof table[key] === 'string' && table[key].length > 0;
}

describe('本地化表完整性', () => {
    test('四个提示等级的标签均有文案', () => {
        for (const level of ALERT_LEVELS) {
            const key = ALERT_PRESENTATIONS[level].labelKey;
            assert.ok(has(key), `缺少 ${key}`);
        }
    });

    test('七类关键提示均有文案（PRD-09 §5）', () => {
        for (const id of CRITICAL_ALERTS) {
            const key = CRITICAL_ALERT_SPECS[id].messageKey;
            assert.ok(has(key), `缺少 ${key}`);
        }
    });

    test('七座建筑均有名称', () => {
        for (const id of BUILDING_IDS) {
            assert.ok(has(`building.${id}`), `缺少 building.${id}`);
        }
    });

    test('五项底部导航均有名称', () => {
        for (const item of BOTTOM_NAV_ITEMS) {
            assert.ok(has(`nav.${item}`), `缺少 nav.${item}`);
        }
    });

    test('七维属性均有名称', () => {
        // 字段名已冻结，文案必须与之一一对应
        const expected: Record<string, string> = {
            strength: '力道',
            magic: '法力',
            technique: '神识',
            speed: '遁速',
            constitution: '肉身',
            armor: '护体',
            resistance: '定力',
        };
        for (const key of ATTRIBUTE_KEYS) {
            const localeKey = `attribute.${toSnake(key)}`;
            assert.ok(has(localeKey), `缺少 ${localeKey}`);
            assert.equal(table[localeKey], expected[key], `${localeKey} 文案不符`);
        }
    });

    test('启动画面文案齐备', () => {
        for (const key of [
            'splash.title',
            'splash.subtitle',
            'splash.initializing',
            'splash.load_failed',
        ]) {
            assert.ok(has(key), `缺少 ${key}`);
        }
    });

    test('每个启动阶段都有文案（PRD-10 §8）', () => {
        // 缺文案时启动画面会显示原始 Key，玩家看到 splash.loading_camp
        for (const stage of BOOT_STAGES) {
            const key = BOOT_STAGE_MESSAGE_KEYS[stage];
            assert.ok(has(key), `阶段 ${stage} 的文案 ${key} 缺失`);
        }
    });

    test('四类启动失败均有可读提示', () => {
        for (const key of [
            'boot.error.boot_bundle',
            'boot.error.camp_bundle',
            'boot.error.save',
            'boot.error.scene',
        ]) {
            assert.ok(has(key), `缺少 ${key}`);
        }
    });
});

describe('本地化表格式', () => {
    test('无空值', () => {
        for (const [key, value] of Object.entries(table)) {
            if (key === '//') {
                continue;
            }
            assert.ok(
                typeof value === 'string' && value.trim().length > 0,
                `${key} 的文案为空`,
            );
        }
    });

    test('Key 为小写点分格式', () => {
        for (const key of Object.keys(table)) {
            if (key === '//') {
                continue;
            }
            assert.match(key, /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/, `${key} 格式非法`);
        }
    });

    test('文案不含未替换的占位符', () => {
        for (const [key, value] of Object.entries(table)) {
            if (key === '//') {
                continue;
            }
            assert.ok(!value.includes('TODO'), `${key} 仍是占位文案`);
        }
    });
});

/** technique → technique；驼峰转蛇形，供本地化 Key 使用。 */
function toSnake(value: string): string {
    return value.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}
