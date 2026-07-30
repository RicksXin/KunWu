/**
 * Asset Bundle 清单与加载顺序（PRD-10 §3、任务 P0-TECH-001／P0-TECH-003b）。
 *
 * 职责边界：只声明「有哪些包、谁在首屏、谁预载谁」，不执行加载。
 * 实际加载在 BundleLoader（任务 #17），此处的清单可单测，
 * 因此「首屏包不该包含地图资源」这类约束能在 CI 拦住而非等打包后人工查。
 */

/** Bundle 名称。与 assets/bundles/ 下的目录名一致（PRD-10 §3）。 */
export const BUNDLE_NAMES = [
    'start-scene',
    'shared',
    'camp',
    'career_base',
    'career_tier_1',
    'map_01',
    'map_02',
    'map_03',
    'map_04',
    'map_05',
] as const;
export type BundleName = (typeof BUNDLE_NAMES)[number];

/**
 * 首屏包。PRD-10 §3：首屏只加载启动和 shared 最小资源。
 * 加入新包前请确认它真的首屏就要——首屏体积预算 < 25MB（PRD-10 §7）。
 */
export const BOOT_BUNDLES: readonly BundleName[] = ['start-scene', 'shared'];

/**
 * 预载规则：进入某个场景后应在后台预载哪些包。
 *
 * 键为触发点，值为待预载包。营地加载后预载 map_01（PRD-10 §3），
 * 使玩家点「出征」时地图已就绪（地图加载 < 2 秒预算）。
 */
export const PRELOAD_RULES: Readonly<Record<string, readonly BundleName[]>> = {
    camp: ['map_01'],
    map_01: ['map_02'],
    map_02: ['map_03'],
    map_03: ['map_04'],
    map_04: ['map_05'],
};

/**
 * 条件预载：从某张图出发时，仅在满足条件后才预载目标包。
 *
 * 与 PRELOAD_RULES 的区别在于「从哪来」：
 * 地图 3 → 地图 4 是常规出口，无条件预载；
 * 地图 2 → 地图 4 是隐藏条件出口，未满足条件时不该消耗流量，
 * 也不该让玩家从网络请求里提前发现隐藏内容（PRD-05 §3、§9）。
 *
 * 故本表以 fromMapId 为键，表示「该来源下此包需要条件」，
 * 不与 PRELOAD_RULES 的其它来源冲突。
 */
export const CONDITIONAL_PRELOAD: readonly {
    readonly bundle: BundleName;
    /** 出发地图。只约束从这张图触发的预载。 */
    readonly fromMapId: string;
    readonly reason: string;
}[] = [
    {
        bundle: 'map_04',
        fromMapId: 'map_02',
        reason: '地图 2 隐藏出口满足条件后才预载（PRD-10 §3、PRD-05 §9）',
    },
];

/** 地图专属包，切图后可卸载以免内存持续增长（PRD-10 §11）。 */
export const MAP_BUNDLES: readonly BundleName[] = [
    'map_01',
    'map_02',
    'map_03',
    'map_04',
    'map_05',
];

export function isMapBundle(name: string): name is BundleName {
    return (MAP_BUNDLES as readonly string[]).includes(name);
}

export function isBootBundle(name: string): boolean {
    return (BOOT_BUNDLES as readonly string[]).includes(name);
}

/**
 * 校验清单自身的一致性。
 *
 * 由单测调用。这些约束一旦被破坏，症状是首屏变大或切图内存泄漏，
 * 两者都难以在开发期察觉，所以做成显式校验。
 */
export function validateManifest(): readonly string[] {
    const problems: string[] = [];

    // 首屏不得包含地图包：那会把地图资源塞进首包，直接违反 25MB 预算
    for (const bundle of BOOT_BUNDLES) {
        if (isMapBundle(bundle)) {
            problems.push(`首屏包不得包含地图包: ${bundle}`);
        }
    }

    // 预载目标必须是已声明的包，否则运行期才报「找不到 Bundle」
    for (const [trigger, targets] of Object.entries(PRELOAD_RULES)) {
        for (const target of targets) {
            if (!(BUNDLE_NAMES as readonly string[]).includes(target)) {
                problems.push(`预载规则 ${trigger} 指向未声明的包: ${target}`);
            }
        }
    }

    // 同一来源下，一个包不能既无条件预载又要求条件——否则条件形同虚设
    for (const rule of CONDITIONAL_PRELOAD) {
        const sameSource = PRELOAD_RULES[rule.fromMapId] ?? [];
        if ((sameSource as readonly string[]).includes(rule.bundle)) {
            problems.push(
                `${rule.fromMapId} 对 ${rule.bundle} 同时有无条件预载与条件预载，` +
                    `条件将失效（${rule.reason}）`,
            );
        }
        if (!(BUNDLE_NAMES as readonly string[]).includes(rule.bundle)) {
            problems.push(`条件预载指向未声明的包: ${rule.bundle}`);
        }
    }

    return problems;
}
