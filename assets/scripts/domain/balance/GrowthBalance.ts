import { ATTRIBUTE_KEYS } from '../Attributes';
import type { AttributeKey } from '../Attributes';
import { HERO_GRADES } from '../HeroGrowth';
import type { GrowthRates, HeroGrade } from '../HeroGrowth';
import { nonNegativeIntegerOf, positiveIntegerOf, recordOf, stripCommentKeys } from './BalanceReaders';
import type { CareerPrimaryAttribute, GradeMultiplier } from './BalanceTypes';

export function parseGrowthRates(value: unknown): Record<string, GrowthRates> {
    const raw = stripCommentKeys(recordOf(value, 'growth_rates'));
    const careerIds = Object.keys(raw);
    if (careerIds.length === 0) throw new Error('growth_rates 至少需要一个职业');
    const result: Record<string, GrowthRates> = {};
    for (const careerId of careerIds) {
        const path = `growth_rates.${careerId}`;
        const rates = recordOf(raw[careerId], path);
        const parsed = {} as Record<AttributeKey, number>;
        for (const key of ATTRIBUTE_KEYS) {
            const rate = nonNegativeIntegerOf(rates[key], `${path}.${key}`);
            if (rate === 0) {
                throw new Error(
                    `${path}.${key} 不得为 0：该维会终身冻结，使减伤与生命上限对本职业失效。` +
                    `无关维请填 200–400（每级 0.2–0.4 点）`,
                );
            }
            parsed[key] = rate;
        }
        const unknownKeys = Object.keys(rates).filter(
            (key) => !key.startsWith('//') && !(ATTRIBUTE_KEYS as readonly string[]).includes(key),
        );
        if (unknownKeys.length > 0) throw new Error(`${path} 含未知属性键：${unknownKeys.join(', ')}`);
        result[careerId] = parsed;
    }
    return result;
}

export function parseGradeMultipliers(value: unknown): Record<HeroGrade, GradeMultiplier> {
    const raw = stripCommentKeys(recordOf(value, 'grade_multipliers'));
    const result = {} as Record<HeroGrade, GradeMultiplier>;
    for (const grade of HERO_GRADES) {
        const path = `grade_multipliers.${grade}`;
        const entry = recordOf(raw[grade], path);
        result[grade] = {
            basePercent: positiveIntegerOf(entry.basePercent, `${path}.basePercent`),
            growthPercent: positiveIntegerOf(entry.growthPercent, `${path}.growthPercent`),
        };
    }
    for (let index = 1; index < HERO_GRADES.length; index += 1) {
        const previous = result[HERO_GRADES[index - 1]!];
        const current = result[HERO_GRADES[index]!];
        if (current.basePercent <= previous.basePercent) {
            throw new Error(
                `grade_multipliers.basePercent 必须随品级严格递增：${HERO_GRADES[index]} 不高于 ${HERO_GRADES[index - 1]}`,
            );
        }
        if (current.growthPercent <= previous.growthPercent) {
            throw new Error(
                `grade_multipliers.growthPercent 必须随品级严格递增：${HERO_GRADES[index]} 不高于 ${HERO_GRADES[index - 1]}`,
            );
        }
    }
    return result;
}

export function assertPrimaryAttributeMatchesGrowth(
    growthRates: Readonly<Record<string, GrowthRates>>,
    careers: readonly CareerPrimaryAttribute[],
): void {
    for (const career of careers) {
        const rates = growthRates[career.id];
        if (!rates) continue;
        const highest = Math.max(...ATTRIBUTE_KEYS.map((key) => rates[key]));
        if (rates[career.primaryAttribute] < highest) {
            const actual = ATTRIBUTE_KEYS.filter((key) => rates[key] === highest);
            throw new Error(
                `职业 ${career.id} 声明主属性为 ${career.primaryAttribute}，` +
                `但 growth_rates 中成长最高的是 ${actual.join('/')}`,
            );
        }
    }
}

export function assertGrowthRatesCoverCareers(
    growthRates: Readonly<Record<string, GrowthRates>>,
    careerIds: readonly string[],
): void {
    const configured = new Set(Object.keys(growthRates));
    const expected = new Set(careerIds);
    const missing = [...expected].filter((id) => !configured.has(id)).sort();
    const extra = [...configured].filter((id) => !expected.has(id)).sort();
    if (missing.length === 0 && extra.length === 0) return;
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`缺少职业 ${missing.join(', ')}`);
    if (extra.length > 0) parts.push(`多出未知职业 ${extra.join(', ')}`);
    throw new Error(`growth_rates 与 careers 表不一致：${parts.join('；')}`);
}
