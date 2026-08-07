import { Color } from 'cc';
import type { ExpeditionItemId } from 'db://assets/scripts/domain/ExpeditionPreparation';

/** 新 UI 的唯一逻辑事实源；当前旧 Canvas 只负责等比承载。 */
export const EXPEDITION_LOGICAL_WIDTH = 375;
export const EXPEDITION_LOGICAL_HEIGHT = 817;

export const EXPEDITION_VISUAL_PATHS = Object.freeze({
    panel: 'ui/expedition/ui_expedition_panel_body/spriteFrame',
    heroSelectionPanel: 'ui/expedition/ui_expedition_hero_selection_panel/spriteFrame',
    mapSelectionPanel: 'ui/expedition/ui_expedition_map_selection_panel/spriteFrame',
    panelDecorationTop: 'ui/expedition/ui_expedition_panel_decoration_top/spriteFrame',
    panelDecorationBottom: 'ui/expedition/ui_expedition_panel_decoration_bottom/spriteFrame',
    cardFrame: 'ui/expedition/ui_expedition_hero_card_frame/spriteFrame',
    emptySilhouette: 'ui/expedition/ui_expedition_hero_empty_silhouette/spriteFrame',
    avatarFrame: 'ui/top/ui_camp_avatar_frame/spriteFrame',
    lock: 'ui/expedition/icon_expedition_lock/spriteFrame',
    partyTabDefault: 'ui/expedition/ui_expedition_party_tab_default/spriteFrame',
    partyTabSelected: 'ui/expedition/ui_expedition_party_tab_selected/spriteFrame',
    heroRowDefault: 'ui/expedition/ui_expedition_hero_selection_row_default/spriteFrame',
    heroRowSelected: 'ui/expedition/ui_expedition_hero_selection_row_selected/spriteFrame',
    stepperMinus: 'ui/ling_pu/icon_action_minus/spriteFrame',
    stepperPlus: 'ui/ling_pu/icon_action_plus/spriteFrame',
    portraits: Object.freeze({
        'hero.shi_yan': 'ui/expedition/portrait_hero_shi_yan_expedition/spriteFrame',
        'hero.lu_qing': 'ui/expedition/portrait_hero_lu_qing_expedition/spriteFrame',
        'hero.bai_ling': 'ui/expedition/portrait_hero_bai_ling_expedition/spriteFrame',
        'hero.mo_yan': 'ui/expedition/portrait_hero_mo_yan_expedition/spriteFrame',
    } as const),
    items: Object.freeze({
        spiritGrain: 'ui/top/icon_resource_spirit_grain/spriteFrame',
        pickaxe: 'ui/expedition/icon_expedition_pickaxe/spriteFrame',
        lens: 'ui/expedition/icon_expedition_lens/spriteFrame',
    } satisfies Readonly<Record<ExpeditionItemId, string>>),
});

export const EXPEDITION_COLORS = Object.freeze({
    backdrop: new Color(0, 0, 0, 164),
    panel: new Color(17, 25, 23, 250),
    panelAlt: new Color(32, 42, 39, 255),
    row: new Color(43, 52, 44, 255),
    rowSelected: new Color(88, 76, 38, 255),
    mapRowStart: new Color(22, 37, 34, 255),
    mapRowEnd: new Color(8, 17, 16, 255),
    mapRowBorder: new Color(102, 91, 72, 184),
    border: new Color(128, 98, 58, 255),
    borderSoft: new Color(63, 95, 89, 255),
    text: new Color(232, 220, 187, 255),
    textSecondary: new Color(145, 164, 158, 255),
    accent: new Color(181, 138, 66, 255),
    info: new Color(88, 185, 180, 255),
    warning: new Color(229, 139, 82, 255),
    disabled: new Color(94, 106, 102, 255),
    button: new Color(63, 78, 70, 255),
    buttonPrimary: new Color(120, 88, 42, 255),
    buttonArt: new Color(255, 255, 255, 255),
    buttonArtPrimary: new Color(255, 238, 204, 255),
    buttonArtDisabled: new Color(126, 126, 126, 255),
    silhouette: new Color(7, 10, 10, 240),
});

export const EXPEDITION_CAREER_CARD_COLORS: Readonly<Record<string, Color>> = {
    wu_xiu: new Color(90, 61, 43, 255),
    fa_xiu: new Color(42, 57, 89, 255),
    yi_xiu: new Color(50, 81, 63, 255),
    qian_xiu: new Color(65, 47, 73, 255),
    fu_xiu: new Color(73, 68, 42, 255),
    ti_xiu: new Color(78, 54, 48, 255),
};

export const COMMON_ART_BUTTON_NAMES = new Set([
    'EditPartyButton',
    'RestoreStaminaButton',
    'AdventureButton',
    'DepartButton',
    'CloseButton',
    'MapSelectionCloseButton',
    'HeroSelectionCloseButton',
    'HeroSelectionBackButton',
    'SelectButton',
]);

/** localization 服务接入前的简中兜底；键仍以本地化表为事实源。 */
const FALLBACK_TEXT: Readonly<Record<string, string>> = {
    'hero.shi_yan': '石岩',
    'hero.lu_qing': '陆清',
    'hero.bai_ling': '白灵',
    'hero.mo_yan': '墨言',
    'career.wu_xiu': '剑修',
    'career.fa_xiu': '法修',
    'career.yi_xiu': '医修',
    'career.qian_xiu': '潜修',
    'career.fu_xiu': '符修',
    'career.ti_xiu': '体修',
    'realm.lian_qi': '炼气',
    'realm.zhu_ji': '筑基',
    'realm.jie_dan': '结丹',
    'realm.yuan_ying': '元婴',
    'realm.hua_shen': '化神',
    'realm.lian_xu': '炼虚',
    'realm.he_ti': '合体',
    'realm.da_cheng': '大乘',
    'spiritual_root.mixed_root': '杂灵根',
    'spiritual_root.pseudo_root': '伪灵根',
    'spiritual_root.triple_root': '三灵根',
    'spiritual_root.dual_root': '双灵根',
    'spiritual_root.heavenly_root': '天灵根',
    'spiritual_root.variant_root': '异灵根',
    'resource.spirit_grain': '灵粮',
    'item.pickaxe': '开山镐',
    'item.lens': '探灵镜',
    'map.map_01': '破禁山麓',
    'map.map_02': '白玉广场',
    'map.map_03': '灵宝遗址',
    'map.map_04': '镇魔塔外层',
    'map.map_05': '封魔深层',
};

export function expeditionText(key: string): string {
    return FALLBACK_TEXT[key] ?? key;
}

export function partyRejectionText(reason: string): string {
    const messages: Readonly<Record<string, string>> = {
        hero_dead: '阵亡修士不能上阵',
        duplicate_in_party: '该修士已在当前队伍',
        in_another_party: '该修士已在另一支队伍',
        invalid_slot: '队伍槽位无效',
        hero_not_found: '修士不存在',
    };
    return messages[reason] ?? '无法选择该修士';
}
