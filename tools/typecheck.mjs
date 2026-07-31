/**
 * 类型检查入口。
 *
 * 为何需要脚本而非直接调 tsc：
 *   1. 工程不装 typescript 依赖，改用 Cocos 自带的那份，保证与引擎编译版本一致。
 *   2. 引擎自身的 .d.ts（cc.d.ts、jsb.d.ts）不满足 strict，会产生上百条与本工程
 *      无关的报错。这里按文件路径过滤，只对 assets/ 与 tests/ 的问题判定失败。
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

/** Cocos 安装目录可通过环境变量覆盖，便于不同机器和 CI。 */
const defaultCocosRoot =
    process.platform === 'win32'
        ? 'C:/ProgramData/cocos/editors/Creator/3.8.7'
        : '/Applications/Cocos/Creator/3.8.7/CocosCreator.app';
const cocosRoot = process.env.COCOS_APP ?? defaultCocosRoot;
const tscCandidates =
    process.platform === 'win32'
        ? [
              path.join(
                  cocosRoot,
                  'resources/app.asar.unpacked/node_modules/typescript/bin/tsc',
              ),
              path.join(
                  path.dirname(cocosRoot),
                  'resources/app.asar.unpacked/node_modules/typescript/bin/tsc',
              ),
          ]
        : [
              path.join(
                  cocosRoot,
                  'Contents/Resources/app.asar.unpacked/node_modules/typescript/bin/tsc',
              ),
          ];
const TSC = tscCandidates.find((candidate) => existsSync(candidate));

if (!TSC) {
    console.error(`找不到 Cocos 自带的 tsc，已检查：\n${tscCandidates.join('\n')}`);
    console.error('可设置 COCOS_APP 环境变量指向 Cocos Creator 安装目录');
    process.exit(1);
}

/** 只有这些前缀下的报错才算本工程的问题。 */
const OWNED_PREFIXES = ['assets/', 'tests/'];

function runProject(configName) {
    const result = spawnSync('node', [TSC, '--noEmit', '--pretty', 'false', '-p', configName], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
    });

    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const ownErrors = output
        .split('\n')
        .filter((line) => OWNED_PREFIXES.some((prefix) => line.startsWith(prefix)));

    if (ownErrors.length > 0) {
        console.error(`\n[${configName}] 类型错误 ${ownErrors.length} 条：`);
        for (const line of ownErrors) {
            console.error(`  ${line}`);
        }
        return false;
    }

    console.log(`[${configName}] 类型检查通过`);
    return true;
}

const allPassed = ['tsconfig.json', 'tsconfig.tests.json']
    // 用 map 而非 every：两份配置都要检查，不因第一份失败就跳过第二份
    .map(runProject)
    .every(Boolean);

process.exit(allPassed ? 0 : 1);
