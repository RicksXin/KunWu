/**
 * 场景构建原语。
 *
 * 从 gen-boot-scene.mjs 抽出，供多个场景生成脚本复用。
 *
 * 核心问题：场景文件用 __id__ 数组下标互相引用，手写时增删任何条目
 * 都要重排全部引用。这里用 add() 返回下标、结束时统一校验的方式规避。
 */

import { randomUUID } from 'node:crypto';
import { compressUuid } from './uuid-compress.mjs';

/** UI 节点层。33554432 = Layers.Enum.UI_2D。 */
export const LAYER_UI_2D = 33554432;
/** 相机节点层。1073741824 = Layers.Enum.DEFAULT。 */
export const LAYER_DEFAULT = 1073741824;

/** 设计画布，与 domain/ViewportLayout.ts 保持一致。 */
export const DESIGN_WIDTH = 1080;
export const DESIGN_HEIGHT = 1920;

/**
 * Widget 对齐位标志。
 *
 * 这些值经运行时实测反推确认（用 isAlignBottom 等 setter 回读 alignFlags），
 * 不是猜的——曾把 BOTTOM 写成 2，实际 2 是 MID_VERTICAL，
 * 症状是节点停在画布中心而非底部，且不报错。
 */
export const ALIGN_TOP = 1;
export const ALIGN_MID_VERTICAL = 2;
export const ALIGN_BOTTOM = 4;
export const ALIGN_LEFT = 8;
export const ALIGN_CENTER_HORIZONTAL = 16;
export const ALIGN_RIGHT = 32;
/** 四向全对齐 = TOP|BOTTOM|LEFT|RIGHT = 1+4+8+32。 */
export const ALIGN_ALL = ALIGN_TOP | ALIGN_BOTTOM | ALIGN_LEFT | ALIGN_RIGHT;

export function vec3(x = 0, y = 0, z = 0) {
    return { __type__: 'cc.Vec3', x, y, z };
}

/** 场景内节点 ID。用压缩形式与编辑器产物观感一致。 */
export function localId() {
    return compressUuid(randomUUID());
}

/**
 * 场景构建器。
 * 所有 add* 方法返回条目下标，供其它条目通过 { __id__ } 引用。
 */
export class SceneBuilder {
    constructor(sceneName) {
        this.sceneName = sceneName;
        this.entries = [];

        // 0: SceneAsset 固定为首条，scene 指向下标 1
        this.add({
            __type__: 'cc.SceneAsset',
            _name: sceneName,
            _objFlags: 0,
            _native: '',
            scene: { __id__: 1 },
        });

        // 1: Scene。_children 与 _globals 在 finish() 回填
        this.sceneIdx = this.add({
            __type__: 'cc.Scene',
            _name: sceneName,
            _objFlags: 0,
            _parent: null,
            _children: [],
            _active: true,
            _components: [],
            _prefab: null,
            autoReleaseAssets: false,
            _globals: { __id__: -1 },
            _id: randomUUID(),
        });

        this.rootChildren = [];
    }

    add(entry) {
        return this.entries.push(entry) - 1;
    }

    /** 创建节点。父为 null 时挂到场景根层级。 */
    addNode({ name, parent = null, layer = LAYER_UI_2D, pos = vec3() }) {
        const parentIdx = parent === null ? this.sceneIdx : parent;
        const idx = this.add({
            __type__: 'cc.Node',
            _name: name,
            _objFlags: 0,
            _parent: { __id__: parentIdx },
            _children: [],
            _active: true,
            _components: [],
            _prefab: null,
            _lpos: pos,
            _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
            _lscale: vec3(1, 1, 1),
            _layer: layer,
            _euler: vec3(),
            _id: localId(),
        });

        if (parent === null) {
            this.rootChildren.push(idx);
        } else {
            this.entries[parent]._children.push({ __id__: idx });
        }
        return idx;
    }

    /** 挂组件到节点，自动维护双向引用。 */
    attach(nodeIdx, componentEntry) {
        const compIdx = this.add({ ...componentEntry, node: { __id__: nodeIdx } });
        this.entries[nodeIdx]._components.push({ __id__: compIdx });
        return compIdx;
    }

