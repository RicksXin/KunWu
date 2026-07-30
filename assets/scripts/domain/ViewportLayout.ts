/**
 * 竖屏适配、安全区与像素整数缩放（PRD-09 §2、任务 P0-UX-001）。
 *
 * 纯计算、无引擎依赖，因此可单测；表现层拿结果去设置 Canvas 与节点。
 *
 * 为何强调整数缩放：像素图按非整数倍放大会出现行列宽度不均（抖动/摩尔纹），
 * 这是 Pixel Art 最显眼的瑕疵。CLAUDE.md 规定内部参考 360×640，
 * 设计画布 1080×1920 恰好是 3 倍；其它分辨率取不超过实际比例的最大整数倍，
 * 余量用留边而非拉伸消化。
 */

/** 设计画布（CLAUDE.md、PRD-09 §2）。 */
export const DESIGN_WIDTH = 1080;
export const DESIGN_HEIGHT = 1920;

/** 像素内部参考画布。设计画布是它的整数 3 倍。 */
export const PIXEL_REFERENCE_WIDTH = 360;
export const PIXEL_REFERENCE_HEIGHT = 640;

/** 世界 Tile 源像素与屏幕像素（CLAUDE.md）。 */
export const TILE_SOURCE_PIXELS = 16;
export const TILE_SCREEN_PIXELS = 48;

/** 支持的分辨率下界（PRD-09 §2）。 */
export const MIN_SUPPORTED_WIDTH = 720;
export const MIN_SUPPORTED_HEIGHT = 1280;

/** 最小触控区域 48×48dp（PRD-09 §4）。 */
export const MIN_TOUCH_TARGET_DP = 48;

/** 竖屏宽高比。低于此值（更宽）时按高度适配，避免左右被裁。 */
export const DESIGN_ASPECT = DESIGN_WIDTH / DESIGN_HEIGHT;

/**
 * 浏览器安全区内边距，单位为设计画布像素。
 * iOS 刘海与底部横条、Android 手势区都通过这里表达（PRD-09 §2）。
 */
export interface SafeAreaInsets {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
}

export const ZERO_INSETS: SafeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 };

/** Cocos 的适配策略选择结果。 */
export type FitMode = 'fitWidth' | 'fitHeight';

export interface ViewportSolution {
    /** 实际视口尺寸，单位物理像素。 */
    readonly viewportWidth: number;
    readonly viewportHeight: number;
    /**
     * 应采用的适配方向。
     * 屏幕比设计画布更「瘦」（宽高比更小）时按宽度适配，否则按高度适配——
     * 两种情况都保证设计画布内容完整可见，不出现裁切。
     */
    readonly fitMode: FitMode;
    /** 设计画布到视口的缩放系数，可为非整数。 */
    readonly designScale: number;
    /**
     * 像素图应采用的整数放大倍数（相对 16×16 源像素）。
     * 至少为 1：极小视口下宁可内容溢出也不做小于 1 的缩放。
     */
    readonly pixelScale: number;
    /** 按 pixelScale 计算的单格屏幕边长。 */
    readonly tileScreenSize: number;
    /** 视口低于支持下界，需提示玩家（PRD-09 §2）。 */
    readonly isBelowMinimum: boolean;
}

/**
 * 依据实际视口计算适配方案。
 *
 * 不直接返回 Cocos 的 ResolutionPolicy：领域层不引用引擎类型，
 * 由表现层把 fitMode 映射为 setDesignResolutionSize 的参数。
 */
export function solveViewport(viewportWidth: number, viewportHeight: number): ViewportSolution {
    if (!(viewportWidth > 0) || !(viewportHeight > 0)) {
        throw new Error(`视口尺寸必须为正数，收到 ${viewportWidth}×${viewportHeight}`);
    }

    const aspect = viewportWidth / viewportHeight;
    // 屏幕更瘦长 → 宽度是瓶颈，按宽度适配；更宽扁 → 高度是瓶颈
    const fitMode: FitMode = aspect < DESIGN_ASPECT ? 'fitWidth' : 'fitHeight';

    const designScale =
        fitMode === 'fitWidth' ? viewportWidth / DESIGN_WIDTH : viewportHeight / DESIGN_HEIGHT;

    // 像素图相对内部参考画布的可用倍数，向下取整以保证整数缩放
    const rawPixelScale =
        fitMode === 'fitWidth'
            ? viewportWidth / PIXEL_REFERENCE_WIDTH
            : viewportHeight / PIXEL_REFERENCE_HEIGHT;
    const pixelScale = Math.max(1, Math.floor(rawPixelScale));

    return {
        viewportWidth,
        viewportHeight,
        fitMode,
        designScale,
        pixelScale,
        tileScreenSize: TILE_SOURCE_PIXELS * pixelScale,
        isBelowMinimum: viewportWidth < MIN_SUPPORTED_WIDTH || viewportHeight < MIN_SUPPORTED_HEIGHT,
    };
}

/**
 * 把物理像素的安全区转换为设计画布像素。
 *
 * 浏览器给的是 CSS 像素下的 env(safe-area-inset-*)，
 * 需要除以 designScale 才能用于 UI 节点布局。
 */
export function toDesignInsets(
    physicalInsets: SafeAreaInsets,
    solution: ViewportSolution,
): SafeAreaInsets {
    const scale = solution.designScale;
    if (!(scale > 0)) {
        throw new Error(`designScale 必须为正数，收到 ${scale}`);
    }
    return {
        top: physicalInsets.top / scale,
        bottom: physicalInsets.bottom / scale,
        left: physicalInsets.left / scale,
        right: physicalInsets.right / scale,
    };
}

export interface ContentRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

/**
 * 扣除安全区后的可用内容区，单位设计画布像素，原点在左下。
 *
 * 常驻 HUD（坐标、灵粮、负重——PRD-09 §6）必须排在此矩形内，
 * 否则在有刘海的设备上会被系统 UI 遮挡。
 */
export function contentRect(insets: SafeAreaInsets): ContentRect {
    const width = DESIGN_WIDTH - insets.left - insets.right;
    const height = DESIGN_HEIGHT - insets.top - insets.bottom;
    if (width <= 0 || height <= 0) {
        throw new Error(`安全区内边距过大，剩余内容区为 ${width}×${height}`);
    }
    return { x: insets.left, y: insets.bottom, width, height };
}

/**
 * 判断触控目标是否满足 48×48dp（PRD-09 §4）。
 * 传入设计画布下的尺寸；dp 与设计像素在本作按 1:1 处理。
 */
export function meetsTouchTarget(widthDp: number, heightDp: number): boolean {
    return widthDp >= MIN_TOUCH_TARGET_DP && heightDp >= MIN_TOUCH_TARGET_DP;
}

/** 格子坐标 → 屏幕像素偏移（技术方案 §9.1：换算只在表现层做）。 */
export function gridToPixelOffset(
    gridX: number,
    gridY: number,
    tileScreenSize: number = TILE_SCREEN_PIXELS,
): { readonly x: number; readonly y: number } {
    if (!Number.isInteger(gridX) || !Number.isInteger(gridY)) {
        throw new Error(`格子坐标必须为整数，收到 (${gridX}, ${gridY})`);
    }
    return { x: gridX * tileScreenSize, y: gridY * tileScreenSize };
}
