/**
 * 关键提示与可访问性编码（PRD-09 §5、任务 P0-HALL-001）。
 *
 * 核心约束：**不能只靠颜色区分**（PRD-09 §5）。
 * 灵根资质、品质、危险等级、警告状态必须同时提供颜色、文字、边框形状、图标四种编码，
 * 否则色觉障碍玩家读不出信息。
 *
 * 纯数据与判定，无引擎依赖：表现层按这里给出的四元组去设置节点，
 * 从而「是否漏了非颜色编码」能被单测拦住，而不是靠人眼审查。
 */

/** 提示等级。数值越大越紧急，可用于排序展示。 */
export const ALERT_LEVELS = ['info', 'caution', 'warning', 'danger'] as const;
export type AlertLevel = (typeof ALERT_LEVELS)[number];

/** 边框形状——颜色之外的第二重编码。 */
export type BorderShape = 'none' | 'solid' | 'dashed' | 'double' | 'notched';

/**
 * 一条提示的完整表现编码。
 * 四个字段都必填，缺任何一个就退化成「只靠颜色」。
 */
export interface AlertPresentation {
    readonly level: AlertLevel;
    /** 颜色，十六进制。 */
    readonly color: string;
    /** 文字标签的本地化 Key。不直接写显示名（策划案 §2 IP 双轨）。 */
    readonly labelKey: string;
    readonly borderShape: BorderShape;
    /** 图标 ID。 */
    readonly iconId: string;
}

/** 四个等级的表现编码表。 */
export const ALERT_PRESENTATIONS: Readonly<Record<AlertLevel, AlertPresentation>> = {
    info: {
        level: 'info',
        color: '#7fa8c9',
        labelKey: 'alert.level.info',
        borderShape: 'none',
        iconId: 'icon_info',
    },
    caution: {
        level: 'caution',
        color: '#c9a961',
        labelKey: 'alert.level.caution',
        borderShape: 'solid',
        iconId: 'icon_caution',
    },
    warning: {
        level: 'warning',
        color: '#d68438',
        labelKey: 'alert.level.warning',
        borderShape: 'dashed',
        iconId: 'icon_warning',
    },
    danger: {
        level: 'danger',
        color: '#c2453f',
        labelKey: 'alert.level.danger',
        borderShape: 'notched',
        iconId: 'icon_danger',
    },
};

/**
 * PRD-09 §5 列出的七类关键提示。
 * 集中定义避免各处硬编码字符串，也便于检查是否全部实现。
 */
export const CRITICAL_ALERTS = [
    'grain_insufficient',
    'burden_near_limit',
    'cannot_return_safely',
    'attribute_check_failure',
    'boss_danger',
    'death_and_revival',
    'save_failed',
] as const;
export type CriticalAlertId = (typeof CRITICAL_ALERTS)[number];

/** 每类关键提示的等级与文案 Key。 */
export const CRITICAL_ALERT_SPECS: Readonly<
    Record<CriticalAlertId, { readonly level: AlertLevel; readonly messageKey: string }>
> = {
    grain_insufficient: { level: 'warning', messageKey: 'alert.grain_insufficient' },
    burden_near_limit: { level: 'caution', messageKey: 'alert.burden_near_limit' },
    // 无法安全返回可能直接导致队伍全灭并遗失战利品，故为 danger
    cannot_return_safely: { level: 'danger', messageKey: 'alert.cannot_return_safely' },
    attribute_check_failure: { level: 'warning', messageKey: 'alert.attribute_check_failure' },
    boss_danger: { level: 'danger', messageKey: 'alert.boss_danger' },
    death_and_revival: { level: 'danger', messageKey: 'alert.death_and_revival' },
    save_failed: { level: 'danger', messageKey: 'alert.save_failed' },
};

export function presentationFor(level: AlertLevel): AlertPresentation {
    return ALERT_PRESENTATIONS[level];
}

export function presentationForAlert(id: CriticalAlertId): AlertPresentation {
    return ALERT_PRESENTATIONS[CRITICAL_ALERT_SPECS[id].level];
}

/**
 * 校验一份表现编码是否满足「不只靠颜色」。
 *
 * 由单测调用。新增等级或修改配置时，这条检查保证不会悄悄退化成
 * 只有颜色不同、文字图标全一样。
 */
export function findColorOnlyViolations(): readonly string[] {
    const problems: string[] = [];
    const seenLabels = new Set<string>();
    const seenIcons = new Set<string>();
    const seenShapes = new Set<BorderShape>();

    for (const level of ALERT_LEVELS) {
        const presentation = ALERT_PRESENTATIONS[level];

        if (!presentation.labelKey) {
            problems.push(`${level} 缺少文字标签`);
        }
        if (!presentation.iconId) {
            problems.push(`${level} 缺少图标`);
        }
        if (!presentation.color) {
            problems.push(`${level} 缺少颜色`);
        }

        // 文字与图标必须各不相同，否则玩家仍然只能靠颜色分辨
        if (seenLabels.has(presentation.labelKey)) {
            problems.push(`${level} 的文字标签与其它等级重复: ${presentation.labelKey}`);
        }
        if (seenIcons.has(presentation.iconId)) {
            problems.push(`${level} 的图标与其它等级重复: ${presentation.iconId}`);
        }
        seenLabels.add(presentation.labelKey);
        seenIcons.add(presentation.iconId);
        seenShapes.add(presentation.borderShape);
    }

    // 至少要有两种边框形状，否则这一维编码没起作用
    if (seenShapes.size < 2) {
        problems.push('全部等级使用同一种边框形状，该维度未提供区分');
    }

    return problems;
}
