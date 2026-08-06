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

### 4.1 地图探索图标 Draft 登记

本批素材板为 [499:2437](https://www.figma.com/design/9uaK9zzfEzxGYZsCC1Njix/昆吾禁地?node-id=499-2437)。Figma 中保留 `512×512` 清稿母图；下表尺寸是运行时逻辑尺寸与最终交付尺寸，不把透明母图原尺寸直接当作显示尺寸。

| Figma 节点 | 导出名 | 逻辑尺寸 | 交付尺寸 | 锚点/用途 | 计划路径 | 状态 |
|---|---|---:|---:|---|---|---|
| `499:2443` | `icon_explore_camp.png` | `28×28` | `84×84 @3x` | 中心；探索 HUD 的 `32×32` 圆框内 | `assets/bundles/shared/ui/exploration/` | Draft |
| `499:2447` | `icon_explore_return_to_camp.png` | `28×28` | `84×84 @3x` | 中心；探索 HUD 的 `32×32` 圆框内 | 同上 | Draft |
| `499:2451` | `icon_explore_party.png` | `28×28` | `84×84 @3x` | 中心；探索 HUD 的 `32×32` 圆框内 | 同上 | Draft |
| `499:2455` | `icon_explore_inventory.png` | `28×28` | `84×84 @3x` | 中心；探索 HUD 的 `32×32` 圆框内 | 同上 | Draft |
| `499:2461` | `marker_explore_map_exit.png` | `24×24` | `72×72 @3x` | 对象坐标底部中央 | `assets/bundles/shared/world/markers/` | Draft |
| `499:2465` | `marker_explore_spawn.png` | `24×24` | `72×72 @3x` | 对象坐标底部中央 | 同上 | Draft |
| `499:2469` | `marker_explore_enemy.png` | `24×24` | `72×72 @3x` | 对象坐标底部中央 | 同上 | Draft |
| `499:2473` | `marker_explore_dungeon.png` | `24×24` | `72×72 @3x` | 对象坐标底部中央 | 同上 | Draft |
| `499:2477` | `marker_explore_resource.png` | `24×24` | `72×72 @3x` | 对象坐标底部中央 | 同上 | Draft |
| `499:2481` | `marker_explore_party.png` | `32×32` | `96×96 @3x` | 当前队伍格中心 | 同上 | Draft |
| `499:2485` | `marker_explore_boss.png` | `32×32` | `96×96 @3x` | Boss 格中心 | 同上 | Draft |
| `499:2491` | `icon_explore_camp_recover.png` | `64×64` | `192×192 @3x` | 中心；源图居中裁切 `1.19×`；扎营操作的 `72×72` 圆框内 | `assets/bundles/shared/ui/exploration/` | Draft |
| `499:2495` | `icon_explore_camp_continue.png` | `64×64` | `192×192 @3x` | 中心；扎营操作的 `72×72` 圆框内 | 同上 | Draft |
| `499:2499` | `icon_explore_camp_food.png` | `64×64` | `192×192 @3x` | 中心；扎营操作的 `72×72` 圆框内 | 同上 | Draft |

### 4.2 战斗技能与状态图标 Draft 登记

本批规范板为 [525:2449](https://www.figma.com/design/9uaK9zzfEzxGYZsCC1Njix/昆吾禁地?node-id=525-2449)，上传母图仍保留在“素材处理”页。

| Figma 来源 | 内容 | 逻辑尺寸 | 交付尺寸 | 承载方式 | 状态 |
|---|---|---:|---:|---|---|
| `511:3572`–`511:3601` | 30 张职业技能上传稿 | 现规范 `24×24` | 现规范 `72×72 @3x` | 规范板中按 `36×36` 放入 `40×40` 凡品细边方框，仅作视觉预览 | Draft，复用关系待确认 |
| `511:3602`–`511:3614` | 4 张 Buff＋9 张 Debuff/控制 | `14×14` | `42×42 @3x` | 独立状态图标，不加技能框 | Draft，需小尺寸可读性确认 |
| `409:2805` | 技能细边方框视觉源 | `40×40` | 待确认是否复用既有品质槽资源 | 框与 Skill Icon 分层，不把图标烘焙进框 | Draft |

“镇幽符宝”和“破灵符矢”当前各有独立上传稿，但正式美术规则仍要求二者复用“飞符化刃”。
确认复用关系前，不为这两张独立稿冻结导出名或 Cocos 路径。

## 5. Figma 到 Cocos 映射模板

| 页面/流程 | Figma 节点 | Figma 组件 | Cocos Scene/Prefab | 运行时节点 | 图片资源 | 状态/事件 | 负责人/状态 |
|---|---|---|---|---|---|---|---|
| 示例：建筑列表 | `207:1246` | `PanelItem/V2` | 待确认 | `Item/Visual` | `ui_common_panel_item_v2_*.png` | `default ↔ selected` | 待实现 |
| 地图探索默认页 | `476:2217` | ActionBar：`32×32` 近圆形物品框＋`28×28` Icon；`MapMarkerLayer` | 待确认 | `Exploration/HUD/ActionBar`、`MapWorld/Markers` | `icon_explore_*.png`、圆形物品框、`marker_explore_*.png` | 对象发现、Tint、锁定、已处理 | Draft，待用户确认 |
| 地图探索扎营状态 | `507:2232` | ActionBar 同默认页；中央操作为 `72×72` 近圆形物品框＋`64×64` Icon＋独立文字/次数 | 待确认 | `Exploration/HUD/ActionBar`、`Exploration/WorldOverlay/CampActions` | `icon_explore_camp_*.png`、圆形物品框 | 可用、已使用、禁用、提交中、剩余次数 | Draft，待用户确认 |
| 战斗技能与状态图标 | `525:2449` | Skill：细边方框＋独立 Icon；Status：独立 Icon | 待确认 | `Combat/SkillEntry/IconFrame`、`Combat/StatusList/Icon` | `icon_skill_*.png`、`icon_status_*.png` | default、selected、cooldown、disabled、stack、duration | Draft，待复用关系与小尺寸确认 |

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
