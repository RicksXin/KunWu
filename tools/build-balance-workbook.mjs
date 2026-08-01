/**
 * 生成给人看的数值总表 xlsx。
 *
 * 输入：assets/data/balance/*.json + assets/data/careers/**（唯一事实源）
 * 输出：outputs/balance/昆吾禁地_数值总表.xlsx
 *
 * 这份 Excel 是**只读产物**，不是事实源：调数值改 JSON，重跑本脚本。
 * 反过来在 Excel 里改数不会影响游戏，且下次生成即被覆盖。
 * 每张 sheet 的首行注明数据来自哪张表，避免脱离上下文传阅时误认为可编辑。
 */

import path from 'node:path';
import { writeXlsx } from './xlsx-writer.mjs';
import {
    loadTables,
    profileOf,
    duelOf,
    sustainOf,
    attributesAt,
    maxHpOf,
    defenseConstantAt,
    economySolutions,
    perMinute,
    primaryAttackSkill,
    ATTRIBUTE_KEYS,
    ATTRIBUTE_LABELS,
    CAREER_LABELS,
    JOB_LABELS,
    GRADES,
    SAMPLE_LEVELS,
    TICK_HZ,
} from './balance-model.mjs';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const OUT_PATH = path.join(REPO_ROOT, 'outputs', 'balance', '昆吾禁地_数值总表.xlsx');

const tables = loadTables();
const careerIds = ['ti_xiu', 'wu_xiu', 'qian_xiu', 'fa_xiu', 'yi_xiu', 'fu_xiu'];
const label = (id) => CAREER_LABELS[id] ?? id;
const pct = (ratio) => `${Math.round(ratio * 100)}%`;
const round1 = (n) => Math.round(n * 10) / 10;

/** sheet 1：怎么读这份表。 */
function sheetReadme() {
    return {
        name: '说明',
        header: ['项', '内容'],
        widths: [22, 92],
        rows: [
            ['这份表是什么', '由 assets/data/balance/*.json 生成的只读视图，方便人阅读与核对'],
            ['改数值怎么改', '改 assets/data/balance/ 下的 JSON，然后重跑 pnpm balance:xlsx'],
            ['在 Excel 里改数有用吗', '没用。下次生成会覆盖，且游戏不读这个文件'],
            ['事实源', 'assets/data/balance/*.json 与 assets/data/careers/**'],
            ['设计文档', 'Docs/13_数值设计方案.md'],
            ['规则归属', '职业与七维 PRD-03，战斗公式 PRD-04，资源产出 PRD-02'],
            ['', ''],
            ['成长率单位', '千分位整数。3000 表示每级 +3.0 点。工程不用浮点，见技术方案 §7'],
            ['结算频率', `${TICK_HZ} tick/秒。间隔列已折算为秒，结算内部一律用 tick`],
            ['七维字段名', 'strength magic technique speed constitution armor resistance（已冻结，见技术方案 §6）'],
            ['', ''],
            ['成长率表', '每个职业每级涨几点。看职业性格'],
            ['品级倍率', '初始倍率与成长倍率两条。看品级差是否过大'],
            ['职业初始值', 'careers/*.json 的 1 级裸值，未乘品级倍率'],
            ['面板推演', '各等级的七维、生命、伤害、减伤。看曲线是否合理'],
            ['单挑 TTK', '同级同品 1v1 几秒打死。看是否存在一击秒杀'],
            ['续航核算', '医修奶量对比承伤。看治疗是否够用'],
            ['技能表', '18 个技能的倍率与间隔'],
            ['灵圃经济', '各杂役数下的可行岗位配置。看是否只有一个最优解'],
        ],
    };
}

