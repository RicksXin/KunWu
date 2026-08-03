# 《昆吾禁地》美术素材制作总清单

版本：0.2\
日期：2026-08-03\
状态：美术制作唯一事实源\
适用范围：营地大厅、顶部/底部 HUD、灵圃、入山整备、战斗页面，以及后续新增的 GPT Image/人工美术制作批次

`Docs/14_美术素材制作总清单.md` 只保留为兼容入口；本目录的索引与各分册是实际维护位置。

## 分册索引

| 分册 | 内容 |
|---|---|
| [01_营地大厅建筑与传送阵.md](01_营地大厅建筑与传送阵.md) | 营地全景背景、七座建筑、传送阵、布局、锁定态与验收 |
| [02_营地HUD.md](02_营地HUD.md) | 顶部/底部 HUD 素材表、参考图、提示词、制作顺序与验收 |
| [03_灵圃生产弹窗.md](03_灵圃生产弹窗.md) | 灵圃面板、资源行、进度条、通用行内/底部按钮与验收 |
| [04_入山整备编辑队伍与地图选择.md](04_入山整备编辑队伍与地图选择.md) | 入山整备、修士卡、编辑队伍、地图选择、功能图标与验收 |
| [05_战斗页面与动态单位.md](05_战斗页面与动态单位.md) | 战斗背景、动态单位、立绘底部信息覆盖层、技能/状态图标、特效与 GPT Image 提示词 |
| [06_通用方形图像槽.md](06_通用方形图像槽.md) | 资源、物品和修士小头像共用的中性方形、近圆形槽位、提示词与验收 |
| [07_通用事件标记选项按钮与战利品图标.md](07_通用事件标记选项按钮与战利品图标.md) | 建筑事件感叹号、通用选项小按钮、辟谷饼/魂晶图标及六档灵根资质框提示词 |

## 1. 文档职责

本套分册统一保存每批美术素材的制作范围、已有资源复用关系、参考截图、GPT Image 提示词、逻辑尺寸、最终 PNG 尺寸、输出目录、制作顺序和美术验收。产品规则与交互规则继续保存在对应 PRD；PRD 只链接对应分册，不复制具体提示词和素材表。

发生冲突时按以下优先级处理：

1. 页面功能、信息层级和交互以对应 PRD 为准。
2. UI 可见窗口与逻辑尺寸以 `375×817` 为准。
3. 已生成资源的实际文件、尺寸和复用关系以本目录对应分册及 `assets/` 中的文件为准。
4. 像素纪律、命名、许可和通用交付规则以 `Docs/02_美术设计规范.md`、PRD-11 为准。
5. 历史 Excel、旧输出清单或第三方截图只作追溯/参考，不覆盖本目录的对应分册。

## 2. 已生成资产与复用基线

所有新 UI 在生成前必须先检查下表；能通过九宫格、Tint、Mask、Label 或组合节点复用的，不新增近似图片。当前 `assets/bundles/camp/ui/` 已有 23 张运行时 UI PNG：顶部 8 张、底部 HUD 6 张、灵圃 7 张、全局通用按钮 2 张；高清原始输出位于 `ArtSource/camp_gpt_image_20260731/raw_outputs/`。其中通用底部按钮现版未通过视觉验收，只计作已导入占位资源，不计作已完成美术。

| 组件组 | 运行时文件/计划文件 | 复用原则 |
|---|---|---|
| 面板 | 现行 `ui/ling_pu/ui_ling_pu_panel_frame.png`；重做计划见 `03_灵圃生产弹窗.md` §5.4.1 | 重做为一张全建筑共用基础九宫格；主面板额外叠加上下装饰，二次确认只改变基础框高度，不生成页面专用边框 |
| 列表项 | 现行 `ui/ling_pu/ui_ling_pu_resource_row.png`；重做计划为 `ui/common/ui_common_list_item_normal.png` + `ui_common_list_item_selected.png` | 普通态与选中态都是完整、不透明的无框底板，通过同一 Sprite 切换；选中态只改变整行底色、明度和极轻材质层级，序号/文字等选择信息由运行时节点表达；禁用/锁定继续用 Tint、锁图标和原因文字 |
| 旧横向按钮（待退役） | `ui/ling_pu/ui_ling_pu_action_button_normal.png` | 仅保留给未迁移的 Prefab/场景引用；新页面不再复用 |
| 通用行内按钮（已生成） | `ui/common/ui_common_button_inline_normal.png` | 资源行、列表行和卡片内的紧凑操作；可见高度不代替 `48dp` 热区 |
| 通用选项小按钮（待生成） | `ui/common/ui_common_toggle_small_{normal,selected}.png` | 只用于筛选、分页、模式等持续选中项；普通态与选中态都是完整不透明底图，不代替点击即执行的行内按钮 |
| 通用底部按钮（现版退回，待重做） | `ui/common/ui_common_button_footer_normal.png` | 主面板底部与二次确认弹窗操作；当前阶梯形外轮廓不通过，不作最终视觉 |
| 方形加减 | `ui/ling_pu/icon_action_plus.png`、`icon_action_minus.png` | 所有数量调整共用，可见图不承担触控热区 |
| 进度条 | `ui/ling_pu/ui_production_progress_track.png`、`ui_production_progress_fill.png` | 相同粗细的计时/进度语义优先复用；不同语义需先做合成评审 |
| 通用图像槽家族 | 现行头像仍使用 `ui/top/ui_camp_avatar_frame.png`；方形与近圆形新增计划见 `06_通用方形图像槽.md` | 两种槽位均为 `48×48`，资源、物品和修士小头像共用；轮廓只按布局选择，不表示品质或状态；生成并验收前不替换现有头像框 |
| 灵根资质框家族（待生成） | `ui/common/ui_spiritual_root_frame_{mixed_root,pseudo_root,triple_root,dual_root,heavenly_root,variant_root}.png` | 六张 `48×48` 透明覆盖框叠在通用方形槽与修士头像上；同时以颜色和纹样区分，必须配合资质文字，不用于物品品质、境界、职业、阵营或选中状态 |
| 生产资源 | `ui/top/icon_resource_{spirit_grain,spirit_wood,dark_iron,spirit_crystal,geng_jing}.png` | 同一资源跨页面必须使用同一文件 |
| 玩家占位头像 | `ui/top/portrait_player_placeholder.png` | 仅作为人物像素密度、光照与色盘参考，不复制脸、发型或身份 |
| 系统与货币 | `ui/bottom/icon_camp_*.png`、`icon_currency_spirit_stone.png` | 同一系统/货币跨页面复用，不重画金币或宝石替代灵石 |
| 主线任务 | `ui/top/icon_camp_main_task.png` | 任务语义共用；不与邮件或地图标记混用 |
| 建筑事件标记（待生成） | `ui/common/icon_camp_building_event.png` | 黄色感叹号只表示建筑存在可处理事件；不与主线任务、升级、奖励、红点或危险警告混用 |
| 辟谷饼与魂晶（待生成） | `ui/common/icon_item_bigu_cake.png`、`icon_resource_soul_crystal.png` | 辟谷饼是占负重的野外补给物品；魂晶是即时入账的升级/还魂资源；两者均复用同一图标文件，不随页面重画 |

所有文字、数字、境界徽记、灵根资质、资源数量、倒计时、价格、锁定原因和按钮文案仍由 Cocos Label/本地化表渲染，不得烘焙进 PNG。
