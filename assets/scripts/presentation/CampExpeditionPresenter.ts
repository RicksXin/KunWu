import {
    _decorator,
    assetManager,
    Button,
    Color,
    Component,
    EventKeyboard,
    Graphics,
    input,
    Input,
    HorizontalTextAlignment,
    KeyCode,
    Label,
    Mask,
    Node,
    ScrollView,
    Sprite,
    SpriteFrame,
    UITransform,
} from 'cc';
import { AppRoot } from 'db://assets/scripts/AppRoot';
import {
    EXPEDITION_ITEM_IDS,
    loadoutWeight,
    partyBurdenLimit,
    settleNaturalStamina,
    validateExpeditionReadiness,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import type {
    ExpeditionHeroSnapshot,
    ExpeditionItemId,
    ExpeditionMapOption,
    ExpeditionPreparationConfig,
} from 'db://assets/scripts/domain/ExpeditionPreparation';
import { realmOf } from 'db://assets/scripts/domain/HeroGrowth';
import {
    assignToSlot,
    clearSlot,
    createPreset,
    membersOf,
} from 'db://assets/scripts/domain/Party';
import type { PartyPreset, PartySlots } from 'db://assets/scripts/domain/Party';
import type {
    ExpeditionPreparationState,
    HeroInstance,
    Profile,
} from 'db://assets/scripts/services/GameState';

const { ccclass } = _decorator;

/** 新 UI 的唯一逻辑事实源；当前旧 Canvas 只负责等比承载。 */
const LOGICAL_WIDTH = 375;
const LOGICAL_HEIGHT = 817;
const RUNTIME_HOST_NAME = 'ExpeditionPreparationRuntime';

const EXPEDITION_VISUAL_PATHS = Object.freeze({
    panel: 'ui/ling_pu/ui_ling_pu_panel_frame/spriteFrame',
    cardFrame: 'ui/expedition/ui_expedition_hero_card_frame/spriteFrame',
    emptySilhouette: 'ui/expedition/ui_expedition_hero_empty_silhouette/spriteFrame',
    avatarFrame: 'ui/top/ui_camp_avatar_frame/spriteFrame',
    lock: 'ui/expedition/icon_expedition_lock/spriteFrame',
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

const COLORS = Object.freeze({
    backdrop: new Color(4, 8, 9, 224),
    panel: new Color(22, 30, 29, 250),
    panelAlt: new Color(31, 42, 39, 255),
    row: new Color(43, 52, 44, 255),
    rowSelected: new Color(88, 76, 38, 255),
    border: new Color(154, 128, 72, 255),
    borderSoft: new Color(79, 101, 91, 255),
    text: new Color(236, 229, 204, 255),
    textSecondary: new Color(176, 185, 170, 255),
    warning: new Color(229, 139, 82, 255),
    disabled: new Color(64, 69, 65, 255),
    button: new Color(63, 78, 70, 255),
    buttonPrimary: new Color(120, 88, 42, 255),
    silhouette: new Color(7, 10, 10, 240),
});

interface CreatedButton {
    readonly node: Node;
    readonly button: Button;
    readonly label: Label;
}

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
    'resource.spirit_grain': '灵粮',
    'item.pickaxe': '开山镐',
    'item.lens': '探灵镜',
    'map.map_01': '破禁山麓',
    'map.map_02': '白玉广场',
    'map.map_03': '灵宝遗址',
    'map.map_04': '古殿群',
    'map.map_05': '镇魔禁域',
};

const CAREER_CARD_COLORS: Readonly<Record<string, Color>> = {
    wu_xiu: new Color(90, 61, 43, 255),
    fa_xiu: new Color(42, 57, 89, 255),
    yi_xiu: new Color(50, 81, 63, 255),
    qian_xiu: new Color(65, 47, 73, 255),
    fu_xiu: new Color(73, 68, 42, 255),
    ti_xiu: new Color(78, 54, 48, 255),
};

/**
 * 营地传送阵唤起的入山整备弹窗。
 *
 * 节点运行时创建，是因为本次不能伪造新场景节点 UUID；脚本本身仍须由 Cocos
 * Creator 首次导入并生成 .meta。后续正式美术到位后可把同一 Presenter 挂到 Prefab。
 */
@ccclass('CampExpeditionPresenter')
export class CampExpeditionPresenter extends Component {
    private config: ExpeditionPreparationConfig | null = null;
    private preparationLayer: Node | null = null;
    private selectionLayer: Node | null = null;
    private mapLayer: Node | null = null;
    private panelFrame: SpriteFrame | null = null;
    private heroCardFrame: SpriteFrame | null = null;
    private emptyHeroFrame: SpriteFrame | null = null;
    private avatarFrame: SpriteFrame | null = null;
    private lockFrame: SpriteFrame | null = null;
    private readonly portraitFrames = new Map<string, SpriteFrame>();
    private readonly itemFrames = new Map<ExpeditionItemId, SpriteFrame>();
    private visualLoadStarted = false;
    private saveQueue: Promise<void> = Promise.resolve();

    /** 两套大厅 Presenter 都可调用；重复调用复用同一个运行时宿主。 */
    static showFrom(owner: Component): void {
        const scene = owner.node.scene;
        const canvas = scene?.getChildByName('Canvas') ?? null;
        const mount = canvas?.getChildByName('SafeAreaRoot') ?? canvas;
        if (!mount) {
            AppRoot.instance.showFeedback('入山整备面板挂载失败');
            return;
        }

        let host = mount.getChildByName(RUNTIME_HOST_NAME);
        if (!host) {
            host = new Node(RUNTIME_HOST_NAME);
            host.layer = mount.layer;
            mount.addChild(host);
            const transform = host.addComponent(UITransform);
            transform.setContentSize(LOGICAL_WIDTH, LOGICAL_HEIGHT);
            transform.setAnchorPoint(0.5, 0.5);
        }
        const presenter =
            host.getComponent(CampExpeditionPresenter) ??
            host.addComponent(CampExpeditionPresenter);
        presenter.open();
    }

    protected override onLoad(): void {
        this.node.active = false;
        this.syncLogicalScale();
        this.node.parent?.on(Node.EventType.SIZE_CHANGED, this.syncLogicalScale, this);
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        this.schedule(this.tickStamina, 1);
        this.buildShell();
        void this.loadVisualAssets();
    }

    protected override onDestroy(): void {
        this.node.parent?.off(Node.EventType.SIZE_CHANGED, this.syncLogicalScale, this);
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this);
        this.unschedule(this.tickStamina);
    }

    open(): void {
        const app = AppRoot.instance;
        this.config = app.getExpeditionPreparationConfig();
        if (!this.config || !app.state.isLoaded) {
            app.showFeedback('入山配置尚未就绪');
            return;
        }
        this.node.active = true;
        this.node.setSiblingIndex((this.node.parent?.children.length ?? 1) - 1);
        this.selectionLayer && (this.selectionLayer.active = false);
        this.mapLayer && (this.mapLayer.active = false);
        this.settleStamina();
        this.renderPreparation();
    }

    close(): void {
        this.node.active = false;
        this.selectionLayer && (this.selectionLayer.active = false);
        this.mapLayer && (this.mapLayer.active = false);
    }

    private readonly syncLogicalScale = (): void => {
        const size = this.node.parent?.getComponent(UITransform)?.contentSize;
        if (!size) {
            return;
        }
        const scale = Math.min(size.width / LOGICAL_WIDTH, size.height / LOGICAL_HEIGHT);
        this.node.setScale(scale, scale, 1);
        this.node.setPosition(0, 0, 0);
    };

    private buildShell(): void {
        createRect(this.node, 'Backdrop', 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT, COLORS.backdrop);
        this.preparationLayer = createLayer(this.node, 'PreparationLayer');
        this.selectionLayer = createLayer(this.node, 'HeroSelectionLayer');
        this.mapLayer = createLayer(this.node, 'MapSelectionLayer');
        this.selectionLayer.active = false;
        this.mapLayer.active = false;
    }

    private renderPreparation(): void {
        const layer = this.preparationLayer;
        const config = this.config;
        const app = AppRoot.instance;
        if (!layer || !config || !app.state.isLoaded) {
            return;
        }
        clearChildren(layer);
        const profile = app.state.require();
        const state = profile.expeditionPreparation;
        const preset = currentPreset(state);

        this.createPanelBackground(layer, 'Panel', 0, 0, 359, 570);
        createLabel(layer, 'Title', '入山整备', 0, 260, 200, 30, 20, COLORS.text);

        for (let index = 0; index < 4; index += 1) {
            const heroId = preset.slots[index] ?? null;
            const hero = profile.roster.find((candidate) => candidate.instanceId === heroId) ?? null;
            this.createHeroCard(layer, hero, index);
        }

        createButton(layer, {
            name: 'EditPartyButton',
            text: '编辑队伍',
            x: -127,
            y: 17,
            width: 94,
            height: 42,
            onClick: () => this.openHeroSelection(),
        });
        this.createPartyTabs(layer, state, profile);
        createButton(layer, {
            name: 'RestoreStaminaButton',
            text: '调息',
            x: 127,
            y: 17,
            width: 94,
            height: 42,
            enabled: false,
            onClick: () => app.showFeedback('调息功能暂未开放'),
        });

        const heroes = heroSnapshots(profile);
        const weight = loadoutWeight(state.loadout, config);
        const limit = partyBurdenLimit(preset.slots, heroes, config);
        createRect(layer, 'BurdenRow', 0, -26, 327, 32, COLORS.panelAlt, COLORS.borderSoft);
        createLabel(
            layer,
            'BurdenLabel',
            `负重  ${weight}/${limit}`,
            0,
            -26,
            250,
            28,
            15,
            weight > limit ? COLORS.warning : COLORS.text,
        );

        EXPEDITION_ITEM_IDS.forEach((itemId, index) => {
            this.createLoadoutRow(layer, itemId, -70 - index * 55, profile, preset.slots);
        });

        createButton(layer, {
            name: 'AdventureButton',
            text: '历练',
            x: -121,
            y: -255,
            width: 105,
            height: 50,
            enabled: false,
            onClick: () => app.showFeedback('历练功能暂未开放'),
        });
        createButton(layer, {
            name: 'DepartButton',
            text: '启程',
            x: 0,
            y: -255,
            width: 105,
            height: 50,
            primary: true,
            onClick: () => this.openMapSelection(),
        });
        createButton(layer, {
            name: 'LeaveButton',
            text: '离开',
            x: 121,
            y: -255,
            width: 105,
            height: 50,
            onClick: () => this.close(),
        });
    }

    private createHeroCard(parent: Node, hero: HeroInstance | null, index: number): void {
        const width = 79;
        const x = -124.5 + index * 83;
        const background = hero
            ? CAREER_CARD_COLORS[hero.careerId] ?? COLORS.panelAlt
            : new Color(30, 34, 33, 255);
        const card = createRect(parent, `HeroCard${index + 1}`, x, 145, width, 205, background, COLORS.borderSoft);
        const portraitFrame = hero ? this.portraitFrames.get(hero.nameKey) ?? null : null;
        if (portraitFrame) {
            createSpriteNode(card, 'Portrait', portraitFrame, 0, 0, width, 205);
        } else if (!hero && this.emptyHeroFrame) {
            createSpriteNode(card, 'EmptyPortrait', this.emptyHeroFrame, 0, 25, 64, 112);
        } else {
            createSilhouette(card, 0, 25, hero === null);
        }
        // 卡框只覆盖人物，不得压住后续运行时文字。
        this.addHeroCardFrame(card);
        if (!hero) {
            createLabel(card, 'Undecided', '人选未定', 0, -78, 72, 24, 13, COLORS.textSecondary);
            return;
        }

        const details = [
            `灵息 ${hero.stamina}`,
            heroName(hero),
            `${localized(`career.${hero.careerId}`)}·${hero.level}级`,
            localized(`realm.${realmOf(hero.level)}`),
        ].join('\n');
        const label = createLabel(card, 'HeroInfo', details, 0, -50, width - 8, 76, 12, COLORS.text);
        label.lineHeight = 17;
    }

    private addHeroCardFrame(card: Node): void {
        if (this.heroCardFrame) {
            createSpriteNode(card, 'CardFrame', this.heroCardFrame, 0, 0, 79, 205);
        }
    }

    private createPanelBackground(
        parent: Node,
        name: string,
        x: number,
        y: number,
        width: number,
        height: number,
    ): Node {
        if (this.panelFrame) {
            return createSlicedSpriteNode(
                parent,
                name,
                this.panelFrame,
                x,
                y,
                width,
                height,
                30,
            );
        }
        return createRect(parent, name, x, y, width, height, COLORS.panel, COLORS.border);
    }

    private createPartyTabs(
        parent: Node,
        state: ExpeditionPreparationState,
        profile: Profile,
    ): void {
        const config = this.config;
        if (!config) {
            return;
        }
        const tabWidth = 42;
        for (let index = 0; index < config.maxPartyPresets; index += 1) {
            const preset = state.partyPresets[index];
            const isCurrent = preset?.presetId === state.activePresetId;
            const button = createButton(parent, {
                name: `PartyTab${index + 1}`,
                text: `${index + 1}队`,
                x: -46 + index * 46,
                y: 17,
                width: tabWidth,
                height: 42,
                primary: isCurrent,
                onClick: () => {
                    if (preset) {
                        state.activePresetId = preset.presetId;
                        this.queueSave('切换队伍');
                        this.renderPreparation();
                        return;
                    }
                    this.unlockParty(index, profile);
                },
            });
            button.label.fontSize = 11;
            if (!preset && this.lockFrame) {
                createSpriteNode(button.node, 'LockIcon', this.lockFrame, 13, 12, 14, 14);
            }
        }
    }

    private unlockParty(index: number, profile: Profile): void {
        const config = this.config;
        if (!config || index !== profile.expeditionPreparation.partyPresets.length) {
            AppRoot.instance.showFeedback('请按顺序解锁队伍');
            return;
        }
        const cost = config.partyUnlockCosts[index] ?? 0;
        if (profile.wallet.immortalCoin < cost) {
            AppRoot.instance.showFeedback(`解锁 ${index + 1}队需要 ${cost} 灵石`);
            return;
        }
        profile.wallet.immortalCoin -= cost;
        const next = createPreset(`party_${String(index + 1).padStart(2, '0')}`, `${index + 1}队`);
        profile.expeditionPreparation.partyPresets.push(next);
        profile.expeditionPreparation.activePresetId = next.presetId;
        AppRoot.instance.events.emit('wallet.changed', { wallet: profile.wallet });
        this.queueSave('解锁队伍');
        AppRoot.instance.showFeedback(`${index + 1}队已解锁`);
        this.renderPreparation();
    }

    private createLoadoutRow(
        parent: Node,
        itemId: ExpeditionItemId,
        y: number,
        profile: Profile,
        slots: PartySlots,
    ): void {
        const config = this.config;
        if (!config) {
            return;
        }
        const item = config.items[itemId];
        const carried = profile.expeditionPreparation.loadout[itemId];
        const available = availableItemCount(itemId, profile, config);
        const currentWeight = loadoutWeight(profile.expeditionPreparation.loadout, config);
        const limit = partyBurdenLimit(slots, heroSnapshots(profile), config);
        const canAdd = carried < available && currentWeight + item.weight <= limit;

        const row = createRect(parent, `Loadout_${itemId}`, 0, y, 327, 50, COLORS.row, COLORS.borderSoft);
        const itemFrame = this.itemFrames.get(itemId) ?? null;
        if (itemFrame) {
            createSpriteNode(row, 'ItemIcon', itemFrame, -137, 0, 24, 24);
        } else {
            createItemGlyph(row, itemId, -137, 0);
        }
        createLabel(row, 'Name', localized(item.nameKey), -91, 7, 75, 22, 14, COLORS.text, HorizontalTextAlignment.LEFT);
        createLabel(
            row,
            'Count',
            `${carried}/${available}`,
            -91,
            -12,
            75,
            18,
            11,
            COLORS.textSecondary,
            HorizontalTextAlignment.LEFT,
        );
        createLabel(row, 'Weight', `重 ${item.weight}`, 7, 0, 48, 24, 11, COLORS.textSecondary);
        createButton(row, {
            name: 'MinusButton',
            text: '−',
            x: 91,
            y: 0,
            width: 44,
            height: 44,
            enabled: carried > 0,
            onClick: () => this.adjustLoadout(itemId, -1),
        });
        createButton(row, {
            name: 'PlusButton',
            text: '+',
            x: 139,
            y: 0,
            width: 44,
            height: 44,
            enabled: canAdd,
            onClick: () => this.adjustLoadout(itemId, 1),
        });
    }

    private adjustLoadout(itemId: ExpeditionItemId, delta: number): void {
        const app = AppRoot.instance;
        const config = this.config;
        if (!app.state.isLoaded || !config) {
            return;
        }
        const profile = app.state.require();
        const state = profile.expeditionPreparation;
        const preset = currentPreset(state);
        const next = state.loadout[itemId] + delta;
        const available = availableItemCount(itemId, profile, config);
        if (next < 0 || next > available) {
            return;
        }
        const old = state.loadout[itemId];
        state.loadout[itemId] = next;
        if (loadoutWeight(state.loadout, config) > partyBurdenLimit(preset.slots, heroSnapshots(profile), config)) {
            state.loadout[itemId] = old;
            app.showFeedback('负重已达上限');
            return;
        }
        this.queueSave('调整入山物资');
        this.renderPreparation();
    }

    private openHeroSelection(): void {
        const layer = this.selectionLayer;
        const app = AppRoot.instance;
        if (!layer || !app.state.isLoaded) {
            return;
        }
        clearChildren(layer);
        layer.active = true;
        createRect(layer, 'Backdrop', 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT, COLORS.backdrop);
        this.createPanelBackground(layer, 'Panel', 0, 0, 359, 777);
        createLabel(layer, 'Title', '选择入山修士', 0, 370, 220, 32, 20, COLORS.text);
        createLabel(layer, 'Hint', '已拥有修士 · 最多上阵 4 名', 0, 342, 260, 24, 12, COLORS.textSecondary);

        const viewport = createScrollViewport(layer, 'HeroList', 0, 7, 331, 620);
        const profile = app.state.require();
        const contentHeight = Math.max(620, profile.roster.length * 116 + 8);
        viewport.content.getComponent(UITransform)?.setContentSize(331, contentHeight);
        profile.roster.forEach((hero, index) =>
            this.createHeroSelectionRow(viewport.content, hero, index),
        );

        createButton(layer, {
            name: 'DoneButton',
            text: `完成  ${membersOf(currentPreset(profile.expeditionPreparation).slots).length}/4`,
            x: 0,
            y: -354,
            width: 319,
            height: 50,
            primary: true,
            onClick: () => {
                layer.active = false;
                this.renderPreparation();
            },
        });
    }

    private createHeroSelectionRow(
        parent: Node,
        hero: HeroInstance,
        index: number,
    ): void {
        const profile = AppRoot.instance.state.require();
        const state = profile.expeditionPreparation;
        const preset = currentPreset(state);
        const selectedIndex = preset.slots.indexOf(hero.instanceId);
        const otherParty = state.partyPresets.some(
            (candidate) =>
                candidate.presetId !== preset.presetId &&
                candidate.slots.includes(hero.instanceId),
        );
        const selected = selectedIndex >= 0;
        const y = -58 - index * 116;
        const row = createRect(
            parent,
            `Hero_${hero.instanceId}`,
            0,
            y,
            319,
            106,
            selected ? COLORS.rowSelected : COLORS.row,
            selected ? COLORS.border : COLORS.borderSoft,
        );
        const avatar = createRect(
            row,
            'Avatar',
            -127,
            7,
            50,
            50,
            CAREER_CARD_COLORS[hero.careerId] ?? COLORS.panelAlt,
            COLORS.borderSoft,
        );
        const mask = avatar.addComponent(Mask);
        mask.type = Mask.Type.RECT;
        const portraitFrame = this.portraitFrames.get(hero.nameKey) ?? null;
        if (portraitFrame) {
            createSpriteNode(avatar, 'Portrait', portraitFrame, 0, -44, 50, 130);
        } else {
            createSilhouette(avatar, 0, -7, false, 0.43);
        }
        if (this.avatarFrame) {
            createSpriteNode(avatar, 'AvatarFrame', this.avatarFrame, 0, 0, 50, 50);
        }
        createLabel(
            row,
            'Realm',
            localized(`realm.${realmOf(hero.level)}`),
            -127,
            -42,
            67,
            18,
            10,
            COLORS.text,
        );

        const rating = Object.values(hero.attributes).reduce((sum, value) => sum + value, 0);
        const info = [
            `${heroName(hero)} · ${localized(`career.${hero.careerId}`)}`,
            `等级 ${hero.level}    灵息 ${hero.stamina}`,
            `战力 ${rating}`,
        ].join('\n');
        const infoLabel = createLabel(
            row,
            'Info',
            info,
            -30,
            4,
            142,
            78,
            12,
            COLORS.text,
            HorizontalTextAlignment.LEFT,
        );
        infoLabel.lineHeight = 24;

        const enabled = !hero.isDead && !otherParty;
        const text = hero.isDead
            ? '已阵亡'
            : otherParty
              ? '其他队伍'
              : selected
                ? `取消 ${selectedIndex + 1}`
                : '选择';
        const button = createButton(row, {
            name: 'SelectButton',
            text,
            x: 123,
            y: 0,
            width: 70,
            height: 48,
            enabled,
            primary: selected,
            onClick: () => this.toggleHero(hero),
        });
        button.label.fontSize = 11;
    }

    private toggleHero(hero: HeroInstance): void {
        const profile = AppRoot.instance.state.require();
        const state = profile.expeditionPreparation;
        const presetIndex = state.partyPresets.findIndex(
            (candidate) => candidate.presetId === state.activePresetId,
        );
        const preset = state.partyPresets[presetIndex];
        if (!preset) {
            return;
        }
        const existing = preset.slots.indexOf(hero.instanceId);
        let slots: PartySlots;
        if (existing >= 0) {
            slots = clearSlot(preset.slots, existing);
        } else {
            const empty = preset.slots.indexOf(null);
            if (empty < 0) {
                AppRoot.instance.showFeedback('队伍已满，请先取消一名修士');
                return;
            }
            const otherPartyMembers = state.partyPresets
                .filter((candidate) => candidate.presetId !== preset.presetId)
                .flatMap((candidate) => membersOf(candidate.slots));
            const assigned = assignToSlot({
                slots: preset.slots,
                slotIndex: empty,
                heroId: hero.instanceId,
                heroes: profile.roster,
                otherPartyMembers,
            });
            if (!assigned.ok) {
                AppRoot.instance.showFeedback(partyRejectionText(assigned.reason));
                return;
            }
            slots = assigned.slots;
        }
        state.partyPresets[presetIndex] = { ...preset, slots };
        this.queueSave('编辑队伍');
        this.openHeroSelection();
    }

    private openMapSelection(): void {
        const layer = this.mapLayer;
        const config = this.config;
        if (!layer || !config) {
            return;
        }
        clearChildren(layer);
        layer.active = true;
        createRect(layer, 'Backdrop', 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT, COLORS.backdrop);
        this.createPanelBackground(layer, 'Panel', 0, 0, 359, 777);
        createLabel(layer, 'Title', '选择禁地区域', 0, 370, 220, 32, 20, COLORS.text);
        createLabel(layer, 'Hint', '点击地图项目即发起传送', 0, 342, 260, 24, 12, COLORS.textSecondary);

        const viewport = createScrollViewport(layer, 'MapList', 0, 12, 331, 612);
        const contentHeight = Math.max(612, config.maps.length * 101 + 8);
        viewport.content.getComponent(UITransform)?.setContentSize(331, contentHeight);
        config.maps.forEach((map, index) =>
            this.createMapRow(viewport.content, map, index),
        );
        createButton(layer, {
            name: 'BackButton',
            text: '返回',
            x: 0,
            y: -354,
            width: 210,
            height: 50,
            onClick: () => {
                layer.active = false;
            },
        });
    }

    private createMapRow(
        parent: Node,
        map: ExpeditionMapOption,
        index: number,
    ): void {
        const profile = AppRoot.instance.state.require();
        const unlocked = map.unlockFlag === null || profile.storyFlags[map.unlockFlag] === true;
        const y = -49 - index * 101;
        const button = createButton(parent, {
            name: `Map_${map.mapId}`,
            text: unlocked
                ? `${map.mapNumber}. ${localized(map.nameKey)}\n灵息 ${map.staminaCost} · 灵粮/步 ${map.grainPerStep} · 最低携带 ${map.minimumCarriedGrain}`
                : `${map.mapNumber}. ${localized(map.nameKey)}  ·  尚未解锁`,
            x: 0,
            y,
            width: 319,
            height: 91,
            enabled: unlocked,
            onClick: () => this.selectMap(map),
        });
        button.label.fontSize = 13;
        button.label.lineHeight = 23;
        if (!unlocked && this.lockFrame) {
            createSpriteNode(button.node, 'LockIcon', this.lockFrame, -138, 0, 14, 14);
        }
    }

    private async loadVisualAssets(): Promise<void> {
        if (this.visualLoadStarted) {
            return;
        }
        this.visualLoadStarted = true;

        const portraitEntries = Object.entries(EXPEDITION_VISUAL_PATHS.portraits);
        const itemEntries = Object.entries(EXPEDITION_VISUAL_PATHS.items) as [
            ExpeditionItemId,
            string,
        ][];
        const [panelFrame, cardFrame, emptyHeroFrame, avatarFrame, lockFrame, portraits, items] =
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

        if (!this.node.isValid) {
            return;
        }
        this.panelFrame = panelFrame;
        this.heroCardFrame = cardFrame;
        this.emptyHeroFrame = emptyHeroFrame;
        this.avatarFrame = avatarFrame;
        this.lockFrame = lockFrame;
        for (const [nameKey, frame] of portraits) {
            if (frame) {
                this.portraitFrames.set(nameKey, frame);
            }
        }
        for (const [itemId, frame] of items) {
            if (frame) {
                this.itemFrames.set(itemId, frame);
            }
        }

        if (this.node.active) {
            this.renderPreparation();
            if (this.selectionLayer?.active) {
                this.openHeroSelection();
            }
            if (this.mapLayer?.active) {
                this.openMapSelection();
            }
        }
    }

    private selectMap(map: ExpeditionMapOption): void {
        const app = AppRoot.instance;
        const config = this.config;
        if (!app.state.isLoaded || !config) {
            return;
        }
        const profile = app.state.require();
        const preset = currentPreset(profile.expeditionPreparation);
        for (const itemId of EXPEDITION_ITEM_IDS) {
            const carried = profile.expeditionPreparation.loadout[itemId];
            if (carried > availableItemCount(itemId, profile, config)) {
                app.showFeedback(`${localized(config.items[itemId].nameKey)}库存不足`);
                return;
            }
        }
        const readiness = validateExpeditionReadiness({
            slots: preset.slots,
            heroes: heroSnapshots(profile),
            loadout: profile.expeditionPreparation.loadout,
            map,
            config,
        });
        if (!readiness.isReady) {
            app.showFeedback(readiness.problems[0] ?? '当前无法入山', 3);
            return;
        }

        // 地图场景尚未完成，先发出稳定交接事件；不可提前扣灵息/物资后再加载失败。
        app.events.emit('expedition.mapSelected', {
            mapId: map.mapId,
            partyPresetId: preset.presetId,
            staminaCost: map.staminaCost,
            loadout: { ...profile.expeditionPreparation.loadout },
        });
        app.showFeedback(`${localized(map.nameKey)}已选定；地图场景尚未接入`, 3);
    }

    private settleStamina(): void {
        const app = AppRoot.instance;
        const config = this.config;
        if (!app.state.isLoaded || !config) {
            return;
        }
        const profile = app.state.require();
        const state = profile.expeditionPreparation;
        const result = settleNaturalStamina({
            heroes: profile.roster,
            lastSettledAtUtc: state.lastStaminaSettledAtUtc,
            nowUtcSeconds: app.time.nowUtcSeconds(),
            isInExpedition: profile.expedition !== null,
            config,
        });
        if (!result.changed) {
            return;
        }
        for (const hero of profile.roster) {
            hero.stamina = result.staminaByHero[hero.instanceId] ?? hero.stamina;
        }
        state.lastStaminaSettledAtUtc = result.nextSettledAtUtc;
        this.queueSave('灵息自然恢复');
        if (result.recovered > 0) {
            app.events.emit('heroes.staminaChanged', { recovered: result.recovered });
        }
    }

    private readonly tickStamina = (): void => {
        if (!this.node.active) {
            return;
        }
        const before = AppRoot.instance.state.isLoaded
            ? AppRoot.instance.state.require().roster.reduce((sum, hero) => sum + hero.stamina, 0)
            : 0;
        this.settleStamina();
        const after = AppRoot.instance.state.isLoaded
            ? AppRoot.instance.state.require().roster.reduce((sum, hero) => sum + hero.stamina, 0)
            : before;
        if (after !== before) {
            this.renderPreparation();
            if (this.selectionLayer?.active) {
                this.openHeroSelection();
            }
        }
    };

    private queueSave(reason: string): void {
        const app = AppRoot.instance;
        this.saveQueue = this.saveQueue
            .then(() => app.saveCurrentProfile())
            .catch((error: unknown) => {
                console.error(`[入山整备] ${reason}保存失败`, error);
                app.showFeedback('入山整备保存失败');
            });
    }

    private readonly onKeyDown = (event: EventKeyboard): void => {
        if (!this.node.active || event.keyCode !== KeyCode.ESCAPE) {
            return;
        }
        if (this.mapLayer?.active) {
            this.mapLayer.active = false;
            return;
        }
        if (this.selectionLayer?.active) {
            this.selectionLayer.active = false;
            this.renderPreparation();
            return;
        }
        this.close();
    };
}

function currentPreset(state: ExpeditionPreparationState): PartyPreset {
    const preset = state.partyPresets.find(
        (candidate) => candidate.presetId === state.activePresetId,
    );
    if (!preset) {
        throw new Error(`当前队伍 ${state.activePresetId} 不存在`);
    }
    return preset;
}

function heroSnapshots(profile: Profile): readonly ExpeditionHeroSnapshot[] {
    return profile.roster.map((hero) => ({
        instanceId: hero.instanceId,
        isDead: hero.isDead,
        stamina: hero.stamina,
        attributes: hero.attributes,
    }));
}

function availableItemCount(
    itemId: ExpeditionItemId,
    profile: Profile,
    config: ExpeditionPreparationConfig,
): number {
    if (itemId === 'spiritGrain') {
        return profile.wallet.spiritGrain;
    }
    const inventoryId = config.items[itemId].inventoryId;
    return inventoryId ? profile.inventory[inventoryId] ?? 0 : 0;
}

function heroName(hero: HeroInstance): string {
    return localized(hero.nameKey);
}

function localized(key: string): string {
    return FALLBACK_TEXT[key] ?? key;
}

function partyRejectionText(reason: string): string {
    const messages: Readonly<Record<string, string>> = {
        hero_dead: '阵亡修士不能上阵',
        duplicate_in_party: '该修士已在当前队伍',
        in_another_party: '该修士已在另一支队伍',
        invalid_slot: '队伍槽位无效',
        hero_not_found: '修士不存在',
    };
    return messages[reason] ?? '无法选择该修士';
}

function createLayer(parent: Node, name: string): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(LOGICAL_WIDTH, LOGICAL_HEIGHT);
    transform.setAnchorPoint(0.5, 0.5);
    return node;
}