/** sheet 2：成长率，带中文表头与档位说明。 */
function sheetGrowthRates() {
    const rows = careerIds.map((id) => {
        const rates = tables.growthRates[id];
        return [
            label(id),
            id,
            ...ATTRIBUTE_KEYS.map((key) => rates[key]),
            ATTRIBUTE_KEYS.map((key) => (rates[key] >= 3000 ? ATTRIBUTE_LABELS[key] : null))
                .filter(Boolean)
                .join('、'),
        ];
    });

    // 附一行「每级实际点数」示例，避免读者被千分位绕住
    rows.push([]);
    rows.push(['以下为换算示例', '', ...ATTRIBUTE_KEYS.map(() => null), '']);
    for (const id of ['ti_xiu', 'fa_xiu']) {
        const rates = tables.growthRates[id];
        rows.push([
            `${label(id)} 每级实涨`,
            '（成长率 ÷ 1000）',
            ...ATTRIBUTE_KEYS.map((key) => rates[key] / 1000),
            '',
        ]);
    }

    return {
        name: '成长率表',
        header: [
            '职业',
            '逻辑 id',
            ...ATTRIBUTE_KEYS.map((key) => `${ATTRIBUTE_LABELS[key]}\n${key}`),
            '主维',
        ],
        widths: [12, 12, 11, 11, 11, 11, 11, 11, 11, 16],
        boldRows: [rows.length - 3],
        rows,
    };
}

/** sheet 3：品级倍率。 */
function sheetGrades() {
    const wuBase = tables.careers.wu_xiu.baseAttributes.strength;
    const rows = GRADES.map((grade) => {
        const m = tables.gradeMultipliers[grade];
        const lv1 = attributesAt(tables, 'wu_xiu', 1, grade);
        const lv60 = attributesAt(tables, 'wu_xiu', 60, grade);
        return [
            grade,
            m.basePercent,
            m.growthPercent,
            lv1.strength,
            lv60.strength,
            maxHpOf(tables, 'wu_xiu', lv60),
        ];
    });

    const dLv60 = attributesAt(tables, 'wu_xiu', 60, 'D').strength;
    const sssLv60 = attributesAt(tables, 'wu_xiu', 60, 'SSS').strength;
    rows.push([]);
    rows.push([
        'D : SSS',
        '',
        '',
        '',
        `${round1(sssLv60 / dLv60)}x`,
        'PRD-03 §3 要求 D 级可通关，上限 2.0x',
    ]);

    return {
        name: '品级倍率',
        header: [
            '品级',
            '初始倍率 %',
            '成长倍率 %',
            `武修 1 级力道\n(裸值 ${wuBase})`,
            '武修 60 级力道',
            '武修 60 级生命',
        ],
        widths: [10, 13, 13, 17, 16, 38],
        boldRows: [rows.length - 1],
        rows,
    };
}

/** sheet 4：职业初始值，即 careers/*.json 的裸值。 */
function sheetCareerBase() {
    return {
        name: '职业初始值',
        header: [
            '职业',
            '逻辑 id',
            ...ATTRIBUTE_KEYS.map((key) => ATTRIBUTE_LABELS[key]),
            '基础生命',
            '主属性',
            '三技能',
        ],
        widths: [10, 11, 8, 8, 8, 8, 8, 8, 8, 10, 10, 34],
        rows: careerIds.map((id) => {
            const c = tables.careers[id];
            return [
                label(id),
                id,
                ...ATTRIBUTE_KEYS.map((key) => c.baseAttributes[key]),
                c.baseHp,
                ATTRIBUTE_LABELS[c.primaryAttribute],
                c.skillIds.join('、'),
            ];
        }),
    };
}

