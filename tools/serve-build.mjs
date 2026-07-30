/**
 * 本地预览构建产物（任务 P0-TECH-001）。
 *
 * 为何不用 `python3 -m http.server`：
 *   1. 需要正确的 MIME 类型。`.wasm` 用默认类型会让引擎加载失败，
 *      `.json` 的 importmap 也依赖 application/json。
 *   2. 手机连同一 WiFi 访问需要局域网 IP，这里直接打印出来，
 *      省得去查（#18 真机验证要用）。
 *
 * 用法：pnpm serve [--port 5173]
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const BUILD_DIR = path.join(REPO_ROOT, 'build/web-mobile');

const portIndex = process.argv.indexOf('--port');
export const DEFAULT_PORT = 5173;
const PORT = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : DEFAULT_PORT;

if (!existsSync(BUILD_DIR)) {
    console.error('找不到 build/web-mobile');
    console.error('请先运行 pnpm build:web（需先关闭 Cocos 编辑器）');
    process.exit(1);
}

/** 引擎加载依赖正确的 MIME，尤其是 wasm 与 json。 */
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.wasm': 'application/wasm',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav',
    '.bin': 'application/octet-stream',
    '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
        let relative = decodeURIComponent(url.pathname);
        if (relative === '/' || relative.endsWith('/')) {
            relative += 'index.html';
        }

        // 防目录穿越：解析后必须仍在 BUILD_DIR 内
        const target = path.resolve(BUILD_DIR, `.${relative}`);
        if (!target.startsWith(BUILD_DIR)) {
            res.writeHead(403).end('Forbidden');
            return;
        }

        const info = await stat(target).catch(() => null);
        if (!info || !info.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
            return;
        }

        const body = await readFile(target);
        res.writeHead(200, {
            'Content-Type': MIME_TYPES[path.extname(target).toLowerCase()] ?? 'application/octet-stream',
            'Content-Length': body.length,
            // 每次刷新都取最新，避免调试时看到旧产物
            'Cache-Control': 'no-store',
        });
        res.end(body);
    } catch (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`500 ${error}`);
    }
});

/** 局域网 IPv4，供手机访问（#18 真机验证）。 */
function lanAddresses() {
    const found = [];
    for (const list of Object.values(networkInterfaces())) {
        for (const item of list ?? []) {
            if (item.family === 'IPv4' && !item.internal) {
                found.push(item.address);
            }
        }
    }
    return found;
}

server.listen(PORT, () => {
    console.log(`\n《昆吾禁地》本地预览已启动\n`);
    console.log(`  电脑访问   http://localhost:${PORT}`);
    for (const address of lanAddresses()) {
        console.log(`  手机访问   http://${address}:${PORT}   （需连同一 WiFi）`);
    }
    console.log(`\n  产物目录   build/web-mobile`);
    console.log(`  按 Ctrl+C 停止\n`);
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`端口 ${PORT} 已被占用。换个端口：pnpm serve --port 5174`);
        process.exit(1);
    }
    throw error;
});
