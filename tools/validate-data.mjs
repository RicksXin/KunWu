/**
 * 构建前数据校验入口（PRD-10 §6）。
 *
 * 从 assets/data/ 读取数据表，调用领域层校验器，有 error 即以非零码退出，
 * 以便在打包流程中阻断（PRD-10 §8：数据 Schema 失败阻止进入游戏）。
 *
 * 数据表尚未产出时视为通过并提示——P0 阶段目录还是空的，
 * 此时报失败会让流程一直红着，反而掩盖真问题。
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const DATA_ROOT = path.join(REPO_ROOT, 'assets', 'data');

// 复用测试用的解析钩子，使本脚本能直接导入领域层 TS
register('../tests/resolver.mjs', import.meta.url);

const { validateDataBundle } = await import(
    pathToFileURL(path.join(REPO_ROOT, 'assets/scripts/domain/DataValidator.ts')).href
);
const { createDefaultProfile } = await import(
    pathToFileURL(path.join(REPO_ROOT, 'assets/scripts/services/ProfileCodec.ts')).href
);
const { parseLingPuConfig } = await import(
    pathToFileURL(path.join(REPO_ROOT, 'assets/scripts/domain/LingPu.ts')).href
);
const { parseExpeditionPreparationConfig } = await import(
    pathToFileURL(
        path.join(REPO_ROOT, 'assets/scripts/domain/ExpeditionPreparation.ts'),
    ).href
);
const {
    parseBalanceTables,
    assertGrowthRatesCoverCareers,
    assertPrimaryAttributeMatchesGrowth,
    BALANCE_TABLE_NAMES,
} = await import(
    pathToFileURL(path.join(REPO_ROOT, 'assets/scripts/domain/BalanceTables.ts')).href
);

function readJsonDir(dir) {
    const full = path.join(DATA_ROOT, dir);
    if (!existsSync(full)) {
        return [];
    }
    return readdirSync(full)
        .filter((name) => name.endsWith('.json'))
        .flatMap((name) => {
            const parsed = JSON.parse(readFileSync(path.join(full, name), 'utf8'));
            // 每个文件可以是单行对象或数组，统一摊平
            return Array.isArray(parsed) ? parsed : [parsed];
        });
}

function readLocalizationKeys() {
    const full = path.join(DATA_ROOT, 'localization');
    if (!existsSync(full)) {
        return new Set();
    }
    const keys = new Set();
    for (const name of readdirSync(full).filter((file) => file.endsWith('.json'))) {
        const parsed = JSON.parse(readFileSync(path.join(full, name), 'utf8'));
        for (const key of Object.keys(parsed)) {
            keys.add(key);
        }
    }
    return keys;
}

const bundle = {
    skills: readJsonDir('careers/skills'),
    careers: readJsonDir('careers'),
    maps: readJsonDir('maps'),
    dropTables: readJsonDir('balance/drops'),
    items: readJsonDir('balance/items'),
    quests: readJsonDir('quests'),
    localizationKeys: readLocalizationKeys(),
};

const isEmpty =
    bundle.skills.length === 0 &&
    bundle.careers.length === 0 &&
    bundle.maps.length === 0 &&
    bundle.items.length === 0;

if (isEmpty) {
    console.log('assets/data/ 暂无数据表，跳过校验（P0 阶段正常）');
    process.exit(0);
}

const report = validateDataBundle(bundle);
console.log(report.format());

let defaultProfileError = null;
const defaultProfilePath = path.join(
    REPO_ROOT,
    'assets',
    'bundles',
    'shared',
    'default_profile.json',
);
try {
    const seed = JSON.parse(readFileSync(defaultProfilePath, 'utf8'));
    createDefaultProfile(seed, 1);
    console.log('新档 Profile 数据种子校验通过');
} catch (error) {
    defaultProfileError = error;
    console.error(`新档 Profile 数据种子校验失败：${error.message}`);
}

let lingPuConfigError = null;
const lingPuConfigPath = path.join(
    REPO_ROOT,
    'assets',
    'bundles',
    'shared',
    'ling_pu_config.json',
);
try {
    const table = JSON.parse(readFileSync(lingPuConfigPath, 'utf8'));
    parseLingPuConfig(table.ling_pu);
    console.log('灵圃数值配置校验通过');
} catch (error) {
    lingPuConfigError = error;
    console.error(`灵圃数值配置校验失败：${error.message}`);
}

let expeditionConfigError = null;
const expeditionConfigPath = path.join(
    REPO_ROOT,
    'assets',
    'bundles',
    'shared',
    'expedition_preparation.json',
);
try {
    const table = JSON.parse(readFileSync(expeditionConfigPath, 'utf8'));
    parseExpeditionPreparationConfig(table.expedition_preparation);
    console.log('出征准备数值配置校验通过');
} catch (error) {
    expeditionConfigError = error;
    console.error(`出征准备数值配置校验失败：${error.message}`);
}

// 平衡数值表（Docs/13 §5）。与运行时共用 BalanceTables 的解析函数，
// 避免构建期与运行期两处校验漂移。
let balanceError = null;
const balanceDir = path.join(DATA_ROOT, 'balance');
const balanceFiles = BALANCE_TABLE_NAMES.map((name) => ({
    name,
    file: path.join(balanceDir, `${name}.json`),
}));
const missingBalance = balanceFiles.filter(({ file }) => !existsSync(file));

if (missingBalance.length === BALANCE_TABLE_NAMES.length) {
    // 全缺视为尚未产出，与本脚本对空 assets/data/ 的处理保持一致
    console.log('assets/data/balance/ 暂无平衡表，跳过校验');
} else if (missingBalance.length > 0) {
    // 部分缺失是真问题：解析会用到全部五张表，缺一张就是半套配置
    balanceError = new Error(
        `平衡表缺失：${missingBalance.map(({ name }) => `${name}.json`).join('、')}`,
    );
    console.error(`平衡数值表校验失败：${balanceError.message}`);
} else {
    try {
        const raw = {};
        for (const { name, file } of balanceFiles) {
            raw[name] = JSON.parse(readFileSync(file, 'utf8'));
        }
        const tables = parseBalanceTables(raw);
        assertGrowthRatesCoverCareers(
            tables.growthRates,
            bundle.careers.map((career) => career.id),
        );
        assertPrimaryAttributeMatchesGrowth(tables.growthRates, bundle.careers);
        console.log(`平衡数值表校验通过（${BALANCE_TABLE_NAMES.length} 张表）`);
    } catch (error) {
        balanceError = error;
        console.error(`平衡数值表校验失败：${error.message}`);
    }
}

process.exit(
    report.hasErrors ||
    defaultProfileError ||
    lingPuConfigError ||
    expeditionConfigError ||
    balanceError
        ? 1
        : 0,
);