function createRect(
    parent: Node,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fill: Color,
    stroke?: Color,
): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);
    transform.setAnchorPoint(0.5, 0.5);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = fill.clone();
    graphics.roundRect(-width / 2, -height / 2, width, height, 5);
    graphics.fill();
    if (stroke) {
        graphics.strokeColor = stroke.clone();
        graphics.lineWidth = 1;
        graphics.roundRect(-width / 2 + 0.5, -height / 2 + 0.5, width - 1, height - 1, 5);
        graphics.stroke();
    }
    return node;
}

function createLabel(
    parent: Node,
    name: string,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
    fontSize: number,
    color: Color,
    horizontalAlign: HorizontalTextAlignment = HorizontalTextAlignment.CENTER,
): Label {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    const transform = node.addComponent(UITransform);
    transform.setContentSize(width, height);
    transform.setAnchorPoint(0.5, 0.5);
    const label = node.addComponent(Label);
    label.string = text;
    label.fontSize = fontSize;
    label.lineHeight = Math.ceil(fontSize * 1.25);
    label.color = color.clone();
    label.horizontalAlign = horizontalAlign;
    label.verticalAlign = Label.VerticalAlign.CENTER;
    label.overflow = Label.Overflow.SHRINK;
    return label;
}

function createButton(parent: Node, options: {
    readonly name: string;
    readonly text: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly enabled?: boolean;
    readonly primary?: boolean;
    readonly onClick: () => void;
}): CreatedButton {
    const enabled = options.enabled ?? true;
    const node = createRect(
        parent,
        options.name,
        options.x,
        options.y,
        options.width,
        options.height,
        enabled
            ? options.primary
                ? COLORS.buttonPrimary
                : COLORS.button
            : COLORS.disabled,
        enabled ? COLORS.border : COLORS.borderSoft,
    );
    const button = node.addComponent(Button);
    button.interactable = enabled;
    const label = createLabel(
        node,
        'Label',
        options.text,
        0,
        0,
        options.width - 8,
        options.height - 6,
        14,
        enabled ? COLORS.text : COLORS.textSecondary,
    );
    if (enabled) {
        node.on(Button.EventType.CLICK, options.onClick);
    }
    return { node, button, label };
}

