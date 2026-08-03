import { assetManager, SpriteFrame } from 'cc';

const PORTRAIT_PATHS: Readonly<Record<string, string>> = {
    'hero.shi_yan': 'ui/expedition/portrait_hero_shi_yan_expedition/spriteFrame',
    'hero.lu_qing': 'ui/expedition/portrait_hero_lu_qing_expedition/spriteFrame',
    'hero.bai_ling': 'ui/expedition/portrait_hero_bai_ling_expedition/spriteFrame',
    'hero.mo_yan': 'ui/expedition/portrait_hero_mo_yan_expedition/spriteFrame',
};

export async function loadCombatPortraits(): Promise<ReadonlyMap<string, SpriteFrame>> {
    const entries = await Promise.all(Object.entries(PORTRAIT_PATHS).map(async ([key, path]) => [
        key,
        await loadOptional(path),
    ] as const));
    const result = new Map<string, SpriteFrame>();
    entries.forEach(([key, frame]) => { if (frame) result.set(key, frame); });
    return result;
}

function loadOptional(path: string): Promise<SpriteFrame | null> {
    const bundle = assetManager.getBundle('camp');
    if (!bundle) return Promise.resolve(null);
    return new Promise((resolve) => {
        bundle.load(path, SpriteFrame, (error, frame) => {
            if (error || !frame) {
                console.warn(`[战斗灰盒] 修士立绘加载失败：${path}`, error);
                resolve(null);
                return;
            }
            resolve(frame);
        });
    });
}
