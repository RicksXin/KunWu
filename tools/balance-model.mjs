/**
 * 数值模型：从 balance 表与 careers 表推演面板、TTK 和经济解空间。
 *
 * 这是「人看的 Excel」与「程序读的 JSON」之间唯一的计算层。两边都从这里取数，
 * 保证 Excel 里的每个数字都能追溯到某张表，不存在只活在 Excel 里的手填值。
 *
 * 公式与 assets/scripts/domain/ 的实现保持一致（CombatFormulas、HeroGrowth）。
 * 若两边算出的数不同，说明代码或本文件有一处漂移——这正是仿真器要暴露的。
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

// 复用测试用的解析钩子，使本文件能直接导入领域层 TS
register('../tests/resolver.mjs', import.meta.url);

const { parseBalanceTables } = await import(
    pathToFileURL(path.join(REPO_ROOT, 'assets/scripts/domain/BalanceTables.ts')).href
);
const { computeGrowth, scaleBaseByGrade } = await import(
    pathToFileURL(path.join(REPO_ROOT, 'assets/scripts/domain/HeroGrowth.ts')).href
);
const { createAttributes } = await import(
    pathToFileURL(path.join(REPO_ROOT, 'assets/scripts/domain/Attributes.ts')).href
);
const DATA_ROOT = path.join(REPO_ROOT, 'assets', 'data');
const BALANCE_ROOT = path.join(DATA_ROOT, 'balance');

/** 七维键序，与 domain/Attributes.ts 的 ATTRIBUTE_KEYS 一致，不得改动。 */
export const ATTRIBUTE_KEYS = [
    'strength',
    'magic',
    'technique',
    'speed',
    'constitution',
    'armor',
    'resistance',
];

/** 七维中文显示名（PRD-03 §8）。仅用于 Excel 表头，不参与逻辑。 */
export const ATTRIBUTE_LABELS = {
    strength: '力道',
    magic: '法力',
    technique: '神识',
    speed: '遁速',
    constitution: '肉身',
    armor: '护体',
    resistance: '定力',
};

export const CAREER_LABELS = {
    ti_xiu: '体修',
    wu_xiu: '武修',
    qian_xiu: '潜修',
    fa_xiu: '法修',
    yi_xiu: '医修',
    fu_xiu: '符修',
};

export const JOB_LABELS = {
    spiritGrain: '灵粮',
    spiritWood: '灵木',
    darkIron: '玄铁',
    spiritStone: '灵晶',
    gengJing: '庚精',
};

