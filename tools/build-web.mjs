/**
 * 命令行构建 Web Mobile（任务 P0-TECH-001 / #6c）。
 *
 * 存在原因：把「工程锁检测 + 参数格式探测 + 产物校验」固化下来，
 * 避免每次构建都手动确认这些前提。
 *
 * 重要前提：**Cocos 编辑器必须先关闭**。编辑器持有工程锁，
 * 命令行实例会一直等锁——实测连 `--help` 都会挂住超过 120 秒。
 * 本脚本先检测编辑器进程，发现就直接退出而不是傻等。
 *
 * 用法：node tools/build-web.mjs [--timeout 600]
 */

import { spawn, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const COCOS_APP = process.env.COCOS_APP ?? '/Applications/Cocos/Creator/3.8.7/CocosCreator.app';
const COCOS_BIN = path.join(COCOS_APP, 'Contents/MacOS/CocosCreator');

/** 默认超时。首次构建要编译全部脚本与资源，给足时间。 */
const DEFAULT_TIMEOUT_SECONDS = 900;

function fail(message, hint) {
    console.error(`\n构建中止：${message}`);
    if (hint) {
        console.error(hint);
    }
    process.exit(1);
}

// ── 前置检查 ────────────────────────────────────────────────

if (!existsSync(COCOS_BIN)) {
    fail(
        `找不到 Cocos Creator：${COCOS_BIN}`,
        '可设置 COCOS_APP 环境变量指向 CocosCreator.app',
    );
}

/**
 * 编辑器进程检测。
 *
 * 只匹配打开了本工程的**编辑器**实例：
 *   - 打开别的工程不影响本次构建
 *   - 带 --build 的是命令行构建进程，不是编辑器。
 *     不排除它会把自己或上一次的构建误判成编辑器锁，
 *     导致「明明没开编辑器却说被占用」。
 *   - 排除自身 PID，以防将来改成同进程调用
 */
function findEditorPid() {
    try {
        const output = execSync('pgrep -fl "CocosCreator --project" 2>/dev/null || true', {
            encoding: 'utf8',
        });
        for (const line of output.split('\n')) {
            if (!line.includes(REPO_ROOT) || line.includes('--build')) {
                continue;
            }
            const pid = line.trim().split(/\s+/)[0];
            if (pid && pid !== String(process.pid)) {
                return pid;
            }
        }
    } catch {
        // pgrep 无匹配时返回非零，视为没有编辑器
    }
    return null;
}

const editorPid = findEditorPid();
if (editorPid) {
    fail(
        `Cocos 编辑器正打开本工程（PID ${editorPid}），持有工程锁。`,
        '请先关闭编辑器。命令行实例会一直等锁，实测连 --help 都会挂住。\n' +
            '若想在编辑器内构建，用「构建发布 → Web Mobile → 构建」即可，无需本脚本。',
    );
}

// 起始场景与 Bundle 配置须已就绪，否则构建出来是空的
try {
    execSync('node tools/validate-scene.mjs', { cwd: REPO_ROOT, stdio: 'pipe' });
} catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
    fail(`场景校验未通过：\n${output}`, '先修好场景配置再构建。');
}

// ── 参数格式探测 ────────────────────────────────────────────

/**
 * 构建参数。
 * `--build platform=web-mobile` 已实测被 3.8.7 接受（会打印
 * `build: platform=web-mobile` 并进入构建流程），故不再试其它写法。
 * 其余选项从 settings/v2/packages/builder.json 读取。
 */
const CANDIDATE_ARGS = [['--project', REPO_ROOT, '--build', 'platform=web-mobile']];

const timeoutIndex = process.argv.indexOf('--timeout');
const timeoutSeconds =
    timeoutIndex >= 0 ? Number(process.argv[timeoutIndex + 1]) : DEFAULT_TIMEOUT_SECONDS;

function runBuild(args) {
    return new Promise((resolve) => {
        console.log(`\n尝试：CocosCreator ${args.join(' ')}`);
        const child = spawn(COCOS_BIN, args, { cwd: REPO_ROOT });

        let stdout = '';
        let stderr = '';
        let settled = false;

        const timer = setTimeout(() => {
            if (settled) {
                return;
            }
            settled = true;
            child.kill('SIGTERM');
            // 给它两秒优雅退出，否则强杀
            setTimeout(() => child.kill('SIGKILL'), 2000);
            resolve({ ok: false, timedOut: true, stdout, stderr });
        }, timeoutSeconds * 1000);

        child.stdout?.on('data', (chunk) => {
            const text = String(chunk);
            stdout += text;
            process.stdout.write(text);
        });
        child.stderr?.on('data', (chunk) => {
            const text = String(chunk);
            stderr += text;
            process.stderr.write(text);
        });

        child.on('close', (code) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            resolve({ ok: code === 0, code, stdout, stderr });
        });

        child.on('error', (error) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            resolve({ ok: false, error: String(error), stdout, stderr });
        });
    });
}

/** 校验产物：构建号称成功但产物缺失的情况必须抓出来。 */
function verifyOutput() {
    const indexPath = path.join(REPO_ROOT, 'build/web-mobile/index.html');
    if (!existsSync(indexPath)) {
        return { ok: false, reason: '产物 build/web-mobile/index.html 不存在' };
    }

    const html = readFileSync(indexPath, 'utf8');
    const checks = [];

    // 证明 build-templates/ 的覆盖生效——少了它安全区恒为 0
    checks.push({
        name: 'viewport-fit=cover（安全区前提）',
        ok: html.includes('viewport-fit=cover'),
    });
    checks.push({
        name: '启动失败兜底页',
        ok: html.includes('kw-boot-error'),
    });
    checks.push({
        name: 'WebGL 预检',
        ok: html.includes('TECH-001-WEBGL'),
    });

    return { ok: checks.every((c) => c.ok), checks };
}

// ── 执行 ───────────────────────────────────────────────────

let succeeded = null;
for (const args of CANDIDATE_ARGS) {
    const result = await runBuild(args);

    /*
     * 退出码不可信：构建任务本身成功（日志出现「build Task ... Finished」）
     * 但退出码常为 36，因为 build-engine 子进程在编辑器进程退出时收到 SIGTERM。
     * 故以「日志出现完成标记」为准，最终仍由产物校验裁定。
     */
    const finished = /build Task .* Finished/.test(result.stdout + result.stderr);
    if (result.ok || finished) {
        succeeded = args;
        break;
    }
    if (result.timedOut) {
        console.error(`\n构建超时（${timeoutSeconds}s）。可能仍在等工程锁。`);
        break;
    }
    console.error(`\n构建失败（退出码 ${result.code ?? 'n/a'}）。`);
}

if (!succeeded) {
    fail(
        '构建未完成。',
        '可改用编辑器内构建：构建发布 → Web Mobile → 构建。\n' +
            '构建配置已预置在 settings/v2/packages/builder.json。',
    );
}

const verification = verifyOutput();
if (!verification.ok) {
    if (verification.reason) {
        fail(verification.reason);
    }
    console.error('\n产物校验未全部通过：');
    for (const check of verification.checks) {
        console.error(`  ${check.ok ? '通过' : '未通过'}  ${check.name}`);
    }
    process.exit(1);
}

console.log(`\n构建成功（参数写法：${succeeded.join(' ')}）`);
for (const check of verification.checks) {
    console.log(`  通过  ${check.name}`);
}
console.log('\n产物在 build/web-mobile/，用浏览器打开 index.html 验证。');