function createSpriteNode(
    parent: Node,
    name: string,
    frame: SpriteFrame,
    x: number,
    y: number,
    width: number,
    height: number,
): Sprite {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    const transform = node.addComponent(UITransform);
    const sprite = node.addComponent(Sprite);
    sprite.spriteFrame = frame;
    sprite.type = Sprite.Type.SIMPLE;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    // 赋 SpriteFrame 时 Cocos 会先按源图像素尺寸刷新 UITransform。
    // @3x PNG 必须在其后重新写入 375×817 基准下的逻辑显示尺寸。
    transform.setContentSize(width, height);
    transform.setAnchorPoint(0.5, 0.5);
    return sprite;
}

function createSlicedSpriteNode(
    parent: Node,
    name: string,
    frame: SpriteFrame,
    x: number,
    y: number,
    width: number,
    height: number,
    inset: number,
): Node {
    const node = new Node(name);
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    const transform = node.addComponent(UITransform);
    const sprite = node.addComponent(Sprite);
    frame.insetLeft = inset;
    frame.insetRight = inset;
    frame.insetTop = inset;
    frame.insetBottom = inset;
    sprite.spriteFrame = frame;
    sprite.type = Sprite.Type.SLICED;
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    // 九宫格赋值同样会写入源图尺寸，逻辑面板尺寸必须最后设置。
    transform.setContentSize(width, height);
    transform.setAnchorPoint(0.5, 0.5);
    return node;
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

function createSilhouette(
    parent: Node,
    x: number,
    y: number,
    undecided: boolean,
    scale = 1,
): void {
    const node = new Node('PortraitSilhouette');
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    node.setScale(scale, scale, 1);
    node.addComponent(UITransform).setContentSize(64, 112);
    const graphics = node.addComponent(Graphics);
    graphics.fillColor = COLORS.silhouette.clone();
    graphics.circle(0, 31, undecided ? 17 : 19);
    graphics.fill();
    graphics.roundRect(-29, -49, 58, 68, 20);
    graphics.fill();
}

function createItemGlyph(parent: Node, itemId: ExpeditionItemId, x: number, y: number): void {
    const node = new Node('ItemGlyph');
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(x, y, 0);
    node.addComponent(UITransform).setContentSize(38, 38);
    const graphics = node.addComponent(Graphics);
    graphics.strokeColor = COLORS.border.clone();
    graphics.fillColor = new Color(25, 31, 29, 255);
    graphics.lineWidth = 2;
    graphics.circle(0, 0, 17);
    graphics.fill();
    graphics.stroke();
    graphics.strokeColor = COLORS.text.clone();
    if (itemId === 'spiritGrain') {
        graphics.moveTo(-7, -10);
        graphics.lineTo(7, 11);
        graphics.moveTo(-1, -2);
        graphics.lineTo(-10, 3);
        graphics.moveTo(3, 4);
        graphics.lineTo(11, 7);
    } else if (itemId === 'pickaxe') {
        graphics.moveTo(-9, 10);
        graphics.lineTo(10, -10);
        graphics.moveTo(-12, 7);
        graphics.lineTo(4, 13);
    } else {
        graphics.circle(0, 2, 9);
        graphics.moveTo(6, -5);
        graphics.lineTo(12, -13);
    }
    graphics.stroke();
}

function createScrollViewport(
    parent: Node,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
): { readonly viewport: Node; readonly content: Node } {
    const viewport = createRect(parent, name, x, y, width, height, new Color(10, 14, 14, 160));
    const mask = viewport.addComponent(Mask);
    mask.type = Mask.Type.RECT;
    const content = new Node('Content');
    content.layer = viewport.layer;
    viewport.addChild(content);
    const contentTransform = content.addComponent(UITransform);
    contentTransform.setContentSize(width, height);
    contentTransform.setAnchorPoint(0.5, 1);
    content.setPosition(0, height / 2, 0);
    const scrollView = viewport.addComponent(ScrollView);
    scrollView.content = content;
    scrollView.horizontal = false;
    scrollView.vertical = true;
    scrollView.inertia = true;
    scrollView.elastic = true;
    return { viewport, content };
}

function clearChildren(node: Node): void {
    for (const child of [...node.children]) {
        child.destroy();
    }
}
