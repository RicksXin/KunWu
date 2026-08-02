/** 入山整备 Prefab 内由 Presenter 绑定的静态节点。 */
export const CAMP_EXPEDITION_PATHS = Object.freeze({
    backdrop: 'Backdrop',
    preparation: 'PreparationLayer',
    preparationPanel: 'PreparationLayer/Panel',
    preparationTitle: 'PreparationLayer/Title',
    heroCards: 'PreparationLayer/HeroCards',
    toolbar: 'PreparationLayer/Toolbar',
    editParty: 'PreparationLayer/Toolbar/EditPartyButton',
    partyTabs: 'PreparationLayer/Toolbar/PartyTabs',
    restoreStamina: 'PreparationLayer/Toolbar/RestoreStaminaButton',
    burdenRow: 'PreparationLayer/BurdenRow',
    burdenLabel: 'PreparationLayer/BurdenRow/BurdenLabel',
    loadoutRows: 'PreparationLayer/LoadoutRows',
    spiritGrainRow: 'PreparationLayer/LoadoutRows/SpiritGrainRow',
    pickaxeRow: 'PreparationLayer/LoadoutRows/PickaxeRow',
    lensRow: 'PreparationLayer/LoadoutRows/LensRow',
    bottomActions: 'PreparationLayer/BottomActions',
    adventure: 'PreparationLayer/BottomActions/AdventureButton',
    depart: 'PreparationLayer/BottomActions/DepartButton',
    close: 'PreparationLayer/BottomActions/CloseButton',
    heroSelection: 'HeroSelectionLayer',
    heroSelectionPanel: 'HeroSelectionLayer/HeroSelectionPanel',
    heroSelectionTitle: 'HeroSelectionLayer/HeroSelectionTitle',
    heroSelectionHint: 'HeroSelectionLayer/HeroSelectionHint',
    heroList: 'HeroSelectionLayer/HeroList',
    heroSelectionClose: 'HeroSelectionLayer/HeroSelectionCloseButton',
    mapSelection: 'MapSelectionLayer',
    mapSelectionPanel: 'MapSelectionLayer/MapSelectionPanel',
    mapSelectionTitle: 'MapSelectionLayer/MapSelectionTitle',
    mapSelectionHint: 'MapSelectionLayer/MapSelectionHint',
    mapList: 'MapSelectionLayer/MapList',
    mapSelectionClose: 'MapSelectionLayer/MapSelectionCloseButton',
});

/** 灵圃面板固定展示的五种资源；P1 后两行保留为 P2 锁定态。 */
export const CAMP_LING_PU_RESOURCE_ROW_IDS = [
    'spiritGrain',
    'spiritWood',
    'darkIron',
    'spiritCrystal',
    'gengJing',
] as const;
export type CampLingPuResourceRowId =
    (typeof CAMP_LING_PU_RESOURCE_ROW_IDS)[number];

export const CAMP_LING_PU_ROW_CHILD_PATHS = Object.freeze({
    background: 'Background',
    warningOutline: 'WarningOutline',
    icon: 'ResourceIcon',
    name: 'ResourceName',
    stock: 'Stock',
    rate: 'Rate',
    workers: 'Workers',
    status: 'Status',
    minus: 'MinusButton',
    minusVisual: 'MinusButton/Visual',
    plus: 'PlusButton',
    plusVisual: 'PlusButton/Visual',
    upgrade: 'UpgradeButton',
    upgradeVisual: 'UpgradeButton/Visual',
    upgradeLabel: 'UpgradeButton/Visual/Label',
});
export type CampLingPuRowChild = keyof typeof CAMP_LING_PU_ROW_CHILD_PATHS;

const CAMP_LING_PU_PANEL_ROOT = 'ContentMount/LingPuPanel';
const CAMP_LING_PU_MAIN_PANEL = `${CAMP_LING_PU_PANEL_ROOT}/MainPanel`;
const CAMP_LING_PU_CONFIRM_OVERLAY = `${CAMP_LING_PU_PANEL_ROOT}/ConfirmOverlay`;

/** CampLingPuPresenter 使用的静态 Prefab 节点。 */
export const CAMP_LING_PU_PATHS = Object.freeze({
    mount: 'ContentMount',
    panel: CAMP_LING_PU_PANEL_ROOT,
    backdrop: `${CAMP_LING_PU_PANEL_ROOT}/Backdrop`,
    mainPanel: CAMP_LING_PU_MAIN_PANEL,
    panelFrame: `${CAMP_LING_PU_MAIN_PANEL}/PanelFrame`,
    title: `${CAMP_LING_PU_MAIN_PANEL}/Title`,
    resourceRows: `${CAMP_LING_PU_MAIN_PANEL}/ResourceRows`,
    timerLabel: `${CAMP_LING_PU_MAIN_PANEL}/TimerLabel`,
    progressTrack: `${CAMP_LING_PU_MAIN_PANEL}/ProgressTrack`,
    progressFill: `${CAMP_LING_PU_MAIN_PANEL}/ProgressTrack/ProgressFill`,
    recruitButton: `${CAMP_LING_PU_MAIN_PANEL}/RecruitButton`,
    recruitVisual: `${CAMP_LING_PU_MAIN_PANEL}/RecruitButton/Visual`,
    recruitLabel: `${CAMP_LING_PU_MAIN_PANEL}/RecruitButton/Visual/Label`,
    closeButton: `${CAMP_LING_PU_MAIN_PANEL}/CloseButton`,
    closeVisual: `${CAMP_LING_PU_MAIN_PANEL}/CloseButton/Visual`,
    closeLabel: `${CAMP_LING_PU_MAIN_PANEL}/CloseButton/Visual/Label`,
    confirmation: CAMP_LING_PU_CONFIRM_OVERLAY,
    confirmationBackdrop: `${CAMP_LING_PU_CONFIRM_OVERLAY}/ConfirmBackdrop`,
    confirmationPanel: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel`,
    confirmationFrame: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/DialogFrame`,
    confirmationTitle: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/DialogTitle`,
    confirmationIcon: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/CostIcon`,
    confirmationMessage: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/Message`,
    confirmationDetail: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/Detail`,
    confirmationError: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/Error`,
    confirmationPrimary: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/PrimaryButton`,
    confirmationPrimaryVisual:
        `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/PrimaryButton/Visual`,
    confirmationPrimaryLabel:
        `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/PrimaryButton/Visual/Label`,
    confirmationCancel: `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/CancelButton`,
    confirmationCancelVisual:
        `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/CancelButton/Visual`,
    confirmationCancelLabel:
        `${CAMP_LING_PU_CONFIRM_OVERLAY}/DialogPanel/CancelButton/Visual/Label`,
});

export function campLingPuResourceRowPath(
    resourceId: CampLingPuResourceRowId,
    child?: CampLingPuRowChild,
): string {
    const row = `${CAMP_LING_PU_PATHS.resourceRows}/${resourceId}Row`;
    return child ? `${row}/${CAMP_LING_PU_ROW_CHILD_PATHS[child]}` : row;
}
