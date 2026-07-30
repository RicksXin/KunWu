/**
 * 注册 resolver.mjs 为解析钩子。
 * 由 package.json 的 test 脚本通过 --import 加载。
 */

import { register } from 'node:module';

register('./resolver.mjs', import.meta.url);
