const MAP_TEXT: Readonly<Record<string, string>> = {
    'item.pickaxe': '开山镐',
    'item.lens': '探灵镜',
    'item.beast_meat': '妖兽肉',
    'item.bigu_cake': '辟谷饼',
    'item.return_talisman': '归营符',
};

/** 本地化服务接入前的简中兜底，键仍以 localization 表为事实源。 */
export function mapText(key: string): string {
    return MAP_TEXT[key] ?? key;
}