    addUITransform(nodeIdx, width = DESIGN_WIDTH, height = DESIGN_HEIGHT) {
        return this.attach(nodeIdx, {
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

    addWidget(nodeIdx, alignFlags = ALIGN_ALL, insets = {}) {
        return this.attach(nodeIdx, {
            __type__: 'cc.Widget',
            _name: '',
            _objFlags: 0,
            _enabled: true,
            __prefab: null,
            _alignFlags: alignFlags,
            _target: null,
            _left: insets.left ?? 0,
            _right: insets.right ?? 0,
            _top: insets.top ?? 0,
            _bottom: insets.bottom ?? 0,
            _horizontalCenter: 0,
            _verticalCenter: 0,
            _isAbsLeft: true,
            _isAbsRight: true,
            _isAbsTop: true,
            _isAbsBottom: true,
            _isAbsHorizontalCenter: true,
            _isAbsVerticalCenter: true,
            _originalWidth: 0,
            _originalHeight: 0,
            // ALWAYS：视口变化时持续跟随（地址栏伸缩需要）
            _alignMode: 2,
            _lockFlags: 0,
            _id: localId(),
        });
    }

    /**
     * 创建 Canvas 与其相机。返回 { canvasIdx, cameraNodeIdx }。
     * 相机组件必须挂到相机节点上——只让 Canvas 的 _cameraComponent 指过去
     * 不够，节点 _components 为空时组件不会实例化。
     */
    addCanvas() {
        const canvasIdx = this.addNode({
            name: 'Canvas',
            pos: vec3(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, 0),
        });
        const cameraNodeIdx = this.addNode({
            name: 'Camera',
            parent: canvasIdx,
            layer: LAYER_DEFAULT,
        });

        const cameraCompIdx = this.attach(cameraNodeIdx, {
            __type__: 'cc.Camera',
            _name: '',
            _objFlags: 0,
            _enabled: true,
            __prefab: null,
            // 0 = 正交。2D 像素游戏必须正交，透视会让像素变形
            _projection: 0,
            _priority: 0,
            _fov: 45,
            _fovAxis: 0,
            _orthoHeight: DESIGN_HEIGHT / 2,
            _near: 0,
            _far: 2000,
            _color: { __type__: 'cc.Color', r: 13, g: 11, b: 15, a: 255 },
            _depth: 1,
            _stencil: 0,
            _clearFlags: 7,
            _rect: { __type__: 'cc.Rect', x: 0, y: 0, width: 1, height: 1 },
            _aperture: 19,
            _shutter: 7,
            _iso: 0,
            _screenScale: 1,
            _visibility: 1108344832,
            _targetTexture: null,
            _id: localId(),
        });

        this.addUITransform(canvasIdx);
        this.attach(canvasIdx, {
            __type__: 'cc.Canvas',
            _name: '',
            _objFlags: 0,
            _enabled: true,
            __prefab: null,
            _cameraComponent: { __id__: cameraCompIdx },
            _alignCanvasWithScreen: true,
            _id: localId(),
        });
        this.addWidget(canvasIdx);

        return { canvasIdx, cameraNodeIdx };
    }

    /** 挂自定义脚本组件。scriptUuid 为完整 UUID，内部转压缩形式。 */
    addScript(nodeIdx, scriptUuid, extraProps = {}) {
        return this.attach(nodeIdx, {
            __type__: compressUuid(scriptUuid),
            _name: '',
            _objFlags: 0,
            _enabled: true,
            __prefab: null,
            ...extraProps,
            _id: localId(),
        });
    }

    /** 补齐 SceneGlobals。2D 项目全部关闭。 */
    addGlobals() {
        const globalsIdx = this.add({ __type__: 'cc.SceneGlobals' });

        const ambient = this.add({
            __type__: 'cc.AmbientInfo',
            _skyColorHDR: { __type__: 'cc.Vec4', x: 0, y: 0, z: 0, w: 0.520833125 },
            _skyColor: { __type__: 'cc.Vec4', x: 0, y: 0, z: 0, w: 0.520833125 },
            _skyIllumHDR: 20000,
            _skyIllum: 20000,
            _groundAlbedoHDR: { __type__: 'cc.Vec4', x: 0, y: 0, z: 0, w: 0 },
            _groundAlbedo: { __type__: 'cc.Vec4', x: 0, y: 0, z: 0, w: 0 },
            _skyColorLDR: { __type__: 'cc.Vec4', x: 0.2, y: 0.5, z: 0.8, w: 1 },
            _skyIllumLDR: 20000,
            _groundAlbedoLDR: { __type__: 'cc.Vec4', x: 0.2, y: 0.2, z: 0.2, w: 1 },
        });
        const shadows = this.add({
            __type__: 'cc.ShadowsInfo',
            _enabled: false,
            _type: 0,
            _normal: vec3(0, 1, 0),
            _distance: 0,
            _shadowColor: { __type__: 'cc.Color', r: 76, g: 76, b: 76, a: 255 },
            _maxReceived: 4,
            _size: { __type__: 'cc.Vec2', x: 512, y: 512 },
        });
        const skybox = this.add({
            __type__: 'cc.SkyboxInfo',
            _envLightingType: 0,
            _envmapHDR: null,
            _envmap: null,
            _envmapLDR: null,
            _diffuseMapHDR: null,
            _diffuseMapLDR: null,
            _enabled: false,
            _useHDR: true,
        });
        const fog = this.add({
            __type__: 'cc.FogInfo',
            _type: 0,
            _fogColor: { __type__: 'cc.Color', r: 200, g: 200, b: 200, a: 255 },
            _enabled: false,
            _fogDensity: 0.3,
            _fogStart: 0.5,
            _fogEnd: 300,
            _fogAtten: 5,
            _fogTop: 1.5,
            _fogRange: 1.2,
            _accurate: false,
        });
        const octree = this.add({
            __type__: 'cc.OctreeInfo',
            _enabled: false,
            _minPos: vec3(-1024, -1024, -1024),
            _maxPos: vec3(1024, 1024, 1024),
            _depth: 8,
        });
        const skin = this.add({ __type__: 'cc.SkinInfo', _enabled: false, _scale: 5 });

        Object.assign(this.entries[globalsIdx], {
            ambient: { __id__: ambient },
            shadows: { __id__: shadows },
            _skybox: { __id__: skybox },
            fog: { __id__: fog },
            octree: { __id__: octree },
            skin: { __id__: skin },
        });

        this.entries[this.sceneIdx]._globals = { __id__: globalsIdx };
        return globalsIdx;
    }

    /** 回填场景根子节点并返回条目数组。 */
    finish() {
        this.entries[this.sceneIdx]._children = this.rootChildren.map((idx) => ({ __id__: idx }));
        return this.entries;
    }
}

/**
 * 校验场景结构。
 *
 * 除 __id__ 越界，还检查组件与节点、父与子的**双向**引用是否配对——
 * 少了反向那半边，组件不会实例化但场景仍能打开，是最难发现的一类错误。
 */
export function validateScene(entries) {
    const problems = [];

    const visit = (value, trail) => {
        if (Array.isArray(value)) {
            value.forEach((item, i) => visit(item, `${trail}[${i}]`));
            return;
        }
        if (value === null || typeof value !== 'object') {
            return;
        }
        for (const [key, child] of Object.entries(value)) {
            if (key === '__id__') {
                if (!Number.isInteger(child) || child < 0 || child >= entries.length) {
                    problems.push(`${trail}.__id__ 越界: ${child}`);
                }
                continue;
            }
            visit(child, `${trail}.${key}`);
        }
    };
    entries.forEach((entry, i) => visit(entry, `[${i}]`));

    entries.forEach((entry, compIdx) => {
        const nodeRef = entry?.node?.__id__;
        if (typeof nodeRef !== 'number') {
            return;
        }
        const node = entries[nodeRef];
        if (!node || node.__type__ !== 'cc.Node') {
            problems.push(`[${compIdx}] 的 node 未指向 cc.Node`);
            return;
        }
        if (!(node._components ?? []).some((ref) => ref.__id__ === compIdx)) {
            problems.push(
                `[${compIdx}] ${entry.__type__} 声称属于节点 ${node._name}，` +
                    `但该节点 _components 未包含它（组件不会实例化）`,
            );
        }
    });

    entries.forEach((entry, nodeIdx) => {
        if (entry?.__type__ !== 'cc.Node') {
            return;
        }
        for (const ref of entry._components ?? []) {
            if (entries[ref.__id__]?.node?.__id__ !== nodeIdx) {
                problems.push(`节点 ${entry._name} 的组件 [${ref.__id__}] 的 node 未指回该节点`);
            }
        }
        for (const child of entry._children ?? []) {
            if (entries[child.__id__]?._parent?.__id__ !== nodeIdx) {
                problems.push(
                    `节点 ${entry._name} 的子节点 [${child.__id__}] 的 _parent 未指回该节点`,
                );
            }
        }
    });

    return problems;
}

/** 场景资源的 .meta 内容。 */
export function sceneMeta(uuid = randomUUID()) {
    return {
        ver: '1.1.50',
        importer: 'scene',
        imported: true,
        uuid,
        files: ['.json'],
        subMetas: {},
        userData: {},
    };
}
