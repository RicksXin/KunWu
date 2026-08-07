import type { SpriteFrame, TTFFont } from 'cc';
import type { ExpeditionItemId } from 'db://assets/scripts/domain/ExpeditionPreparation';

export interface ExpeditionVisualAssets {
    readonly font: TTFFont | null;
    readonly panelFrame: SpriteFrame | null;
    readonly heroSelectionPanelFrame: SpriteFrame | null;
    readonly mapSelectionPanelFrame: SpriteFrame | null;
    readonly panelDecorationTop: SpriteFrame | null;
    readonly panelDecorationBottom: SpriteFrame | null;
    readonly heroCardFrame: SpriteFrame | null;
    readonly emptyHeroFrame: SpriteFrame | null;
    readonly avatarFrame: SpriteFrame | null;
    readonly lockFrame: SpriteFrame | null;
    readonly partyTabDefault: SpriteFrame | null;
    readonly partyTabSelected: SpriteFrame | null;
    readonly heroRowDefault: SpriteFrame | null;
    readonly heroRowSelected: SpriteFrame | null;
    readonly stepperMinus: SpriteFrame | null;
    readonly stepperPlus: SpriteFrame | null;
    readonly portraitFrames: ReadonlyMap<string, SpriteFrame>;
    readonly itemFrames: ReadonlyMap<ExpeditionItemId, SpriteFrame>;
}

export function createEmptyExpeditionVisualAssets(): ExpeditionVisualAssets {
    return {
        font: null,
        panelFrame: null,
        heroSelectionPanelFrame: null,
        mapSelectionPanelFrame: null,
        panelDecorationTop: null,
        panelDecorationBottom: null,
        heroCardFrame: null,
        emptyHeroFrame: null,
        avatarFrame: null,
        lockFrame: null,
        partyTabDefault: null,
        partyTabSelected: null,
        heroRowDefault: null,
        heroRowSelected: null,
        stepperMinus: null,
        stepperPlus: null,
        portraitFrames: new Map<string, SpriteFrame>(),
        itemFrames: new Map<ExpeditionItemId, SpriteFrame>(),
    };
}
