/** 营地人物列表与灰盒对话（PRD-08 §4、§6）。 */

export const CAMP_NPC_IDS = ['npc_cen_shouyi'] as const;
export type CampNpcId = (typeof CAMP_NPC_IDS)[number];
export type CampNpcStatus = '可交谈' | '有任务' | '可交付' | '等待线索' | '暂时离营';

export interface CampNpcListItem {
    readonly id: CampNpcId;
    readonly name: string;
    readonly role: string;
    readonly status: CampNpcStatus;
}

export const CEN_SHOUYI_INTRO_DIALOGUE = [
    '山门外的灯，熄了十二年。你既接了这方营印，就先看粮册，再看阵图。',
    '禁地里的宝物不会跑，营里的人却会饿死。灵粮既养营，也供你入山。',
    '议事殿、灵圃与百宝库尚可运转。整备妥当，再来谈山门外的阵灯。',
] as const;

export const CEN_SHOUYI_REPEAT_DIALOGUE = [
    '营印既已交到你手里，先盯紧灵粮。其余的账，待你平安回来再算。',
] as const;

/** 新档仅显示默认入驻的岑守一，后续 NPC 按 Flag 追加。 */
export function availableCampNpcs(
    storyFlags: Readonly<Record<string, boolean>>,
): readonly CampNpcListItem[] {
    return [
        {
            id: 'npc_cen_shouyi',
            name: '岑守一',
            role: '留守管事·旧阵簿保管人',
            status: storyFlags.met_cen_shou_yi ? '可交谈' : '有任务',
        },
    ];
}

export function dialogueForCampNpc(
    npcId: CampNpcId,
    storyFlags: Readonly<Record<string, boolean>>,
): readonly string[] {
    if (npcId !== 'npc_cen_shouyi') {
        return [];
    }
    return storyFlags.met_cen_shou_yi
        ? CEN_SHOUYI_REPEAT_DIALOGUE
        : CEN_SHOUYI_INTRO_DIALOGUE;
}

/** 返回新 Flag，不在领域层直接改存档对象。 */
export function completeCampNpcDialogue(
    npcId: CampNpcId,
    storyFlags: Readonly<Record<string, boolean>>,
): Record<string, boolean> {
    if (npcId !== 'npc_cen_shouyi') {
        return { ...storyFlags };
    }
    return {
        ...storyFlags,
        met_cen_shou_yi: true,
        tutorial_started: true,
    };
}