export const GRADES = ['D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];

/** 结算频率，与 domain/CombatTypes.ts 的 SIMULATION_TICK_HZ 一致。 */
export const TICK_HZ = 20;

/** 展示用的采样等级。含 10（一转开放）与 20/40（境界边界）。 */
export const SAMPLE_LEVELS = [1, 10, 20, 30, 40, 50, 60];

function readJson(file) {
    return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * 载入全部数据表。
 *
 * 解析走领域层的 parseBalanceTables，不在此重新实现一遍：
 * 两处解析等于两套口径，漂移后 Excel 显示的数就不再是游戏用的数。
 * 校验失败直接抛错传上去——本脚本的产物是给人看的表，宁可不生成也不能生成错的。
 */
export function loadTables() {
    const need = (name) => {
        const file = path.join(BALANCE_ROOT, `${name}.json`);
        if (!existsSync(file)) {
            throw new Error(`缺少数据表 assets/data/balance/${name}.json`);
        }
        return readJson(file);
    };

    const careersDir = path.join(DATA_ROOT, 'careers');
    const careers = {};
    for (const name of readdirSync(careersDir).filter((f) => f.endsWith('.json'))) {
        const data = readJson(path.join(careersDir, name));
        careers[data.id] = data;
    }

    const skillsDir = path.join(careersDir, 'skills');
    const skills = {};
    for (const name of readdirSync(skillsDir).filter((f) => f.endsWith('.json'))) {
        const data = readJson(path.join(skillsDir, name));
        skills[data.id] = data;
    }

    const balance = parseBalanceTables({
        growth_rates: need('growth_rates'),
        grade_multipliers: need('grade_multipliers'),
        combat_constants: need('combat_constants'),
        production_rates: need('production_rates'),
        realm_ranges: need('realm_ranges'),
    });

    return { careers, skills, ...balance };
}

/**
 * 七维面板。
 *
 * 走领域层的 scaleBaseByGrade 与 computeGrowth，不在此重算一遍公式：
 * 仿真器的价值是「表里的数会让游戏变成什么样」，若两边各算一套，
 * 它就只能证明自己自洽，证明不了游戏对不对。
 */
export function attributesAt(tables, careerId, level, grade) {
    const career = tables.careers[careerId];
    if (!career) {
        throw new Error(`职业 ${careerId} 不在 careers 表内`);
    }
    const rates = tables.growthRates[careerId];
    if (!rates) {
        throw new Error(`职业 ${careerId} 缺少成长率配置`);
    }
    const mult = tables.gradeMultipliers[grade];
    if (!mult) {
        throw new Error(`品级 ${grade} 不在 grade_multipliers 表内`);
    }

    const base = scaleBaseByGrade(
        createAttributes(career.baseAttributes),
        grade,
        mult.basePercent,
    );
    const growth = computeGrowth(level, grade, rates, mult.growthPercent);

    const result = {};
    for (const key of ATTRIBUTE_KEYS) {
        result[key] = base[key] + growth[key];
    }
    return result;
}

/** 生命上限（PRD-04 §5）。 */
export function maxHpOf(tables, careerId, attrs) {
    const factor = tables.combat.constitutionHpFactor;
    return Math.max(
        1,
        tables.careers[careerId].baseHp + attrs.constitution * factor,
    );
}

/** 减伤等级常数 K(L)。 */
export function defenseConstantAt(tables, level) {
    const { base, perTenLevels } = tables.combat.defenseLevelConstant;
    return base + Math.floor((perTenLevels * (level - 1)) / 10);
}

/** 减伤率，0–1。负防御按 0 处理，否则会变成增伤。 */
export function reductionOf(defenseValue, levelConstant) {
    const defense = Math.max(0, defenseValue);
    return defense / (defense + levelConstant);
}

/** 行动间隔，tick（PRD-04 §3）。 */
export function intervalTicks(tables, baseIntervalTicks, speed) {
    const raw = Math.floor((baseIntervalTicks * 100) / (100 + speed));
    return Math.min(
        tables.combat.maxActionIntervalTicks,
        Math.max(tables.combat.minActionIntervalTicks, raw),
    );
}

/** 技能裸伤，未扣防御（PRD-04 §5）。 */
export function skillBaseDamage(attrs, skill) {
    let total = (attrs[skill.scalingAttribute] * skill.primaryPercent) / 100;
    if (skill.secondaryAttribute) {
        total += (attrs[skill.secondaryAttribute] * (skill.secondaryPercent ?? 0)) / 100;
    }
    return Math.floor(total);
}

/** 取职业的主输出技能，即三技能里第一个有伤害的。 */
export function primaryAttackSkill(tables, careerId) {
    return tables.careers[careerId].skillIds
        .map((id) => tables.skills[id])
        .find((s) => s && s.damageKind !== 'none');
}

/** 取职业的治疗技能，用于奶量核算。 */
export function healSkill(tables, careerId) {
    return tables.careers[careerId].skillIds
        .map((id) => tables.skills[id])
        .find((s) => s && s.damageKind === 'none' && s.primaryPercent > 0);
}

/** 单个职业在某等级某品级的完整推演结果。 */
export function profileOf(tables, careerId, level, grade) {
    const attrs = attributesAt(tables, careerId, level, grade);
    const hp = maxHpOf(tables, careerId, attrs);
    const K = defenseConstantAt(tables, level);
    const skill = primaryAttackSkill(tables, careerId);

    const raw = skill ? skillBaseDamage(attrs, skill) : 0;
    const ticks = skill ? intervalTicks(tables, skill.baseIntervalTicks, attrs.speed) : 0;
    const seconds = ticks / TICK_HZ;

    return {
        careerId,
        level,
        grade,
        attrs,
        hp,
        K,
        skillId: skill?.id ?? null,
        damageKind: skill?.damageKind ?? null,
        rawDamage: raw,
        intervalTicks: ticks,
        intervalSeconds: seconds,
        dps: seconds > 0 ? raw / seconds : 0,
        physicalReduction: reductionOf(attrs.armor, K),
        magicalReduction: reductionOf(attrs.resistance, K),
    };
}

/** 攻方对守方的单挑推演。同级同品，无治疗、无嘲讽、无冷却。 */
export function duelOf(tables, attackerId, defenderId, level, grade) {
    const atk = profileOf(tables, attackerId, level, grade);
    const def = profileOf(tables, defenderId, level, grade);
    if (!atk.skillId) {
        return null;
    }

    const defenseValue =
        atk.damageKind === 'physical' ? def.attrs.armor : def.attrs.resistance;
    const reduction = reductionOf(defenseValue, atk.K);
    const perHit = Math.max(
        tables.combat.minDamage,
        Math.floor(atk.rawDamage * (1 - reduction)),
    );
    const hits = Math.ceil(def.hp / perHit);

    return {
        attackerId,
        defenderId,
        level,
        grade,
        perHit,
        defenderHp: def.hp,
        hits,
        seconds: (hits * atk.intervalTicks) / TICK_HZ,
    };
}

/** 医修奶量与承伤对比。攻击方固定用武修，代表同级物理压力。 */
export function sustainOf(tables, level, grade) {
    const healer = profileOf(tables, 'yi_xiu', level, grade);
    const heal = healSkill(tables, 'yi_xiu');
    const healAmount = skillBaseDamage(healer.attrs, {
        ...heal,
        scalingAttribute: heal.scalingAttribute ?? 'magic',
    });
    const healTicks = intervalTicks(tables, heal.baseIntervalTicks, healer.attrs.speed);
    const hps = healAmount / (healTicks / TICK_HZ);

    const vsTank = duelOf(tables, 'wu_xiu', 'ti_xiu', level, grade);
    const vsSquishy = duelOf(tables, 'wu_xiu', 'fa_xiu', level, grade);
    const dpsOf = (duel) => duel.perHit / (duel.seconds / duel.hits);

    return {
        level,
        grade,
        hps,
        healAmount,
        tankDps: dpsOf(vsTank),
        squishyDps: dpsOf(vsSquishy),
        tankRatio: hps / dpsOf(vsTank),
        squishyRatio: hps / dpsOf(vsSquishy),
        squishyHitsToKill: vsSquishy.hits,
    };
}

/**
 * 经济解空间：给定杂役总数，枚举所有「净灵粮不为负」的岗位配置。
 * 只枚举 P1 开放的三岗（灵粮、灵木、玄铁）。
 */
export function economySolutions(tables, workerCount) {
    const jobs = tables.production.jobs;
    const grainOut = jobs.spiritGrain.outputPerWorker;
    const solutions = [];

    for (let grain = 0; grain <= workerCount; grain += 1) {
        for (let wood = 0; wood <= workerCount - grain; wood += 1) {
            const iron = workerCount - grain - wood;
            const upkeep =
                wood * jobs.spiritWood.grainUpkeepPerWorker +
                iron * jobs.darkIron.grainUpkeepPerWorker;
            const net = grain * grainOut - upkeep;
            if (net < 0) {
                continue;
            }
            solutions.push({
                workerCount,
                grain,
                wood,
                iron,
                netGrainPerCycle: net,
                woodPerCycle: wood * jobs.spiritWood.outputPerWorker,
                ironPerCycle: iron * jobs.darkIron.outputPerWorker,
                hasSideJob: wood > 0 || iron > 0,
            });
        }
    }

    // 按副岗人数降序：玩家最想知道的是「最多能开多少副岗」
    solutions.sort(
        (a, b) => b.iron - a.iron || b.wood - a.wood || b.netGrainPerCycle - a.netGrainPerCycle,
    );
    return solutions;
}

/** 每分钟折算，便于人判断节奏。 */
export function perMinute(tables, perCycle) {
    return (perCycle * 60) / tables.production.cycleSeconds;
}
