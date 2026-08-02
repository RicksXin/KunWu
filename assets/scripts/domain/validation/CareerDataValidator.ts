import { ATTRIBUTE_KEYS } from '../Attributes';
import { SKILLS_PER_CAREER } from '../CareerTypes';
import { SKILL_TARGET_TYPES, isEnemyTarget, isTauntable } from '../SkillTargeting';
import { ValidationReport } from '../ValidationReport';
import type { DataBundle } from './DataBundleTypes';
import { collectIds, validateLocalizationKey } from './ValidationHelpers';

export function validateSkills(report: ValidationReport, bundle: DataBundle): Set<string> {
    const ids = collectIds(report, 'skills', bundle.skills);
    for (const skill of bundle.skills) {
        validateLocalizationKey(report, 'skills', skill.id, 'nameKey', skill.nameKey, bundle.localizationKeys);
        if (skill.damageKind !== 'none' && !skill.scalingAttribute) {
            report.error('skills', skill.id, `damageKind 为 ${skill.damageKind} 时必须声明 scalingAttribute`, 'scalingAttribute');
        }
        if (skill.scalingAttribute && !ATTRIBUTE_KEYS.includes(skill.scalingAttribute)) {
            report.error('skills', skill.id, `未知属性: ${skill.scalingAttribute}`, 'scalingAttribute');
        }
        if (!SKILL_TARGET_TYPES.includes(skill.targetType)) {
            report.error('skills', skill.id, `未知目标类型: ${skill.targetType}`, 'targetType');
        } else if (!isTauntable(skill.targetType) && skill.ignoreTaunt) {
            report.warn('skills', skill.id, `${skill.targetType} 本就不受嘲讽约束，ignoreTaunt 是冗余配置`, 'ignoreTaunt');
        }
        if (skill.damageKind !== 'none' && !isEnemyTarget(skill.targetType) && skill.targetType !== 'SELF') {
            report.warn(
                'skills', skill.id,
                `damageKind 为 ${skill.damageKind} 但目标为 ${skill.targetType}，请确认是否为吸血/反伤类技能`,
                'targetType',
            );
        }
        for (const [field, value] of [['cooldownTicks', skill.cooldownTicks], ['castTicks', skill.castTicks]] as const) {
            if (!Number.isInteger(value) || value < 0) {
                report.error('skills', skill.id, `${field} 必须为非负整数，收到 ${value}`, field);
            }
        }
    }
    return ids;
}

export function validateCareers(
    report: ValidationReport,
    bundle: DataBundle,
    skillIds: ReadonlySet<string>,
): void {
    const careerIds = collectIds(report, 'careers', bundle.careers);
    for (const career of bundle.careers) {
        validateLocalizationKey(report, 'careers', career.id, 'nameKey', career.nameKey, bundle.localizationKeys);
        if (!ATTRIBUTE_KEYS.includes(career.primaryAttribute)) {
            report.error('careers', career.id, `未知主属性: ${career.primaryAttribute}`, 'primaryAttribute');
        }
        if (career.skillIds.length !== SKILLS_PER_CAREER) {
            report.error('careers', career.id, `必须恰好 ${SKILLS_PER_CAREER} 个主动技能，实际 ${career.skillIds.length} 个`, 'skillIds');
        }
        const seenSkills = new Set<string>();
        career.skillIds.forEach((skillId, index) => {
            if (!skillIds.has(skillId)) report.error('careers', career.id, `引用了不存在的技能: ${skillId}`, `skillIds[${index}]`);
            if (seenSkills.has(skillId)) report.error('careers', career.id, `技能重复: ${skillId}`, `skillIds[${index}]`);
            seenSkills.add(skillId);
        });
        if (career.tier === 'tier_1') {
            if (!career.parentCareerId) {
                report.error('careers', career.id, '一转职业必须声明 parentCareerId', 'parentCareerId');
            } else if (!careerIds.has(career.parentCareerId)) {
                report.error('careers', career.id, `前置职业不存在: ${career.parentCareerId}`, 'parentCareerId');
            } else {
                const parent = bundle.careers.find((row) => row.id === career.parentCareerId);
                if (parent && parent.tier !== 'base') {
                    report.error('careers', career.id, `前置职业必须为初始职业，${parent.id} 是 ${parent.tier}`, 'parentCareerId');
                }
            }
        } else if (career.parentCareerId) {
            report.error('careers', career.id, '初始职业不应有 parentCareerId', 'parentCareerId');
        }
    }
    const skillOwners = new Map<string, string[]>();
    for (const career of bundle.careers) {
        for (const skillId of career.skillIds) {
            const owners = skillOwners.get(skillId) ?? [];
            owners.push(career.id);
            skillOwners.set(skillId, owners);
        }
    }
    for (const [skillId, owners] of skillOwners) {
        if (owners.length > 1) {
            report.error('careers', owners.join('+'), `技能 ${skillId} 被多个职业节点共用：${owners.join(', ')}`, 'skillIds');
        }
    }
    for (const skill of bundle.skills) {
        if (!skillOwners.has(skill.id)) report.warn('skills', skill.id, '未被任何职业引用');
    }
}
