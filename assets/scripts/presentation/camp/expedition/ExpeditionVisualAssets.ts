import { assetManager, SpriteFrame } from 'cc';
import type { ExpeditionItemId } from 'db://assets/scripts/domain/ExpeditionPreparation';
import { EXPEDITION_VISUAL_PATHS } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionTheme';
import type { ExpeditionVisualAssets } from 'db://assets/scripts/presentation/camp/expedition/ExpeditionViewTypes';

export async function loadExpeditionVisualAssets(): Promise<ExpeditionVisualAssets> {
    const portraitEntries = Object.entries(EXPEDITION_VISUAL_PATHS.portraits);
    const itemEntries = Object.entries(EXPEDITION_VISUAL_PATHS.items) as [
        ExpeditionItemId,
        string,
    ][];
    const [panelFrame, heroCardFrame, emptyHeroFrame, avatarFrame, lockFrame, portraits, items] =
        await Promise.all([
            loadOptionalSpriteFrame(EXPEDITION_VISUAL_PATHS.panel),
            loadOptionalSpriteFrame(EXPEDITION_VISUAL_PATHS.cardFrame),
            loadOptionalSpriteFrame(EXPEDITION_VISUAL_PATHS.emptySilhouette),
            loadOptionalSpriteFrame(EXPEDITION_VISUAL_PATHS.avatarFrame),
            loadOptionalSpriteFrame(EXPEDITION_VISUAL_PATHS.lock),
            Promise.all(
                portraitEntries.map(async ([nameKey, path]) => [
                    nameKey,
                    await loadOptionalSpriteFrame(path),
                ] as const),
            ),
            Promise.all(
                itemEntries.map(async ([itemId, path]) => [
                    itemId,
                    await loadOptionalSpriteFrame(path),
                ] as const),
            ),
        ]);

    const portraitFrames = new Map<string, SpriteFrame>();
    for (const [nameKey, frame] of portraits) {
        if (frame) portraitFrames.set(nameKey, frame);
    }
    const itemFrames = new Map<ExpeditionItemId, SpriteFrame>();
    for (const [itemId, frame] of items) {
        if (frame) itemFrames.set(itemId, frame);
    }
    return {
        panelFrame,
        heroCardFrame,
        emptyHeroFrame,
        avatarFrame,
        lockFrame,
        portraitFrames,
        itemFrames,
    };
}

function loadSpriteFrame(path: string): Promise<SpriteFrame> {
    const bundle = assetManager.getBundle('camp');
    if (!bundle) {
        return Promise.reject(new Error('camp Bundle 尚未加载'));
    }
    return new Promise((resolve, reject) => {
        bundle.load(path, SpriteFrame, (error, frame) => {
            if (error || !frame) {
                reject(error ?? new Error(`找不到 SpriteFrame ${path}`));
                return;
            }
            resolve(frame);
        });
    });
}

async function loadOptionalSpriteFrame(path: string): Promise<SpriteFrame | null> {
    try {
        return await loadSpriteFrame(path);
    } catch (error) {
        console.warn(`[入山整备] 暂时无法加载美术素材 ${path}`, error);
        return null;
    }
}
