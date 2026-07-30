import { _decorator, Component, Label, Node, UIOpacity, tween, Color } from 'cc';
import { AppRoot } from '../AppRoot';

const { ccclass, property } = _decorator;

/**
 * 启动画面（PRD-09 §3「启动和加载」页、任务 P0-TECH-001）。
 *
 * 职责边界：只显示标题与加载进度，不做资源加载决策。
 * 实际加载由 BundleLoader 负责，本组件订阅其事件更新文案。
 *
 * 存在意义不只是好看：在 Bundle 加载、存档读取这段时间里，
 * 没有任何反馈的黑屏会让玩家以为游戏坏了（PRD-10 §8 要求
 * 所有异步操作显示处理中状态）。
 */
@ccclass('BootSplash')
export class BootSplash extends Component {
    @property(Label)
    titleLabel: Label | null = null;

    @property(Label)
    statusLabel: Label | null = null;

    @property(Node)
    root: Node | null = null;

    private disposers: (() => void)[] = [];

    protected override onLoad(): void {
        this.setStatus('正在初始化');

        const app = AppRoot.instance;
        // 订阅 Bundle 加载事件，让玩家看到进度而非空等
        this.disposers.push(
            app.events.on<{ bundle: string }>('bundle.loadStarted', (payload) => {
                this.setStatus(`正在加载 ${payload.bundle}`);
            }),
            app.events.on('bundle.loadFailed', () => {
                this.setStatus('加载失败，请刷新页面');
            }),
        );

        this.playTitleFadeIn();
    }

    protected override onDestroy(): void {
        for (const dispose of this.disposers) {
            dispose();
        }
        this.disposers = [];
    }

    setStatus(text: string): void {
        if (this.statusLabel) {
            this.statusLabel.string = text;
        }
    }

    /**
     * 标题淡入。
     * 用 UIOpacity 而非改 Label.color：改颜色会让 Label 重建渲染数据，
     * 每帧重建在低端机上会掉帧。
     */
    private playTitleFadeIn(): void {
        const target = this.titleLabel?.node;
        if (!target) {
            return;
        }
        const opacity = target.getComponent(UIOpacity) ?? target.addComponent(UIOpacity);
        opacity.opacity = 0;
        tween(opacity).to(0.6, { opacity: 255 }).start();
    }

    /** 加载完成后淡出整个启动层。 */
    fadeOutAndHide(onComplete?: () => void): void {
        const target = this.root ?? this.node;
        const opacity = target.getComponent(UIOpacity) ?? target.addComponent(UIOpacity);
        tween(opacity)
            .to(0.4, { opacity: 0 })
            .call(() => {
                target.active = false;
                onComplete?.();
            })
            .start();
    }
}

/** 标题与副标题文案。正式版应走本地化表，启动阶段本地化尚未加载。 */
export const SPLASH_TITLE = '昆吾禁地';
export const SPLASH_SUBTITLE = '山外修士营地';

/** 文字颜色，与设计基调一致。 */
export const SPLASH_TITLE_COLOR = new Color(232, 227, 220, 255);
export const SPLASH_SUBTITLE_COLOR = new Color(150, 140, 130, 255);
