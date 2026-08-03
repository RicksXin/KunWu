const COMBAT_TEXT: Readonly<Record<string, string>> = {
    'hero.shi_yan': '石岩',
    'hero.lu_qing': '陆清',
    'hero.bai_ling': '白灵',
    'hero.mo_yan': '墨言',
    'enemy.can_jin_shi_kui': '残禁石傀',
    'race.human': '人',
    'race.puppet': '傀',
    'skill.zhan_ji': '斩击',
    'skill.tiao_xin': '挑衅',
    'skill.chong_zhuang': '冲撞',
    'skill.ling_huo_dan': '灵火弹',
    'skill.ning_shuang_hu': '凝霜护',
    'skill.ling_neng_zhen_dang': '灵能震荡',
    'skill.hui_chun_shu': '回春术',
    'skill.qing_xin_jue': '清心诀',
    'skill.ling_guang_ji': '灵光击',
    'skill.ying_xi': '影袭',
    'skill.tou_ren': '投刃',
    'skill.yan_dun': '烟遁',
    'skill.shi_kui_zhen_di': '震地',
    'skill.shi_kui_jin_shen': '禁身',
    'skill.shi_kui_zhong_quan': '石拳',
    'item.pickaxe': '开山镐',
    'item.lens': '探灵镜',
    'item.beast_meat': '妖兽肉',
    'item.bigu_cake': '辟谷饼',
    'item.return_talisman': '归营符',
};

const STATUS_TEXT: Readonly<Record<string, string>> = {
    shield: '盾',
    haste: '疾',
    gather_spirit: '聚',
    counter: '反',
    purify: '净',
    damage_up: '强',
    armor_break: '破',
    resist_down: '蚀',
    poison: '毒',
    burn: '灼',
    slow: '缓',
    seal: '封',
    stun: '晕',
    entangle: '缠',
    silence: '默',
};

export function combatText(key: string): string {
    return COMBAT_TEXT[key] ?? key;
}

export function combatStatusText(kind: string): string {
    return STATUS_TEXT[kind] ?? kind.slice(0, 1);
}
