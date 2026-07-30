import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_LEVELS, ALERT_PRESENTATIONS } from 'db://assets/scripts/domain/AlertLevel';

/**
 * 颜色解析测试。
 *
 * 不导入 AlertIcon.ts——它 import 'cc'，Node 下无法加载。
 * 这里复制同一套解析逻辑并断言与 AlertIcon.hexToColor 行为一致；
 * 真正的价值在于校验 ALERT_PRESENTATIONS 的颜色字符串本身合法，
 * 格式错了会让图标画成黑色或直接抛错。
 */
function parseHex(hex: string): { r: number; g: number; b: number } {
    const value = hex.replace('#', '');
    if (value.length !== 6) {
        throw new Error(`颜色须为 #rrggbb 格式，收到 ${hex}`);
    }
    return {
        r: Number.parseInt(value.slice(0, 2), 16),
        g: Number.parseInt(value.slice(2, 4), 16),
        b: Number.parseInt(value.slice(4, 6), 16),
    };
}

describe('提示颜色合法性', () => {
    test('四个等级的颜色均为 #rrggbb 格式', () => {
        for (const level of ALERT_LEVELS) {
            const hex = ALERT_PRESENTATIONS[level].color;
            assert.match(hex, /^#[0-9a-f]{6}$/i, `${level} 的颜色 ${hex} 格式非法`);
        }
    });

    test('解析出的分量都在 0–255', () => {
        for (const level of ALERT_LEVELS) {
            const { r, g, b } = parseHex(ALERT_PRESENTATIONS[level].color);
            for (const [name, v] of [['r', r], ['g', g], ['b', b]] as const) {
                assert.ok(
                    Number.isInteger(v) && v >= 0 && v <= 255,
                    `${level} 的 ${name} 分量非法: ${v}`,
                );
            }
        }
    });

    test('颜色在深色底上有足够亮度', () => {
        // 背景为 #0d0b0f，图标太暗会看不见
        for (const level of ALERT_LEVELS) {
            const { r, g, b } = parseHex(ALERT_PRESENTATIONS[level].color);
            // 感知亮度（ITU-R BT.601）
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;
            assert.ok(luma > 80, `${level} 亮度 ${luma.toFixed(0)} 过低，深色底上不可见`);
        }
    });

    test('danger 比 info 更醒目（红分量更高）', () => {
        const danger = parseHex(ALERT_PRESENTATIONS.danger.color);
        const info = parseHex(ALERT_PRESENTATIONS.info.color);
        assert.ok(danger.r > info.r, 'danger 应比 info 更偏红');
    });

    test('非法格式抛错', () => {
        assert.throws(() => parseHex('#fff'), /#rrggbb/);
        assert.throws(() => parseHex('red'), /#rrggbb/);
    });
});

describe('图标形状与边框形状对应', () => {
    test('四个等级的边框形状互不相同（PRD-09 §5）', () => {
        const shapes = ALERT_LEVELS.map((l) => ALERT_PRESENTATIONS[l].borderShape);
        // AlertIcon 按等级画圆/方/三角/八角，边框形状也须各异，
        // 否则「形状」这一维编码失效
        assert.equal(new Set(shapes).size, shapes.length, `边框形状有重复: ${shapes.join(', ')}`);
    });

    test('info 无边框，其余有', () => {
        assert.equal(ALERT_PRESENTATIONS.info.borderShape, 'none');
        for (const level of ['caution', 'warning', 'danger'] as const) {
            assert.notEqual(ALERT_PRESENTATIONS[level].borderShape, 'none');
        }
    });
});