/** sheet 5：面板推演，按等级分组。 */
function sheetProfiles() {
    const rows = [];
    for (const level of SAMPLE_LEVELS) {
        rows.push([
            `Lv${level}`,
            `减伤常数 K=${defenseConstantAt(tables, level)}`,
            ...Array.from({ length: 13 }, () => null),
        ]);
        for (const id of careerIds) {
            const p = profileOf(tables, id, level, 'C');
            rows.push([
                '',
                label(id),
                ...ATTRIBUTE_KEYS.map((key) => p.attrs[key]),
                p.hp,
                p.rawDamage,
                round1(p.intervalSeconds),
                Math.round(p.dps),
                pct(p.physicalReduction),
                pct(p.magicalReduction),
            ]);
        }
        rows.push([]);
    }

    return {
        name: '面板推演',
        header: [
            '等级',
            '职业',
            ...ATTRIBUTE_KEYS.map((key) => ATTRIBUTE_LABELS[key]),
            '生命',
            '裸伤',
            '间隔秒',
            'DPS',
            '物减',
            '法减',
        ],
        widths: [9, 10, 8, 8, 8, 8, 8, 8, 8, 9, 8, 9, 8, 8, 8],
        boldRows: rows
            .map((r, i) => (typeof r[0] === 'string' && r[0].startsWith('Lv') ? i : -1))
            .filter((i) => i >= 0),
        rows,
    };
}

/** sheet 6：单挑 TTK 矩阵，逐等级一块。 */
function sheetDuels() {
    const rows = [];
    for (const level of SAMPLE_LEVELS) {
        rows.push([`Lv${level}`, ...careerIds.map(() => null)]);
        for (const atkId of careerIds) {
            if (!primaryAttackSkill(tables, atkId)) {
                continue;
            }
            rows.push([
                label(atkId),
                ...careerIds.map((defId) => {
                    const d = duelOf(tables, atkId, defId, level, 'C');
                    return d ? `${round1(d.seconds)}s / ${d.hits}击` : '—';
                }),
            ]);
        }
        rows.push([]);
    }

    rows.push(['判据', '同级同品击杀非坦职业至少 3 击，否则半自动战斗中玩家无反应窗口']);

    return {
        name: '单挑TTK',
        header: ['攻方 \\ 守方', ...careerIds.map((id) => label(id))],
        widths: [14, 15, 15, 15, 15, 15, 15],
        boldRows: rows
            .map((r, i) =>
                typeof r[0] === 'string' && (r[0].startsWith('Lv') || r[0] === '判据') ? i : -1,
            )
            .filter((i) => i >= 0),
        rows,
    };
}

/** sheet 7：续航核算。 */
function sheetSustain() {
    const rows = SAMPLE_LEVELS.map((level) => {
        const s = sustainOf(tables, level, 'C');
        return [
            `Lv${level}`,
            s.healAmount,
            Math.round(s.hps),
            Math.round(s.tankDps),
            `${round1(s.tankRatio)}x`,
            Math.round(s.squishyDps),
            `${round1(s.squishyRatio)}x`,
            s.squishyHitsToKill,
        ];
    });

    rows.push([]);
    rows.push([
        '读法',
        '比值 > 1 表示单奶能顶住单个攻击者；打脆皮那列长期贴近 1.0 是设计意图：治疗是必需品，但不能一个人奶住全队',
    ]);

    return {
        name: '续航核算',
        header: [
            '等级',
            '单次治疗量',
            '医修 HPS',
            '武修打坦 DPS',
            '奶量/承伤',
            '武修打脆 DPS',
            '奶量/承伤',
            '脆皮被秒击数',
        ],
        widths: [9, 13, 12, 15, 13, 15, 13, 14],
        boldRows: [rows.length - 1],
        rows,
    };
}

