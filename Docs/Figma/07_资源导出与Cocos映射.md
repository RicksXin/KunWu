# 资源导出与 Cocos 映射

## 1. 交付原则

- 每张资源同时标注逻辑显示尺寸和 PNG 实际尺寸，例如 `逻辑 288×80，交付 864×240 (@3x)`。
- 动态文字、数字、价格、倒计时、境界、资质、锁定原因和按钮文案不进入 PNG。
- 可由 Cocos Label、Mask、Tint、九宫格或粒子系统表达的内容，不重复生成近似位图。
- Pixel Art 导出保持整数像素对齐；Cocos 使用 nearest 过滤和整数倍缩放。
- Figma 导出不创建 `.meta`。新增资源放入约定目录后由 Cocos Creator 导入并分配 UUID。

## 2. 导出命名

```text
ui_<scope>_<component>_<state>.png
icon_<category>_<name>.png
portrait_<role>_<name>.png
vfx_<system>_<name>_<frame>.png
```

示例：

```text
ui_common_panel_item_v2_default.png
ui_common_panel_item_v2_selected.png
ui_common_button_footer_default.png
icon_system_settings.png
vfx_camp_portal_glow_01.png
```

文件名使用英文小写蛇形；Figma Component 可用斜杠分组。状态命名必须与 Component Variant 和 Cocos 状态一致。

## 3. 九宫格与组合导出

- 可拉伸面板和按钮优先导出可九宫格切分的底图，并记录四边 inset。
- 角、纹理和高光不可被拉伸变形；必要时拆为底板、边框、装饰和光晕。
- 一级面板的上下装饰独立导出，与二级基础面板组合，不重复导出完整页面专用框。
- Panel Item V2 若整图导出，两态均为完整底板；若组合实现，则将底色、光晕和纹理分别映射。
- 图标可见尺寸与触控热区分开；不要通过给 PNG 增加巨大透明边缘制造热区。

## 4. 资源导出表模板

| Figma 节点 | Component/Variant | 状态 | 逻辑尺寸 | 交付尺寸 | 格式 | Slice/锚点 | 输出路径 | 评审状态 |
|---|---|---|---:|---:|---|---|---|---|
| `192:1138` | `PanelItem/V2` | default | `288×80` | `864×240` | PNG | 整图/中心 | `assets/bundles/camp/ui/common/ui_common_panel_item_v2_default.png` | Approved |
| `192:1172` | `PanelItem/V2` | selected | `288×80` | `864×240` | PNG | 整图/中心 | `assets/bundles/camp/ui/common/ui_common_panel_item_v2_selected.png` | Approved |

上述输出路径是交付命名目标；导入前应确认是否采用整图或运行时组合，不因文档示例自动创建资源文件。

## 5. Figma 到 Cocos 映射模板

| 页面/流程 | Figma 节点 | Figma 组件 | Cocos Scene/Prefab | 运行时节点 | 图片资源 | 状态/事件 | 负责人/状态 |
|---|---|---|---|---|---|---|---|
| 示例：建筑列表 | `207:1246` | `PanelItem/V2` | 待确认 | `Item/Visual` | `ui_common_panel_item_v2_*.png` | `default ↔ selected` | 待实现 |

映射至少回答：

1. Figma 哪个 Approved 节点是视觉依据。
2. Cocos 哪个 Prefab/节点承载该组件。
3. 哪些层是 Sprite、Label、Mask、Particle 或代码动效。
4. 哪些 Variant 对应哪些运行时状态和事件。
5. 逻辑尺寸、锚点、九宫格与触控热区如何设置。

## 6. 动效资源交付

PNG 序列命名连续且补零：

```text
vfx_camp_smoke_01.png
vfx_camp_smoke_02.png
...
vfx_camp_smoke_08.png
```

交付表额外记录帧率、循环方式、锚点、Blend、是否跟随节点缩放。若使用 Atlas，JSON/Plist 由选定打包工具生成；不要手写帧坐标。

纯代码按钮反馈无需导出序列帧：运行时对视觉子节点做 `100ms` 的 `1.0 → 0.96 → 1.0` 缩放即可，布局节点与触控区保持不变。

## 7. 交付前人工检查

- 只交付 Approved 节点，或明确标注 Draft/Review 不得实现。
- 资源名、Variant 名、逻辑尺寸和实际像素尺寸一致。
- 动态文案没有烘焙；透明边缘和主体占画布比例合理。
- 九宫格 inset、锚点、Mask、Blend 和滤镜要求已记录。
- Cocos 映射表能定位到具体 Prefab/节点，而不是只写“在页面里使用”。
- 新资源尚未由 Cocos 导入时，不创建或复制任何 `.meta`。
