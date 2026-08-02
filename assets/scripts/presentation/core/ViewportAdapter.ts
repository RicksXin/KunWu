import { _decorator, Component, Node, screen, view, ResolutionPolicy, sys, UITransform, Widget } from 'cc';
import { solveViewport, toDesignInsets, DESIGN_WIDTH, DESIGN_HEIGHT, ZERO_INSETS } from 'db://assets/scripts/domain/ViewportLayout';
import type { SafeAreaInsets, ViewportSolution } from 'db://assets/scripts/domain/ViewportLayout';

const { ccclass, property } = _decorator;

/** 为运行时创建的页面安装与编辑器场景相同的安全区根节点。 */
export function createViewportSafeAreaRoot(host: Node, name: string): Node {
    const root = new Node(name);
    root.layer = host.layer;
    host.addChild(root);
    root.addComponent(UITransform).setContentSize(DESIGN_WIDTH, DESIGN_HEIGHT);
    const adapter = host.getComponent(ViewportAdapter) ?? host.addComponent(ViewportAdapter);
    adapter.safeAreaRoot = root;
    adapter.apply();
    return root;
}

/**
 * 竖屏适配与安全区落地（PRD-09 §2、任务 P0-UX-001）。
 *
 * 职责边界：只把 ViewportLayout 的计算结果应用到 Cocos 节点，
 * 不含任何适配算法——算法在领域层，可单测。
 *
 * 浏览器地址栏伸缩会改变视口高度，故监听 resize 而非只在 onLoad 算一次。
 */
@ccclass('ViewportAdapter')
export class ViewportAdapter extends Component {
    /** 需要避开安全区的容器。常驻 HUD 挂在这里（PRD-09 §6）。 */
    @property(Node)
    safeAreaRoot: Node | null = null;

    private lastSolution: ViewportSolution | null = null;

    protected override onLoad(): void {
        this.apply();
        // 地址栏显示/隐藏、横竖屏切换都会触发
        view.on('canvas-resize', this.apply, this);
        window.addEventListener?.('orientationchange', this.onOrientationChange);
    }

    protected override onDestroy(): void {
        view.off('canvas-resize', this.apply, this);
        window.removeEventListener?.('orientationchange', this.onOrientationChange);
    }

    private readonly onOrientationChange = (): void => {
        // 部分浏览器在事件触发时尚未更新视口尺寸，下一帧再读
        this.scheduleOnce(() => this.apply(), 0);
    };

    /** 重新计算并应用适配。视口变化时可从外部调用。 */
    apply(): void {
        const size = screen.windowSize;
        const solution = solveViewport(size.width, size.height);

        // fitWidth 保证宽度完整，fitHeight 保证高度完整；两者都不裁切设计画布内容
        view.setDesignResolutionSize(
            DESIGN_WIDTH,
            DESIGN_HEIGHT,
            solution.fitMode === 'fitWidth'
                ? ResolutionPolicy.FIXED_WIDTH
                : ResolutionPolicy.FIXED_HEIGHT,
        );

        this.applySafeArea(solution);
        this.lastSolution = solution;
    }

    /** 最近一次适配结果，供地图等表现层取 tileScreenSize。 */
    get solution(): ViewportSolution | null {
        return this.lastSolution;
    }

    private applySafeArea(solution: ViewportSolution): void {
        const root = this.safeAreaRoot;
        if (!root) {
            return;
        }

        const insets = toDesignInsets(this.readPhysicalInsets(), solution);

        // 用 Widget 而非直接改 position：Widget 会在父节点尺寸变化时自动跟随
        const widget = root.getComponent(Widget) ?? root.addComponent(Widget);
        widget.isAlignTop = true;
        widget.isAlignBottom = true;
        widget.isAlignLeft = true;
        widget.isAlignRight = true;
        widget.top = insets.top;
        widget.bottom = insets.bottom;
        widget.left = insets.left;
        widget.right = insets.right;
        widget.updateAlignment();
    }

    /**
     * 读取浏览器安全区，单位物理像素。
     *
     * Cocos 的 screen.safeAreaEdge 在 Web 上未必可用，
     * 故回退到 CSS env(safe-area-inset-*)；两者都取不到时按 0 处理。
     */
    private readPhysicalInsets(): SafeAreaInsets {
        if (!sys.isBrowser) {
            return ZERO_INSETS;
        }

        const fromCss = readCssSafeAreaInsets();
        if (fromCss) {
            return fromCss;
        }

        return ZERO_INSETS;
    }
}

/**
 * 通过临时元素读取 env(safe-area-inset-*)。
 *
 * 必须实际插入文档才能拿到计算值——env() 在未渲染的元素上解析为 0。
 */
function readCssSafeAreaInsets(): SafeAreaInsets | null {
    if (typeof document === 'undefined') {
        return null;
    }

    const probe = document.createElement('div');
    probe.style.position = 'fixed';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.top = 'env(safe-area-inset-top, 0px)';
    probe.style.bottom = 'env(safe-area-inset-bottom, 0px)';
    probe.style.left = 'env(safe-area-inset-left, 0px)';
    probe.style.right = 'env(safe-area-inset-right, 0px)';

    document.body.appendChild(probe);
    try {
        const computed = getComputedStyle(probe);
        const ratio = window.devicePixelRatio || 1;
        return {
            top: parseFloat(computed.top || '0') * ratio,
            bottom: parseFloat(computed.bottom || '0') * ratio,
            left: parseFloat(computed.left || '0') * ratio,
            right: parseFloat(computed.right || '0') * ratio,
        };
    } finally {
        probe.remove();
    }
}
