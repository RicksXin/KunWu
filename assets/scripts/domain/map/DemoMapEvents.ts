export const DEMO_MAP_EVENT_ACTION_IDS = [
    'engage', 'inspect', 'talk', 'operate', 'small_talk', 'leave',
] as const;
export type DemoMapEventActionId = (typeof DEMO_MAP_EVENT_ACTION_IDS)[number];

export type DemoMapObjectKind =
    | 'enemy_group'
    | 'boss_main'
    | 'boss_side'
    | 'boss_field'
    | 'resource_node'
    | 'treasure_chest'
    | 'story_event'
    | 'attribute_check'
    | 'npc'
    | 'dungeon_entrance';

const DEMO_MAP_OBJECT_KINDS: readonly DemoMapObjectKind[] = [
    'enemy_group', 'boss_main', 'boss_side', 'boss_field', 'resource_node',
    'treasure_chest', 'story_event', 'attribute_check', 'npc', 'dungeon_entrance',
];

export function isDemoMapObjectKind(value: string): value is DemoMapObjectKind {
    return DEMO_MAP_OBJECT_KINDS.some((kind) => kind === value);
}

export function parseDemoMapEventActions(
    value: unknown,
    kind: DemoMapObjectKind,
    path: string,
): DemoMapEventActionId[] {
    if (value === undefined) return defaultEventActions(kind);
    if (!Array.isArray(value)) throw new Error(`${path}.eventActions 应为数组`);
    const actions = value.map((entry, index) => {
        if (typeof entry !== 'string' || entry.length === 0) {
            throw new Error(`${path}.eventActions[${index}] 应为非空字符串`);
        }
        if (!DEMO_MAP_EVENT_ACTION_IDS.some((candidate) => candidate === entry)) {
            throw new Error(`${path}.eventActions 不支持 ${entry}`);
        }
        return entry as DemoMapEventActionId;
    });
    if (new Set(actions).size !== actions.length) throw new Error(`${path}.eventActions 不得重复`);
    if (!actions.includes('leave')) throw new Error(`${path}.eventActions 必须包含 leave`);
    return actions;
}

function defaultEventActions(kind: DemoMapObjectKind): DemoMapEventActionId[] {
    if (kind === 'enemy_group' || kind.startsWith('boss_')) return ['engage', 'inspect', 'leave'];
    if (kind === 'npc') return ['talk', 'small_talk', 'leave'];
    if (kind === 'resource_node' || kind === 'treasure_chest' || kind === 'dungeon_entrance') {
        return ['operate', 'leave'];
    }
    return ['leave'];
}
