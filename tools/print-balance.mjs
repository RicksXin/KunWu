/**
 * 终端版数值推演，与 build-balance-workbook.mjs 共用 balance-model.mjs。
 *
 * 调参时用这个：改完 JSON 直接跑，不必开 Excel。
 * 只输出最关键的三块——面板、TTK、经济解数——完整视图去 xlsx。
 *
 *   node tools/print-balance.mjs                    默认伪灵根
 *   node tools/print-balance.mjs --root dual_root
 */

import {
    loadTables,
    profileOf,
    duelOf,
    sustainOf,
    economySolutions,
    defenseConstantAt,
    primaryAttackSkill,
    perMinute,
    ATTRIBUTE_KEYS,
    ATTRIBUTE_LABELS,
    CAREER_LABELS,
    SPIRITUAL_ROOT_IDS,
    SAMPLE_LEVELS,
} from './balance-model.mjs';

const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
const spiritualRootId = rootIndex >= 0 ? args[rootIndex + 1] : 'pseudo_root';
if (!SPIRITUAL_ROOT_IDS.includes(spiritualRootId)) {
    console.error(`灵根须为 ${SPIRITUAL_ROOT_IDS.join('/')} 之一，收到 ${spiritualRootId}`);
    process.exit(1);
}

const tables = loadTables();
const careerIds = ['ti_xiu', 'wu_xiu', 'qian_xiu', 'fa_xiu', 'yi_xiu', 'fu_xiu'];
const label = (id) => CAREER_LABELS[id] ?? id;
const pct = (r) => `${Math.round(r * 100)}%`;
const r1 = (n) => Math.round(n * 10) / 10;

console.log(`\n灵根 ${spiritualRootId}｜减伤常数 K(1)=${defenseConstantAt(tables, 1)} → K(60)=${defenseConstantAt(tables, 60)}`);

for (const level of SAMPLE_LEVELS) {
    console.log(`\n===== Lv${level}  K=${defenseConstantAt(tables, level)} =====`);
    console.table(
        careerIds.map((id) => {
            const p = profileOf(tables, id, level, spiritualRootId);
            const row = { 职业: label(id) };
            for (const key of ATTRIBUTE_KEYS) {
                row[ATTRIBUTE_LABELS[key]] = p.attrs[key];
            }
            row.生命 = p.hp;
            row.裸伤 = p.rawDamage;
            row.间隔s = r1(p.intervalSeconds);
            row.DPS = Math.round(p.dps);
            row.物减 = pct(p.physicalReduction);
            row.法减 = pct(p.magicalReduction);
            return row;
        }),
    );
}

console.log('\n===== 单挑 TTK（秒 / 击数）=====');
for (const level of [1, 20, 40, 60]) {
    console.log(`\nLv${level}`);
    console.table(
        careerIds
            .filter((id) => primaryAttackSkill(tables, id))
            .map((atkId) => {
                const row = { 攻方: label(atkId) };
                for (const defId of careerIds) {
                    const d = duelOf(tables, atkId, defId, level, spiritualRootId);
                    row[label(defId)] = d ? `${r1(d.seconds)}s/${d.hits}击` : '—';
                }
                return row;
            }),
    );
}

console.log('\n===== 续航核算 =====');
console.table(
    SAMPLE_LEVELS.map((level) => {
        const s = sustainOf(tables, level, spiritualRootId);
        return {
            等级: `Lv${level}`,
            医修HPS: Math.round(s.hps),
            打坦DPS: Math.round(s.tankDps),
            '奶/坦': `${r1(s.tankRatio)}x`,
            打脆DPS: Math.round(s.squishyDps),
            '奶/脆': `${r1(s.squishyRatio)}x`,
            脆皮被秒击数: s.squishyHitsToKill,
        };
    }),
);

console.log('\n===== 灵源院经济 =====');
for (const workerCount of [6, 11, 16]) {
    const all = economySolutions(tables, workerCount);
    const withSide = all.filter((s) => s.hasSideJob);
    console.log(`\n${workerCount} 名杂役：可持续 ${all.length} 个，能开副岗 ${withSide.length} 个`);
    console.table(
        withSide.slice(0, 5).map((s) => ({
            配置: `${s.grain}粮/${s.wood}木/${s.iron}铁`,
            净灵粮每周期: s.netGrainPerCycle,
            净灵粮每分: r1(perMinute(tables, s.netGrainPerCycle)),
            灵木每分: r1(perMinute(tables, s.woodPerCycle)),
            玄铁每分: r1(perMinute(tables, s.ironPerCycle)),
        })),
    );
}
