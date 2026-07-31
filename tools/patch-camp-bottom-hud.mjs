/**
 * 在不重排现有 Camp.scene __id__ 的前提下接入任务 1.2.6。
 *
 * Camp.scene 曾在编辑器中调整过建筑布局，不能用生成器整体覆盖；
 * 本补丁只复用两个底部 Placeholder 并把新增条目追加到数组末尾。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { localId, vec3 } from './scene-builder.mjs';
import { compressUuid } from './uuid-compress.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..');
const scenePath = path.join(repoRoot, 'assets/bundles/camp/Camp.scene');
const presenterMetaPath = path.join(
    repoRoot,
    'assets/scripts/presentation/CampPresenter.ts.meta',
);
const scene = JSON.parse(readFileSync(scenePath, 'utf8'));
const presenterUuid = JSON.parse(readFileSync(presenterMetaPath, 'utf8')).uuid;

const findNode = (name) =>
    scene.findIndex((entry) => entry.__type__ === 'cc.Node' && entry._name === name);
const clone = (value) => JSON.parse(JSON.stringify(value));
const componentFor = (nodeIdx, type) =>
    (scene[nodeIdx]._components ?? [])
        .map((ref) => scene[ref.__id__])
        .find((entry) => entry?.__type__ === type);

if (findNode('SettingsPanel') >= 0) {
    // 第一版补丁复用了原 Placeholder，Label 组件排在后加的 Sprite 前，
    // Sprite 会覆盖文字。把 Label 移到组件列表末尾即可保持文字在最上层。
    const settingsButtonIdx = findNode('SettingsButton');
    const refs = scene[settingsButtonIdx]?._components ?? [];
    const labelPosition = refs.findIndex(
        (ref) => scene[ref.__id__]?.__type__ === 'cc.Label',
    );
    if (labelPosition >= 0) {
        const [labelRef] = refs.splice(labelPosition, 1);
        refs.push(labelRef);
        writeFileSync(scenePath, `${JSON.stringify(scene, null, 2)}\n`, 'utf8');
    }
    console.log('Camp.scene 已包含 1.2.6 底部入口，已校正设置文字层级');
    process.exit(0);
}

const bottomLeftIdx = findNode('BottomLeftSlots');
const bottomRightIdx = findNode('BottomRightCurrency');
const safeAreaIdx = findNode('SafeAreaRoot');
const npcListIdx = findNode('NpcListPanel');
const buildingIdx = findNode('yi_shi_dian');
if ([bottomLeftIdx, bottomRightIdx, safeAreaIdx, npcListIdx, buildingIdx].includes(-1)) {
    throw new Error('Camp.scene 缺少 1.2.6 补丁所需的基础节点');
}

const baseButton = clone(componentFor(buildingIdx, 'cc.Button'));
const baseButtonSprite = clone(componentFor(buildingIdx, 'cc.Sprite'));
const basePanelSprite = clone(componentFor(npcListIdx, 'cc.Sprite'));
const baseBlockInput = clone(componentFor(npcListIdx, 'cc.BlockInputEvents'));
const baseWidget = clone(componentFor(npcListIdx, 'cc.Widget'));

function attach(nodeIdx, component) {
    const idx = scene.push({ ...clone(component), node: { __id__: nodeIdx } }) - 1;
    scene[nodeIdx]._components.push({ __id__: idx });
    return idx;
}

function addNode(name, parentIdx, x = 0, y = 0) {
    const idx =
        scene.push({
            __type__: 'cc.Node',
            _name: name,
            _objFlags: 0,
            _parent: { __id__: parentIdx },
            _children: [],
            _active: true,
            _components: [],
            _prefab: null,
            _lpos: vec3(x, y, 0),
            _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
            _lscale: vec3(1, 1, 1),
            _layer: 33554432,
            _euler: vec3(),
            _id: localId(),
        }) - 1;
    scene[parentIdx]._children.push({ __id__: idx });
    return idx;
}

function addTransform(nodeIdx, width, height) {
    return attach(nodeIdx, {
        __type__: 'cc.UITransform',
        _name: '',
        _objFlags: 0,
        _enabled: true,
        __prefab: null,
        _contentSize: { __type__: 'cc.Size', width, height },
        _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
        _id: localId(),
    });
}

function labelTemplate(text, fontSize = 20, color = [232, 227, 220]) {
    const template = clone(scene[219]);
    template._string = text;
    template._fontSize = fontSize;
    template._actualFontSize = fontSize;
    template._lineHeight = Math.round(fontSize * 1.3);
    template._color = {
        __type__: 'cc.Color',
        r: color[0],
        g: color[1],
        b: color[2],
        a: 255,
    };
    return template;
}

function addButton(name, parentIdx, x, label) {
    const nodeIdx = addNode(name, parentIdx, x, 0);
    addTransform(nodeIdx, 112, 96);
    attach(nodeIdx, baseButtonSprite);
    attach(nodeIdx, baseButton);
    attach(nodeIdx, labelTemplate(label));
    return nodeIdx;
}

// 复用左侧 Placeholder 为设置按钮，避免删除条目导致 __id__ 全量重排。
const settingsButtonIdx = scene[bottomLeftIdx]._children[0].__id__;
scene[settingsButtonIdx]._name = 'SettingsButton';
scene[settingsButtonIdx]._lpos = vec3(-260, 0, 0);
componentFor(settingsButtonIdx, 'cc.UITransform')._contentSize = {
    __type__: 'cc.Size',
    width: 112,
    height: 96,
};
componentFor(settingsButtonIdx, 'cc.Label')._string = '设置';
attach(settingsButtonIdx, baseButtonSprite);
attach(settingsButtonIdx, baseButton);

const systemEntryNodes = [
    settingsButtonIdx,
    addButton('AchievementsButton', bottomLeftIdx, -130, '成就'),
    addButton('LeaderboardButton', bottomLeftIdx, 0, '排行'),
    addButton('MailButton', bottomLeftIdx, 130, '邮件'),
    addButton('DailyProgressButton', bottomLeftIdx, 260, '日常'),
];

// 复用右侧 Placeholder 为余额节点，并补一个不可点击的灵石图标。
const immortalCoinValueIdx = scene[bottomRightIdx]._children[0].__id__;
scene[immortalCoinValueIdx]._name = 'ImmortalCoinValue';
scene[immortalCoinValueIdx]._lpos = vec3(45, 0, 0);
componentFor(immortalCoinValueIdx, 'cc.UITransform')._contentSize = {
    __type__: 'cc.Size',
    width: 180,
    height: 48,
};
const immortalCoinLabelIdx = scene[immortalCoinValueIdx]._components
    .map((ref) => ref.__id__)
    .find((idx) => scene[idx]?.__type__ === 'cc.Label');
scene[immortalCoinLabelIdx]._string = '--';
scene[immortalCoinLabelIdx]._color = {
    __type__: 'cc.Color',
    r: 232,
    g: 227,
    b: 220,
    a: 255,
};
const currencyIconIdx = addNode('ImmortalCoinIcon', bottomRightIdx, -90, 0);
addTransform(currencyIconIdx, 64, 64);
attach(currencyIconIdx, labelTemplate('石', 28, [218, 188, 96]));

// 设置页页面壳。
const settingsPanelIdx = addNode('SettingsPanel', safeAreaIdx);
scene[settingsPanelIdx]._active = false;
addTransform(settingsPanelIdx, 1080, 1920);
attach(settingsPanelIdx, baseWidget);
basePanelSprite._color = {
    __type__: 'cc.Color',
    r: 92,
    g: 90,
    b: 94,
    a: 255,
};
attach(settingsPanelIdx, basePanelSprite);
attach(settingsPanelIdx, baseBlockInput);

const titleIdx = addNode('Title', settingsPanelIdx, 0, 700);
addTransform(titleIdx, 600, 72);
attach(titleIdx, labelTemplate('设置', 36));

const hintIdx = addNode('Hint', settingsPanelIdx, 0, 300);
addTransform(hintIdx, 760, 420);
const hintLabel = labelTemplate(
    '音频设置\n画面设置\n语言设置\n存档导入与导出\n\n详细选项将在后续版本开放',
    24,
    [200, 194, 188],
);
hintLabel._enableWrapText = true;
hintLabel._overflow = 2;
attach(hintIdx, hintLabel);

const settingsBackIdx = addNode('SettingsBackButton', settingsPanelIdx, -420, 780);
addTransform(settingsBackIdx, 160, 72);
attach(settingsBackIdx, baseButtonSprite);
attach(settingsBackIdx, baseButton);
const backLabelIdx = addNode('Label', settingsBackIdx);
addTransform(backLabelIdx, 140, 40);
attach(backLabelIdx, labelTemplate('返回', 24));

const presenterType = compressUuid(presenterUuid);
const presenter = scene.find((entry) => entry.__type__ === presenterType);
if (!presenter) {
    throw new Error('Camp.scene 缺少 CampPresenter');
}
presenter.systemEntryNodes = systemEntryNodes.map((idx) => ({ __id__: idx }));
presenter.settingsPanel = { __id__: settingsPanelIdx };
presenter.settingsBackButton = { __id__: settingsBackIdx };
presenter.immortalCoinLabel = { __id__: immortalCoinLabelIdx };

writeFileSync(scenePath, `${JSON.stringify(scene, null, 2)}\n`, 'utf8');
console.log(`已补齐 Camp.scene 1.2.6 底部入口（新增至 ${scene.length} 条目）`);
