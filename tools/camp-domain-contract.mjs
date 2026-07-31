/**
 * 让 tools/ 脚本读到领域层的营地契约。
 *
 * 建筑 id、系统入口 id 和节点路径的事实源是
 * assets/scripts/domain/{HallBadges,CampBottomHud,CampSceneContract}.ts，
 * 校验器和生成器都不该再抄一份。Node 认不了 `db://` 也认不了 .ts，
 * 故复用测试用的解析钩子——validate-data.mjs 已是同一套做法。
 *
 * 注意：调用方必须以 `node --experimental-strip-types` 运行。
 */

import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

register(pathToFileURL(path.join(REPO_ROOT, 'tests/resolver.mjs')));

const domain = async (moduleName) =>
    import(pathToFileURL(path.join(REPO_ROOT, `assets/scripts/domain/${moduleName}.ts`)).href);

const { BUILDING_IDS, BUILDING_STATES } = await domain('HallBadges');
const { CAMP_SYSTEM_ENTRY_IDS, CAMP_SYSTEM_ENTRY_NAMES } = await domain('CampBottomHud');
const { MIN_TOUCH_TARGET_DP } = await domain('ViewportLayout');
const contract = await domain('CampSceneContract');

export {
    BUILDING_IDS,
    BUILDING_STATES,
    CAMP_SYSTEM_ENTRY_IDS,
    CAMP_SYSTEM_ENTRY_NAMES,
    MIN_TOUCH_TARGET_DP,
};

export const {
    CAMP_CLOSED_ANCHOR_NAMES,
    CAMP_HIDDEN_PANELS,
    CAMP_MODULES,
    CAMP_PREFAB_PATHS,
    CAMP_RESOURCE_NODE_NAMES,
    CAMP_SYSTEM_ENTRY_NODE_NAMES,
    campBuildingPath,
    campModule,
    campSystemEntryPath,
} = contract;

/** 按 CAMP_SYSTEM_ENTRY_IDS 顺序展开的底部入口节点名。 */
export const CAMP_SYSTEM_ENTRY_NODE_ORDER = CAMP_SYSTEM_ENTRY_IDS.map(
    (entryId) => CAMP_SYSTEM_ENTRY_NODE_NAMES[entryId],
);
