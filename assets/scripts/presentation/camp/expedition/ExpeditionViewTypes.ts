import type { SpriteFrame } from 'cc';
import type { ExpeditionItemId } from 'db://assets/scripts/domain/ExpeditionPreparation';

export interface ExpeditionVisualAssets {
    readonly panelFrame: SpriteFrame | null;
    readonly heroCardFrame: SpriteFrame | null;
    readonly emptyHeroFrame: SpriteFrame | null;
    readonly avatarFrame: SpriteFrame | null;
    readonly lockFrame: SpriteFrame | null;
    readonly portraitFrames: ReadonlyMap<string, SpriteFrame>;
    readonly itemFrames: ReadonlyMap<ExpeditionItemId, SpriteFrame>;
}

export function createEmptyExpeditionVisualAssets(): ExpeditionVisualAssets {
    return {
        panelFrame: null,
        heroCardFrame: null,
        emptyHeroFrame: null,
        avatarFrame: null,
        lockFrame: null,
        portraitFrames: new Map<string, SpriteFrame>(),
        itemFrames: new Map<ExpeditionItemId, SpriteFrame>(),
    };
}
