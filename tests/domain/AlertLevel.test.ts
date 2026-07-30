import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    ALERT_LEVELS,
    ALERT_PRESENTATIONS,
    CRITICAL_ALERTS,
    CRITICAL_ALERT_SPECS,
    presentationFor,
    presentationForAlert,
    findColorOnlyViolations,
} from 'db://assets/scripts/domain/AlertLevel';

describe('不只靠颜色区分（PRD-09 §5）', () => {
    test('全部等级同时提供颜色、文字、边框、图标', () => {
        const violations = findColorOnlyViolations();
        assert.deepEqual(violations, [], `存在只靠颜色的问题：\n${violations.join('\n')}`);
    });

    test('每个等级的文字标签互不相同', () => {
        const labels = ALERT_LEVELS.map((level) => ALERT_PRESENTATIONS[level].labelKey);
        // 标签重复的话玩家仍然只能靠颜色分辨
        assert.equal(new Set(labels).size, labels.length);
    });

    test('每个等级的图标互不相同', () => {
        const icons = ALERT_LEVELS.map((level) => ALERT_PRESENTATIONS[level].iconId);
        assert.equal(new Set(icons).size, icons.length);
    });

    test('每个等级的颜色互不相同', () => {
        const colors = ALERT_LEVELS.map((level) => ALERT_PRESENTATIONS[level].color);
        assert.equal(new Set(colors).size, colors.length);
    });

    test('至少两种边框形状，该维度确实起作用', () => {
        const shapes = new Set(ALERT_LEVELS.map((l) => ALERT_PRESENTATIONS[l].borderShape));
        assert.ok(shapes.size >= 2);
    });

    test('文字标签用本地化 Key 而非显示名（策划案 §2）', () => {
        for (const level of ALERT_LEVELS) {
            // 直接写中文会绕过 IP 双轨切换
            assert.match(ALERT_PRESENTATIONS[level].labelKey, /^alert\.level\./);
        }
    });
});

describe('关键提示清单（PRD-09 §5）', () => {
    test('七类关键提示全部有配置', () => {
        assert.equal(CRITICAL_ALERTS.length, 7);
        for (const id of CRITICAL_ALERTS) {
            const spec = CRITICAL_ALERT_SPECS[id];
            assert.ok(spec, `${id} 缺少配置`);
            assert.ok(spec.messageKey, `${id} 缺少文案 Key`);
        }
    });

    test('每条提示都能取到完整表现编码', () => {
        for (const id of CRITICAL_ALERTS) {
            const presentation = presentationForAlert(id);
            assert.ok(presentation.color);
            assert.ok(presentation.labelKey);
            assert.ok(presentation.iconId);
        }
    });

    test('无法安全返回与存档失败为最高等级', () => {
        // 前者导致全灭遗失战利品，后者导致进度丢失
        assert.equal(CRITICAL_ALERT_SPECS.cannot_return_safely.level, 'danger');
        assert.equal(CRITICAL_ALERT_SPECS.save_failed.level, 'danger');
    });

    test('负重接近上限为 caution 而非 danger', () => {
        // 超重只是不能拾取，仍可移动返回，不该与全灭同级
        assert.equal(CRITICAL_ALERT_SPECS.burden_near_limit.level, 'caution');
    });

    test('文案 Key 均以 alert. 开头', () => {
        for (const id of CRITICAL_ALERTS) {
            assert.match(CRITICAL_ALERT_SPECS[id].messageKey, /^alert\./);
        }
    });
});

describe('presentationFor', () => {
    test('四个等级均可取到', () => {
        for (const level of ALERT_LEVELS) {
            assert.equal(presentationFor(level).level, level);
        }
    });
});
