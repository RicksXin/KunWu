import { assetManager, JsonAsset } from 'cc';
import { parseCombatCatalog } from 'db://assets/scripts/services/combat/CombatCatalog';
import type { CombatCatalog } from 'db://assets/scripts/services/combat/CombatCatalog';

export function loadD0CombatCatalog(): Promise<CombatCatalog> {
    const bundle = assetManager.getBundle('shared');
    if (!bundle) return Promise.reject(new Error('shared Bundle 尚未加载'));
    return new Promise((resolve, reject) => {
        bundle.load('combat_d0', JsonAsset, (error, asset) => {
            if (error || !asset?.json) {
                reject(error ?? new Error('combat_d0.json 为空'));
                return;
            }
            try {
                resolve(parseCombatCatalog(asset.json));
            } catch (parseError) {
                reject(parseError);
            }
        });
    });
}
