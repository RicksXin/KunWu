import { _decorator, Component, Graphics, Color } from 'cc';
import { ALERT_PRESENTATIONS } from '../domain/AlertLevel';
import type { AlertLevel } from '../domain/AlertLevel';

const { ccclass, property } = _decorator;

/**
 * 提示图标（PRD-09 §5、任务 #7b4b）。
 *
 * 用 Graphics 画几何形状而非贴图，两个原因：
 *   1. PRD-09 §5 要求颜色、文字、边框形状、图标四重编码。借来的符文图标
 *      彼此形状相近，起不到区分作用；几何形状可以做到一眼分辨。
 *   2. 四个图标不值得占首屏体积，且矢量绘制在任意分辨率下都清晰，
 *      不受像素图整数缩放约束。
 *
 * 形状对应关系（与 ALERT_PRESENTATIONS 的 borderShape 一致）：
 *   info    圆形     — 中性，无棱角
 *   caution 方形     — 开始需要注意
 *   warning 三角形   — 通用警告符号
 *   danger  八角形   — 停止标志的形状
 */
@ccclass('AlertIcon')
export class AlertIcon extends Component {
    @property
    private _level: AlertLevel = 'info';

    @property({ tooltip: '提示等级，决定形状与颜色' })
    get level(): AlertLevel {
        return this._level;
    }
    set level(value: AlertLevel) {
        this._level = value;
        this.redraw();
    }

    /** 图标半径，像素。 */
    @property
    radius = 16;

    protected override onLoad(): void {
        this.redraw();
    }

    redraw(): void {
        // addComponent 在节点已销毁时返回 null，故显式检查而非断言
        const graphics = this.getComponent(Graphics) ?? this.addComponent(Graphics);
        if (!graphics) {
            return;
        }
        graphics.clear();

        const presentation = ALERT_PRESENTATIONS[this._level];
        const color = hexToColor(presentation.color);
        graphics.fillColor = color;
        // 描边用同色加深，保证在深色底上也有轮廓
        graphics.strokeColor = new Color(
            Math.floor(color.r * 0.55),
            Math.floor(color.g * 0.55),
            Math.floor(color.b * 0.55),
            255,
        );
        graphics.lineWidth = 2;

        const r = this.radius;
        switch (this._level) {
            case 'info':
                graphics.circle(0, 0, r);
                break;
            case 'caution':
                graphics.rect(-r, -r, r * 2, r * 2);
                break;
            case 'warning':
                drawPolygon(graphics, r, 3, Math.PI / 2);
                break;
            case 'danger':
                drawPolygon(graphics, r, 8, Math.PI / 8);
                break;
        }

        graphics.fill();
        graphics.stroke();
    }
}

/** 正多边形。startAngle 控制朝向——三角形要尖端朝上。 */
function drawPolygon(
    graphics: Graphics,
    radius: number,
    sides: number,
    startAngle: number,
): void {
    for (let i = 0; i < sides; i += 1) {
        const angle = startAngle + (i * Math.PI * 2) / sides;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) {
            graphics.moveTo(x, y);
        } else {
            graphics.lineTo(x, y);
        }
    }
    graphics.close();
}

/** #rrggbb → Color。ALERT_PRESENTATIONS 用十六进制字符串存颜色。 */
export function hexToColor(hex: string): Color {
    const value = hex.replace('#', '');
    if (value.length !== 6) {
        throw new Error(`颜色须为 #rrggbb 格式，收到 ${hex}`);
    }
    return new Color(
        Number.parseInt(value.slice(0, 2), 16),
        Number.parseInt(value.slice(2, 4), 16),
        Number.parseInt(value.slice(4, 6), 16),
        255,
    );
}