/** sheet 8：技能表。 */
function sheetSkills() {
    const bySkill = new Map();
    for (const id of careerIds) {
        for (const skillId of tables.careers[id].skillIds) {
            bySkill.set(skillId, id);
        }
    }

    const rows = [...bySkill.entries()]
        .map(([skillId, careerId]) => {
            const s = tables.skills[skillId];
            const kindLabel = { physical: '物理', magical: '法术', none: '无伤害' };
            return [
                label(careerId),
                skillId,
                kindLabel[s.damageKind] ?? s.damageKind,
                s.scalingAttribute ? ATTRIBUTE_LABELS[s.scalingAttribute] : '—',
                s.primaryPercent,
                s.secondaryAttribute ? ATTRIBUTE_LABELS[s.secondaryAttribute] : '—',
                s.secondaryPercent ?? null,
                s.targetType,
                s.baseIntervalTicks,
                round1(s.baseIntervalTicks / TICK_HZ),
                s.cooldownTicks,
                round1(s.cooldownTicks / TICK_HZ),
                s.ignoreTaunt ? '是' : '否',
            ];
        })
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'zh'));

    return {
        name: '技能表',
        header: [
            '职业',
            '技能 id',
            '类型',
            '主属性',
            '主倍率 %',
            '副属性',
            '副倍率 %',
            '目标类型',
            '基础间隔 tick',
            '≈秒',
            '冷却 tick',
            '≈秒',
            '无视嘲讽',
        ],
        widths: [9, 20, 9, 9, 11, 9, 11, 21, 13, 8, 11, 8, 11],
        rows,
    };
}

/** sheet 9：灵圃经济解空间。 */
function sheetEconomy() {
    const jobs = tables.production.jobs;
    const cycle = tables.production.cycleSeconds;
    const rows = [];

    rows.push(['岗位速率', '', '', '', '', '', '', '']);
    for (const [job, rate] of Object.entries(jobs)) {
        rows.push([
            '',
            JOB_LABELS[job] ?? job,
            `产 ${rate.outputPerWorker}/人/周期`,
            `耗灵粮 ${rate.grainUpkeepPerWorker}/人/周期`,
            `周期 ${cycle} 秒`,
            '',
            '',
            '',
        ]);
    }
    rows.push([]);

    for (const workerCount of [6, 11, 16, 21]) {
        const all = economySolutions(tables, workerCount);
        const withSide = all.filter((s) => s.hasSideJob);
        rows.push([
            `${workerCount} 名杂役`,
            `可持续配置 ${all.length} 个，其中能开副岗 ${withSide.length} 个`,
            '',
            '',
            '',
            '',
            '',
            '',
        ]);
        for (const s of withSide.slice(0, 6)) {
            rows.push([
                '',
                `${s.grain} 灵粮 / ${s.wood} 灵木 / ${s.iron} 玄铁`,
                s.netGrainPerCycle,
                round1(perMinute(tables, s.netGrainPerCycle)),
                s.woodPerCycle,
                round1(perMinute(tables, s.woodPerCycle)),
                s.ironPerCycle,
                round1(perMinute(tables, s.ironPerCycle)),
            ]);
        }
        rows.push([]);
    }

    rows.push(['判据', '初始杂役数下能开副岗的可持续配置不少于 5 个，否则前期无岗位决策']);

    return {
        name: '灵圃经济',
        header: [
            '杂役数',
            '配置',
            '净灵粮/周期',
            '净灵粮/分',
            '灵木/周期',
            '灵木/分',
            '玄铁/周期',
            '玄铁/分',
        ],
        widths: [13, 34, 13, 12, 12, 11, 12, 11],
        boldRows: rows
            .map((r, i) =>
                typeof r[0] === 'string' && r[0] !== '' && !r[0].startsWith('  ') ? i : -1,
            )
            .filter((i) => i >= 0),
        rows,
    };
}

const sheets = [
    sheetReadme(),
    sheetGrowthRates(),
    sheetGrades(),
    sheetCareerBase(),
    sheetProfiles(),
    sheetDuels(),
    sheetSustain(),
    sheetSkills(),
    sheetEconomy(),
];

writeXlsx(OUT_PATH, sheets);
console.log(`已生成 ${path.relative(REPO_ROOT, OUT_PATH)}`);
console.log(`${sheets.length} 个 sheet：${sheets.map((s) => s.name).join('、')}`);
console.log('数值事实源仍为 assets/data/balance/*.json；本文件为只读产物。');
