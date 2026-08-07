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

### 4.1 营地主界面 Approved 交付

交付源为 [45:129](https://www.figma.com/design/9uaK9zzfEzxGYZsCC1Njix/昆吾禁地?node-id=45-129)。未压缩原图保存在
`ArtSource/figma_exports/camp_main/raw_3x/`，一次 TinyPNG 成品保存在
`ArtSource/figma_exports/camp_main/tinypng_3x/`。TinyPNG 未启用格式转换；19 张图片保持 PNG、原尺寸、透明通道和文件名不变。

| Figma 节点 | 导出名 | 逻辑尺寸 | 交付尺寸 | Cocos 输出路径 | 状态 |
|---|---|---:|---:|---|---|
| `59:19` | `env_camp_building_bai_bao_ku_locked.png` | `206×137` | `618×411 @3x` | `assets/bundles/camp/buildings/` | Approved，覆盖图片并保留 `.meta` |
| `59:25` | `env_camp_building_huan_hun_tan_locked.png` | `206×137` | `618×411 @3x` | 同上 | Approved，覆盖图片并保留 `.meta` |
| `59:43` | `env_camp_building_jiao_yi_hang_locked.png` | `206×137` | `618×411 @3x` | 同上 | Approved，覆盖图片并保留 `.meta` |
| `59:49` | `env_camp_building_lian_qi_fang_locked.png` | `247×165` | `741×495 @3x` | 同上 | Approved，覆盖图片并保留 `.meta` |
| `59:55` | `env_camp_building_ling_pu.png` | `≈247.67×165` | `743×495 @3x` | 同上 | Approved；运行时正式显示名为“灵源院”，覆盖图片并保留 `.meta` |
| `59:37` | `env_camp_building_yi_shi_dian.png` | `247×165` | `741×495 @3x` | 同上 | Approved，覆盖图片并保留 `.meta` |
| `59:31` | `env_camp_building_zhao_xian_tai.png` | `247×165` | `741×495 @3x` | 同上 | Approved，覆盖图片并保留 `.meta` |
| `59:61` | `env_camp_portal.png` | `206×139` | `618×417 @3x` | 同上 | Approved，覆盖图片并保留 `.meta` |
| `461:2197`、`461:2198`、`518:3615` | `icon_camp_building_attention.png` | `24×24` | `72×72 @3x` | `assets/bundles/camp/ui/common/` | Approved，新增资源；由 Creator 生成 `.meta` |
| `64:23`–`64:26` | `icon_camp_building_lock.png` | `12×12` | `36×36 @3x` | 同上 | Approved，新增资源；由 Creator 生成 `.meta` |
| `67:34` | `icon_camp_settings.png` | `20×20` | `60×60 @3x` | `assets/bundles/camp/ui/bottom/` | Approved，覆盖图片并保留 `.meta` |
| `67:35` | `icon_currency_spirit_stone.png` | `24×24` | `72×72 @3x` | 同上 | Approved，覆盖图片并保留 `.meta` |
| `60:24` | `icon_resource_spirit_grain.png` | `22×22` | `66×66 @3x` | `assets/bundles/camp/ui/top/` | Approved，覆盖图片并保留 `.meta` |
| `60:28` | `icon_resource_spirit_wood.png` | `22×22` | `66×66 @3x` | 同上 | Approved，覆盖图片并保留 `.meta` |
| `60:32` | `icon_resource_dark_iron.png` | `22×22` | `66×66 @3x` | 同上 | Approved，覆盖图片并保留 `.meta` |
| `60:36` | `icon_resource_spirit_crystal.png` | `22×22` | `66×66 @3x` | 同上 | Approved，覆盖图片并保留 `.meta` |
| `60:40` | `icon_resource_geng_jing.png` | `22×22` | `66×66 @3x` | 同上 | Approved，覆盖图片并保留 `.meta` |
| `60:20` | `portrait_player_placeholder.png` | `40×40` | `120×120 @3x` | 同上 | Approved，覆盖图片并保留 `.meta` |
| `60:21` | `ui_camp_avatar_frame.png` | `48×48` | `144×144 @3x` | 同上 | Approved，覆盖图片并保留 `.meta` |

营地背景继续复用 `assets/bundles/camp/env_camp_panorama_bg.png`。它与 Figma 当前 Fill 的内容一致，源文件只有
`1422×1106`，因此本批不把它下载后放大伪装为 `@3x`。建筑名称板和动态文字由 Cocos
`Graphics / Label / Tint` 组合实现，不重复导出位图；TopHUD 与 BottomHUD 不绘制背景，内容直接叠在全景地图上。

营地 TopHUD 在编辑器或普通浏览器未返回系统安全区时，按 Approved 稿保留 `44px` 状态栏参考空间；真机
`SafeAreaRoot` 已经扣除顶部 inset 时不重复留白。状态栏参考区只影响 HUD 定位，不生成任何背景或系统状态图标。

### 4.2 入山整备主面板 Approved 交付

交付源为 [83:238](https://www.figma.com/design/9uaK9zzfEzxGYZsCC1Njix/昆吾禁地?node-id=83-238)，
一级面板组合节点为 `106:555`。历史未压缩原图保存在
`ArtSource/figma_exports/expedition_prep/raw_3x/`；本次按修士卡 Approved 节点重新导出的版本保存在
`ArtSource/figma_exports/expedition_prep_v2/raw_3x/`，一次 TinyPNG 成品保存在
`ArtSource/figma_exports/expedition_prep_v2/tinypng_3x/`。顶部/底部装饰先去除 Figma 原图烘焙的米白底，
再进行一次 TinyPNG；所有成品保持 PNG、原尺寸和文件名，需要透明的上下装饰保留透明通道。

| Figma 组件 | 导出名 | 状态 | 逻辑尺寸 | 交付尺寸 | Cocos 输出路径 |
|---|---|---|---:|---:|---|
| `Panel/Level 2` 整备实例 `106:556` | `ui_expedition_panel_body.png` | default | `335×506` | `1005×1518 @3x` | `assets/bundles/camp/ui/expedition/` |
| `Panel/Decoration/Top` | `ui_expedition_panel_decoration_top.png` | default | `360×65` | `1080×195 @3x` | `assets/bundles/camp/ui/expedition/` |
| `Panel/Decoration/Bottom` | `ui_expedition_panel_decoration_bottom.png` | default | `360×55` | `1080×165 @3x` | 同上 |
| `素材 / 修士卡通用边框` `123:903` | `ui_expedition_hero_card_frame.png` | default | `71×163` | `213×489 @3x` | 同上 |
| `素材 / 空槽人物剪影` `123:910` | `ui_expedition_hero_empty_silhouette.png` | empty | `64×166` | `192×498 @3x` | 同上 |
| `PartyTab` | `ui_expedition_party_tab_default.png` | default | `26×26` | `78×78 @3x` | 同上 |
| `PartyTab` | `ui_expedition_party_tab_selected.png` | selected | `26×26` | `78×78 @3x` | 同上 |

二级木纹主体使用 `106:556` 整备实例直接导出的新素材，不在 Cocos 二次拉伸，也不再复用灵源院旧面板框；四张静态立绘、三类物品图标和加减图标
继续复用既有资源，修士卡框与空槽剪影使用本次 Figma 当前节点导出。
标题、副标题、修士信息、负重、数量与按钮文案使用 Label；`359×607` 一级面板由
整备实例主体与上下装饰组合。按钮使用 Cocos `Graphics + Label + Button` 原生实现，无新增按钮 PNG。

#### 4.2.1 启程地图选择 Approved 交付

交付源为 [84:341](https://www.figma.com/design/9uaK9zzfEzxGYZsCC1Njix/昆吾禁地?node-id=84-341)，
面板主体节点为 `95:569`。未压缩原图保存在
`ArtSource/figma_exports/expedition_map_selection/raw_3x/`，一次 TinyPNG 成品保存在
`ArtSource/figma_exports/expedition_map_selection/tinypng_3x/`。

| Figma 组件 | 导出名 | 状态 | 逻辑尺寸 | 交付尺寸 | Cocos 输出路径 |
|---|---|---|---:|---:|---|
| 地图选择面板主体 `95:569` | `ui_expedition_map_selection_panel.png` | default | `343×622` | `1029×1866 @3x` | `assets/bundles/camp/ui/expedition/` |

面板按固定 `343×622` 显示，不做九宫格；地图项目的渐变、描边、名称与规则使用 Cocos 原生节点，
锁定态复用既有 `icon_expedition_lock.png`，底部返回复用原生可拉伸 Footer 按钮。

#### 4.2.2 编辑队伍 Approved 交付

交付源为 [85:444](https://www.figma.com/design/9uaK9zzfEzxGYZsCC1Njix/昆吾禁地?node-id=85-444)。
未压缩原图保存在 `ArtSource/figma_exports/expedition_hero_selection/raw_3x/`，一次 TinyPNG
成品保存在 `ArtSource/figma_exports/expedition_hero_selection/tinypng_3x/`。

| Figma 组件 | 导出名 | 状态 | 逻辑尺寸 | 交付尺寸 | Cocos 输出路径 |
|---|---|---|---:|---:|---|
| 编辑队伍面板主体 `95:584` | `ui_expedition_hero_selection_panel.png` | default | `343×553` | `1029×1659 @3x` | `assets/bundles/camp/ui/expedition/` |
| 页面行实例 `297:1421` 等 | `ui_expedition_hero_selection_row_selected.png` | selected | `288×67` | `864×201 @3x` | 同上 |
| 页面行实例 `326:3561` | `ui_expedition_hero_selection_row_default.png` | default | `288×67` | `864×201 @3x` | 同上 |

面板和行底板均按固定尺寸显示。行底板是页面实例专用输出，不冒充或覆盖逻辑高度 `80` 的
全局 `Panel Item V2`。头像沿用四张修士立绘与大厅头像框，Mask、境界、三行信息和操作按钮由
Cocos 组合；完成按钮人数、修士状态和按钮文案均为动态 Label。

### 4.3 灵源院生产面板 Approved 交付

交付源为 [80:32](https://www.figma.com/design/9uaK9zzfEzxGYZsCC1Njix/昆吾禁地?node-id=80-32)。
未压缩原图保存在 `ArtSource/figma_exports/ling_pu_fitted/raw_3x/`，一次 TinyPNG 成品保存在
`ArtSource/figma_exports/ling_pu_fitted/tinypng_3x/`。

| Figma 组件 | 导出名 | 状态 | 逻辑尺寸 | 交付尺寸 | Cocos 输出路径 |
|---|---|---|---:|---:|---|
| 二级木纹主体 `106:548` | `ui_ling_pu_panel_body.png` | default | `335×503` | `1005×1509 @3x` | `assets/bundles/camp/ui/ling_pu/` |
| 顶部装饰 `106:549` | `ui_expedition_panel_decoration_top.png` | default | `359×65` | 复用既有 `@3x` | `assets/bundles/camp/ui/expedition/` |
| 底部装饰 `106:550` | `ui_expedition_panel_decoration_bottom.png` | default | `359×55` | 复用既有 `@3x` | 同上 |

资源行的半透明信息底、动态文字、升级按钮和数量调节使用 Cocos 原生组合；资源图标与加减图标
复用现有图片。曾尝试导出的 `ui_ling_pu_resource_row_figma.png` 是透明无效输出，仅在 ArtSource
保留追溯，不复制到运行时目录。灵晶、庚精未开放时隐藏整行，面板仍保持定高。

### 4.4 地图探索图标 Draft 登记

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

### 4.5 战斗技能与状态图标 Draft 登记

本批规范板为 [525:2449](https://www.figma.com/design/9uaK9zzfEzxGYZsCC1Njix/昆吾禁地?node-id=525-2449)，上传母图仍保留在“素材处理”页。

| Figma 来源 | 内容 | 逻辑尺寸 | 交付尺寸 | 承载方式 | 状态 |
|---|---|---:|---:|---|---|
| `511:3572`–`511:3601` | 30 张职业技能上传稿 | 现规范 `24×24` | 现规范 `72×72 @3x` | 规范板中按 `36×36` 放入 `40×40` 凡品细边方框，仅作视觉预览 | Draft，复用关系待确认 |
| `511:3602`–`511:3614` | 4 张 Buff＋9 张 Debuff/控制 | `14×14` | `42×42 @3x` | 独立状态图标，不加技能框 | Draft，需小尺寸可读性确认 |
| `409:2805` | 技能细边方框视觉源 | `40×40` | 待确认是否复用既有品质槽资源 | 框与 Skill Icon 分层，不把图标烘焙进框 | Draft |

“镇幽符宝”和“破灵符矢”当前各有独立上传稿，但正式美术规则仍要求二者复用“飞符化刃”。
确认复用关系前，不为这两张独立稿冻结导出名或 Cocos 路径。

### 4.6 原生可拉伸按钮 Approved 登记

本批规范板为 [537:2417](https://www.figma.com/design/9uaK9zzfEzxGYZsCC1Njix/昆吾禁地?node-id=537-2417)。
它以 Figma/Cocos 原生层替代整张按钮 PNG；Page 1 当前有效界面已完成统一替换，旧图底按钮只在 Legacy 备份中保留。

| Figma 节点 | Component/Variant | 基准尺寸 | 拉伸验证 | 计划交付 | 状态 |
|---|---|---:|---|---|---|
| `541:2445` | `Button/Resizable/Footer` | `144×44` | `88×36`、`144×44`、`240×52` | 原生色块、描边、渐变与 Label 组合；不导出 PNG | Approved，已用于入山整备底部按钮 |
| `542:2445` | `Button/Resizable/Inline` | `120×32` | `72×28`、`120×32`、`200×36` | 原生色块、描边、渐变与 Label 组合；不导出 PNG | Approved，已用于入山整备操作栏 |

Cocos 实现应保持触控区与视觉节点分离；按钮视觉节点允许执行
`1.0 → 0.96 → 1.0 / 100ms` 缩放，布局节点和点击热区不缩放。若 Cocos 无法低成本复现渐变纹理，
再单独评估九宫格，而不是重新导出任意宽度的整张按钮图。

## 5. Figma 到 Cocos 映射模板

| 页面/流程 | Figma 节点 | Figma 组件 | Cocos Scene/Prefab | 运行时节点 | 图片资源 | 状态/事件 | 负责人/状态 |
|---|---|---|---|---|---|---|---|
| 营地主界面 | `45:129` | 固定 HUD、`1050×817` 横滑全景、名称板、锁定/关注标记 | `CampPanorama.prefab`、`CampTopHud.prefab`、`CampBottomHud.prefab` | `BuildingLayer/<id>/{Name,State,Badge}`、`ResourceBar`、`MainTaskButton`、`BottomLeftSlots`、`BottomRightCurrency` | `env_camp_building_*.png`、`env_camp_portal.png`、`icon_camp_building_*.png`、顶部/底部 HUD 图标 | `BuildingState` 切普通/locked 图；锁定固定锁图标；开放且有可执行待办时显示关注感叹号 | Approved，2026-08-07 已交付代码，待用户 Creator 人工验收 |
| 入山整备主面板 | `83:238`（组合 `106:555`） | `Panel/Level1`、`PartyTab`、`Button/Resizable/Inline`、`Button/Resizable/Footer` | `CampExpeditionPage.prefab` | `PreparationContent/{Title,HeroCards,Toolbar,BurdenRow,LoadoutRows}`、`CampModalPanelFrame/{MainPanel,Footer}` | `ui_expedition_panel_decoration_*.png`、`ui_expedition_party_tab_*.png`；其余复用既有图片 | 队伍 default/selected；装载 +/- 禁用；按钮 pressed/disabled；“传送”继续打开既有地图选择，“返回”无损关闭 | Approved，2026-08-07 已交付代码与资源，待用户 Creator 人工验收 |
| 启程地图选择 | `84:341`（主体 `95:569`） | `Panel/Level 2`、`Panel/ThinFrame/Code`、`Button/Resizable/Footer` | `CampExpeditionPage.prefab` | `MapSelectionLayer/{MapSelectionPanel,MapList,MapSelectionHint,MapSelectionCloseButton}` | `ui_expedition_map_selection_panel.png`；锁图标复用 `icon_expedition_lock.png` | 五图动态数据、开放/锁定、点击已开放地图进入既有出征事务、返回关闭二级层 | Approved，2026-08-07 已交付代码与资源，待用户 Creator 人工验收 |
| 编辑队伍 | `85:444`（主体 `95:584`、列表 `296:1528`） | 固定面板、页面专用行底板、修士头像/信息、Inline/Footer 按钮 | `CampExpeditionPage.prefab` | `HeroSelectionLayer/{HeroSelectionPanel,HeroList,HeroSelectionCloseButton,HeroSelectionBackButton}` | `ui_expedition_hero_selection_panel.png`、`ui_expedition_hero_selection_row_*.png`；头像与灵根框复用 | 已选/未选、阵亡/跨队占用禁用、选择顺序、动态人数；返回和完成均回到整备页 | Approved，2026-08-07 已交付代码与资源，待用户 Creator 人工验收 |
| 灵源院生产面板 | `80:32`（组合 `106:547`） | 固定一级面板、资源行、Inline/Footer 按钮 | `CampLingPuPage.prefab` | `LingPuPanel/{MainPanel,ResourceRows,ConfirmOverlay}`、`CampModalPanelFrame/{MainPanel,Footer}` | `ui_ling_pu_panel_body.png`；上下装饰、资源与加减图标复用 | 岗位增减、储量升级、招募确认、按钮禁用；未开放资源行隐藏且面板定高 | Approved，2026-08-07 已交付代码与资源，待用户 Creator 人工验收 |
| 示例：建筑列表 | `207:1246` | `PanelItem/V2` | 待确认 | `Item/Visual` | `ui_common_panel_item_v2_*.png` | `default ↔ selected` | 待实现 |
| 地图探索默认页 | `476:2217` | ActionBar：`32×32` 近圆形物品框＋`28×28` Icon；`MapMarkerLayer` | 待确认 | `Exploration/HUD/ActionBar`、`MapWorld/Markers` | `icon_explore_*.png`、圆形物品框、`marker_explore_*.png` | 对象发现、Tint、锁定、已处理 | Draft，待用户确认 |
| 地图探索扎营状态 | `507:2232` | ActionBar 同默认页；中央操作为 `72×72` 近圆形物品框＋`64×64` Icon＋独立文字/次数 | 待确认 | `Exploration/HUD/ActionBar`、`Exploration/WorldOverlay/CampActions` | `icon_explore_camp_*.png`、圆形物品框 | 可用、已使用、禁用、提交中、剩余次数 | Draft，待用户确认 |
| 战斗技能与状态图标 | `525:2449` | Skill：细边方框＋独立 Icon；Status：独立 Icon | 待确认 | `Combat/SkillEntry/IconFrame`、`Combat/StatusList/Icon` | `icon_skill_*.png`、`icon_status_*.png` | default、selected、cooldown、disabled、stack、duration | Draft，待复用关系与小尺寸确认 |
| 原生可拉伸按钮 | `537:2417` | `Button/Resizable/Footer`、`Button/Resizable/Inline` | `CampExpeditionPage.prefab` | `Toolbar/{EditPartyButton,RestoreStaminaButton}`、`CampModalPanelFrame/Footer` | 无整张按钮 PNG；原生色块、描边、渐变与 Label | default、pressed、selected、disabled | Approved，已完成首个 Cocos 页面落地 |

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
