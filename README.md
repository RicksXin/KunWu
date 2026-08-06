# 《昆吾禁地》

竖屏 2D 像素修仙单机游戏。玩家在营地中生产资源、招募和培养修士，组织四人队伍携带有限补给进入固定方格地图，在迷雾中探索、战斗并回城结算。

- 引擎：Cocos Creator 3.8.7
- 语言：TypeScript
- 渲染：WebGL
- 首发平台：Web Mobile
- 包管理器：pnpm 10.33.0（禁止使用 npm 或 yarn）
- UI 逻辑设计基准：`375×817`
- 营地全景逻辑宽度：`1050`（`375×2.8`）
- 当前目标：完成 D0——可从 localhost 操作的 15–20 分钟核心闭环

当前 Demo 范围、技术、API、进度和验收统一从 [`Docs/Demo/`](Docs/Demo/README.md) 进入；正式项目阶段状态见 [`Docs/08_开发进度与待办.md`](Docs/08_开发进度与待办.md)。本 README 负责解释工程入口与目录职责，不替代 PRD、技术方案或工程约定。

## 1. 快速开始

首次克隆后先安装 Git LFS，再安装依赖：

```bash
git lfs install
pnpm install
```

用 Cocos Dashboard 添加本目录，或直接打开：

```bash
/Applications/Cocos/Creator/3.8.7/CocosCreator.app/Contents/MacOS/CocosCreator --project .
```

常用命令：

```bash
pnpm test           # 领域层与服务层单元测试
pnpm test:watch     # 监听模式单测
pnpm typecheck      # 使用 Cocos 自带 TypeScript 检查 assets/ 与 tests/
pnpm validate:data  # 数据表校验
pnpm validate:scene # Camp 场景与 Prefab 结构校验
pnpm check          # typecheck + 单测 + 数据校验 + 场景校验
pnpm check:layout   # 营地布局检查
pnpm build:web      # 构建 Web Mobile；执行前必须关闭 Cocos Creator
pnpm serve          # 预览 Web 构建产物
pnpm verify:gate    # 阶段/提交前门禁验证
```

Cocos 编辑器预览通常位于 `http://127.0.0.1:7456/`。修改 `.scene` 或 `.prefab` 后，应先在编辑器中按 `Cmd+R` 刷新资源，再由开发者运行预览并进行视觉验收。

## 2. 事实源与阅读顺序

开始实现功能前，按以下顺序确认需求：

1. [`Docs/07_分阶段产品需求文档_PRD.md`](Docs/07_分阶段产品需求文档_PRD.md)：PRD 总入口和事实源归属。
2. [`Docs/PRD/`](Docs/PRD)：对应系统的产品范围、规则、异常和验收。
3. [`Docs/Demo/`](Docs/Demo/README.md)：当前 Demo 裁剪范围、前后端技术、API、进度和验收。
4. [`Docs/01_技术实现方案.md`](Docs/01_技术实现方案.md)：正式技术结构和实现边界。
5. [`Docs/08_开发进度与待办.md`](Docs/08_开发进度与待办.md)：正式项目阶段状态。
6. [`CLAUDE.md`](CLAUDE.md) / [`AGENTS.md`](AGENTS.md)：容易踩错的长期工程约定。

若文档冲突，以 PRD 总目录中的“文档归属与冲突处理”表为准。`CLAUDE.md` 和 `AGENTS.md` 不替代产品与技术事实源。

## 3. 根目录总览

```text
KunWu/
├── README.md               本文件：项目入口与目录地图
├── AGENTS.md               Codex 长期工程约定
├── CLAUDE.md               Claude Code 长期工程约定
├── package.json            pnpm 命令、Cocos 版本和工程元数据
├── pnpm-lock.yaml          依赖锁文件
├── tsconfig.json           Cocos 工程 TypeScript 配置
├── tsconfig.tests.json     Node 测试专用 TypeScript 配置
├── assets/                 会被 Cocos 导入的代码、场景、数据和运行时资源
├── Docs/                   PRD、技术、美术、地图、数值和待办文档
├── tests/                  不进入 Web 包的领域层与服务层单元测试
├── tools/                  构建、校验、场景编辑和报表脚本
├── settings/               Cocos 项目级配置，应提交
├── .creator/               Cocos 资源导入默认规则
├── ArtSource/              原始美术与 AI 生成过程素材，不直接作为运行时资源
├── ThirdParty/             第三方原始素材、许可快照和压缩包
├── outputs/                报表、预览图等可再生工作产物
├── library/                Cocos 导入缓存，生成目录，不提交
├── temp/                   Cocos 临时文件，生成目录，不提交
├── local/                  本机状态和场景备份，生成目录，不提交
├── profiles/               本机编辑器配置，生成目录，不提交
└── build/ / dist/          构建产物，生成目录，不提交
```

`assets/` 是游戏运行时内容的入口。素材仅放在 `ArtSource/`、`ThirdParty/` 或 `outputs/` 中，不会自动进入游戏；需要经过筛选、授权确认和 Cocos 导入后，放入 `assets/` 才会成为运行时资源。

## 4. `assets/`：运行时代码与资源

```text
assets/
├── scenes/
│   └── Boot.scene                 启动场景
├── bundles/
│   ├── camp/                      营地场景、页面 Prefab、建筑和 HUD 素材
│   ├── shared/                    默认存档、灵源院和入山整备共享配置
│   ├── map_01/                    地图 1 Bundle 清单；地图页面尚未落地
│   └── map_02/                    地图 2 Bundle 清单；地图页面尚未落地
├── scripts/
│   ├── domain/                    无 Cocos 依赖的纯 TypeScript 领域逻辑与功能子模块
│   ├── services/                  存档、状态、Bundle、时间、音频等持久服务
│   ├── repositories/              数据表加载与存档读写适配；当前为空目录
│   └── presentation/              按页面模块组织的 Cocos 表现层
├── data/
│   ├── balance/                   成长、战斗、境界和生产数值表
│   ├── careers/                   六个初始职业及技能数据
│   ├── heroes/                    初始修士数据
│   ├── localization/              中文本地化表
│   ├── maps/                      地图数据预留目录
│   └── schemas/                   数据 Schema 预留目录
├── fonts/                         运行时字体
├── third_party/                   已确认并导入运行时的第三方素材
├── art/                           通用原创美术预留目录
├── audio/                         音频预留目录
└── vfx/                           特效预留目录
```

### 4.1 代码分层

| 目录 | 职责 | 典型文件 |
|---|---|---|
| `assets/scripts/domain/` | 地图、战斗、职业、生产、编队等纯规则；不得依赖 Cocos | `CombatResolver.ts`、`GridCoord.ts`、`FogOfWar.ts`、`LingPu.ts`；复杂实现位于同名功能子目录 |
| `assets/scripts/services/` | 存档、全局状态、资源加载和生命周期 | `GameState.ts`、`SaveService.ts`、`BundleLoader.ts`、`profile/` |
| `assets/scripts/repositories/` | 数据加载与持久化适配器 | 当前为空，后续实现仍应遵守此职责 |
| `assets/scripts/presentation/` | Cocos 节点、场景、输入、动画和页面展示；按页面模块组织 | `boot/`、`camp/`、`core/`、`routing/` |

跨目录导入使用 Cocos 原生 `db://` 前缀，不在根 `tsconfig.json` 中增加自定义 `paths`。领域层只处理 `GridCoord`，像素坐标换算由表现层负责。

长文件采用“稳定入口 + 内部功能目录”的方式拆分。例如外部仍从 `domain/CombatResolver.ts`、`domain/BalanceTables.ts` 和 `services/ProfileCodec.ts` 导入，具体实现分别位于 `domain/combat/`、`domain/balance/` 和 `services/profile/`。这样既保持原有公共 API 稳定，也避免一个文件同时承担解析、规则、渲染和流程编排。

### 4.2 表现层页面目录

```text
assets/scripts/presentation/
├── boot/                         启动页与游戏引导
│   ├── BootSplash.ts
│   └── GameBootstrap.ts
├── camp/
│   ├── hall/                     营地主大厅、HUD、建筑、NPC 和设置
│   ├── ling_pu/                  灵源院页面、节点绑定、渲染和素材
│   ├── expedition/               入山整备、修士选择、地图选择和素材
│   └── shared/                   营地页面共享的 Cocos 视图工具
├── core/                         跨页面基础组件与视窗适配
└── routing/                      Bundle 宿主和场景路由
```

表现层按玩家可识别的页面模块归档，不按 `Presenter`、`View`、`Component` 类型再横向分散。页面内部再按“协调器、节点绑定、渲染、素材、纯 UI 工具”拆分。单个 TypeScript 文件上限为 300 行；接近上限时按职责拆分，不通过压缩格式规避。

### 4.3 数据与 Bundle

- `assets/data/balance/*.json`：战斗常量、成长率、品质倍率、境界区间和生产数值。
- `assets/data/careers/*.json`：职业节点；技能文件位于 `assets/data/careers/skills/`。
- `assets/data/heroes/starting.json`：四名初始修士。
- `assets/data/localization/zh_cn.json`：显示文案和正式术语。
- `assets/bundles/shared/default_profile.json`：新档默认 Profile。
- `assets/bundles/shared/ling_pu_config.json`：灵源院运行时配置。
- `assets/bundles/shared/expedition_preparation.json`：入山整备配置。
- `assets/bundles/map_01|map_02/bundle_manifest.json`：地图 Bundle 清单，目前不是完整地图场景。

数值应从数据表读取，不能在业务代码中另外硬编码一份。逻辑 ID 使用英文小写蛇形命名，显示名不能参与逻辑判断。

## 5. 页面、节点位置与样式文件

Cocos 项目没有 CSS。节点位置、尺寸、字体、颜色和图片引用主要序列化在 `.scene` 与 `.prefab` 中；Presenter 还会在运行时更新状态或创建部分节点。

| 页面模块 | 节点树、位置和基础样式 | 运行时逻辑与动态样式 | 美术资源 |
|---|---|---|---|
| Boot 启动页 | `assets/scenes/Boot.scene` | `presentation/boot/` | 通用资源 |
| 营地全景、建筑 | `assets/bundles/camp/Camp.scene` | `presentation/camp/hall/` | `assets/bundles/camp/`、`camp/buildings/` |
| 顶部 HUD | 当前位于 `Camp.scene/Canvas/SafeAreaRoot/TopHUD` | `presentation/camp/hall/CampHudPresenter.ts`、`ResourceBar.ts` | `camp/ui/top/` |
| 底部 HUD | 当前位于 `Camp.scene/Canvas/SafeAreaRoot/BottomHUD` | `presentation/camp/hall/CampBottomHudPresenter.ts` | `camp/ui/bottom/` |
| NPC 列表与对话 | 当前位于 `Camp.scene` 的 `NpcListPanel`、`NpcDialogPanel` | `presentation/camp/hall/CampNpcPresenter.ts` | 尚无独立 NPC 素材目录 |
| 设置页 | 当前位于 `Camp.scene` 的 `SettingsPanel` | `presentation/camp/hall/CampSettingsPresenter.ts` | 尚无独立设置素材目录 |
| 灵源院 | `camp/prefabs/CampLingPuPage.prefab` | `presentation/camp/ling_pu/` | `camp/ui/ling_pu/`、`camp/ui/common/` |
| 入山整备、编辑队伍、地图选择 | `camp/prefabs/CampExpeditionPage.prefab` | `presentation/camp/expedition/` | `camp/ui/expedition/`、`camp/ui/common/` |
| 野外地图 | 尚无页面场景 | 领域基础位于 `Movement.ts`、`FogOfWar.ts`、`TiledImport.ts` | `map_01/`、`map_02/` 当前只有清单 |
| 战斗 | 尚无页面场景 | `CombatResolver.ts`、`CombatState.ts` 等领域基础 | 战斗表现资源尚未落地 |

在 `.scene` / `.prefab` JSON 中，常见视觉属性对应关系如下：

| 视觉内容 | Cocos 序列化属性或组件 |
|---|---|
| 节点位置 | `cc.Node._lpos` |
| 节点缩放 | `cc.Node._lscale` |
| 节点显示/隐藏 | `cc.Node._active` |
| 宽高和锚点 | `cc.UITransform._contentSize`、`_anchorPoint` |
| 文案、字号、行高和颜色 | `cc.Label` |
| 图片和裁切方式 | `cc.Sprite`、`spriteFrame`、`type` |
| 点击状态 | `cc.Button` |
| 自动布局 | `cc.Widget`、`cc.Layout` |

如果编辑器里能看到节点，优先在对应场景或 Prefab 中调整；如果某个列表项、卡片或颜色只在运行时出现，再查看对应页面目录。入山整备的动态列表、滚动内容、修士卡片和图形占位位于 `presentation/camp/expedition/`，灵源院的节点绑定、动态渲染和 SpriteFrame 替换位于 `presentation/camp/ling_pu/`。

### 5.1 营地三层事实源

| 内容 | 事实源 |
|---|---|
| 逻辑 ID、节点名、Presenter 访问路径 | `assets/scripts/domain/CampSceneContract.ts` |
| 营地共享尺寸、坐标和中文显示名 | `tools/camp-layout-config.mjs` |
| 实际节点树与视觉 | `assets/bundles/camp/Camp.scene` 与 `camp/prefabs/*.prefab` |

Presenter 必须通过 `CAMP_*_PATHS` 常量查找节点，不能在表现层重新内联一份路径字符串。`tools/camp-domain-contract.mjs` 是 Node 工具读取领域契约的桥接层。

### 5.2 当前布局迁移状态

UI 的唯一新设计基准是 `375×817`，但仓库还没有完成旧坐标迁移：

- `Camp.scene`、`settings/v2/packages/project.json`、`ViewportLayout.ts` 和部分工具仍保留旧 `1080×1920` 工程坐标。
- `CampExpeditionPage.prefab` 已按 `375×817` 编排。
- `CampLingPuPage.prefab` 仍保留约 3 倍坐标（根节点约 `1125×2451`）。
- `CampSceneContract.ts` 已描述 `CampPanorama`、`CampTopHud`、`CampBottomHud`、`CampNpcPage`、`CampSettingsPage` 等目标 Prefab；截至 2026-08-02，实际 `prefabs/` 中只有灵源院和入山整备两个页面 Prefab。
- `presentation/camp/hall/CampPresenter.ts` 目前是旧场景兼容安装器，运行时安装大厅 HUD、全景、建筑、NPC 和设置组件；调整前仍应检查 `Camp.scene` 的实际组件接线。

`1080×1920` 只能视为待迁移的旧 Cocos 工程坐标，不能继续作为新 UI 或美术尺寸基准。

## 6. `Docs/`：产品、技术和制作文档

```text
Docs/
├── 01_技术实现方案.md             实现架构、数据流、存档和工具链
├── 02_美术设计规范.md             像素规格、色彩、角色、场景与 UI 风格
├── 03_视觉特效方案.md             战斗、地图和 UI 特效
├── 04_动画制作规范.md             帧率、状态机、Aseprite 与导出规则
├── 05_地图与关卡编辑方案.md       地图尺寸、Tile、迷雾、POI 与 Tiled 流程
├── 06_游戏策划案.md               世界观、核心循环、系统总设计和术语转译
├── 07_分阶段产品需求文档_PRD.md   PRD 总入口和事实源表
├── 08_开发进度与待办.md           正式项目阶段状态与 Demo 后待办
├── 09_编辑器操作清单.md           必须在 Cocos 编辑器中完成的人工步骤
├── 13_数值设计方案.md             成长、战斗和灵源院经济设计
├── 14_美术素材制作总清单.md       美术分册总入口
├── Demo/                           D0/D1 范围、前后端技术、API、进度与验收
├── PRD/                            PRD-00 至 PRD-12 正式系统需求
└── ArtAssets/                      营地、HUD、灵源院和入山整备素材清单
```

`Docs/PRD/` 规定正式产品“做什么、何时做、怎样验收”；`Docs/Demo/` 负责从正式规则中裁剪当前 Demo，并独立维护其技术、API、进度和验收。Demo 日常进度只更新 `Docs/Demo/05_Demo开发进度与待办.md`，正式阶段状态才更新根 `Docs/08_开发进度与待办.md`。

## 7. `tools/`：工程脚本

| 类别 | 主要脚本 | 用途 |
|---|---|---|
| 类型与测试门禁 | `typecheck.mjs`、`verify-gate.mjs` | Cocos TypeScript 检查和阶段门禁 |
| 数据校验 | `validate-data.mjs` | 数据表结构和产品约束校验 |
| 场景校验 | `validate-scene.mjs`、`check-camp-layout.mjs` | Camp 场景、Prefab、节点路径与布局检查 |
| Camp 编辑 | `edit-camp-scene.mjs` | 修改已有节点的数据属性并自动备份；对应 `pnpm edit:camp` |
| 场景生成 | `gen-boot-scene.mjs`、`gen-camp-scene.mjs`、`scene-builder.mjs` | 场景缺失时的初始化；Camp 生成器不得覆盖正式场景 |
| 契约桥接 | `camp-domain-contract.mjs`、`camp-layout-config.mjs` | tools 侧复用节点契约和布局配置 |
| Bundle | `configure-bundles.mjs` | 配置 Cocos Asset Bundle |
| Web 构建与预览 | `build-web.mjs`、`serve-build.mjs` | 命令行构建与静态预览 |
| 数值报表 | `balance-model.mjs`、`build-balance-workbook.mjs`、`print-balance.mjs` | 从 JSON 生成只读数值视图 |
| 美术报表 | `build_art_asset_gap_workbook.mjs` | 生成美术素材缺口表 |
| 底层辅助 | `write-scene.mjs`、`uuid-compress.mjs`、`xlsx-writer.mjs` | 安全写场景、UUID 压缩和表格生成 |

日常修改正式 Camp 场景不得使用 `gen-camp-scene.mjs` 整体重生成。修改已有节点的位置、尺寸、颜色或已导入 Sprite 时使用 Cocos 编辑器或 `pnpm edit:camp`；新建节点、资源和 Prefab 必须在编辑器中完成，让 Cocos 分配 UUID。

## 8. `tests/`：不进入游戏包的测试

```text
tests/
├── domain/           战斗、地图、迷雾、职业、灵源院、编队等纯逻辑测试
├── services/         存档、Bundle、生命周期、时间和全局状态测试
├── register.mjs      Node 测试注册入口
├── resolver.mjs      兼容 `db://` 与省略扩展名的测试解析器
└── package.json      测试环境声明
```

测试放在 `assets/` 外，避免进入 Web 构建产物。Node 使用 strip-only 模式执行 TypeScript，因此工程代码禁止使用 `enum`、`namespace` 和构造函数参数属性；纯类型依赖必须写 `import type`。

## 9. 美术、第三方素材与输出

### `ArtSource/`

保存原始美术、生成过程和可追溯源文件。目前包含营地 GPT Image 生成工作目录。这里的文件不是 Cocos 运行时资源；确认尺寸、透明通道、授权和命名后，成品才进入 `assets/`。

### `ThirdParty/DemoAssets/`

保存 CC0/OFL Demo 素材、原始压缩包、来源页面快照与 SHA-256。详细来源见 `ThirdParty/DemoAssets/README.md`。第三方原始素材不得直接混入原创素材目录，正式发布前必须逐项确认授权；Ark Pixel 字体发布时必须附带 `OFL.txt`。

### `assets/third_party/`

只放已经筛选并导入 Cocos、确实会在运行时使用的第三方资源。目前包含 Kenney Pixel UI 的部分素材。它与根目录 `ThirdParty/` 的“原始素材仓库”职责不同。

### `outputs/`

保存可再生成的报表和视觉检查产物，例如数值总表、美术缺口表、营地背景分段预览和建筑比例检查图。不要让业务代码依赖这里的文件，数值事实源仍是 `assets/data/balance/*.json`。

## 10. UI、像素和资源约定

- 玩家可见 UI 与页面布局只使用 `375×817` 逻辑基准。
- 顶部、底部 HUD 固定在视窗内，不随营地横滑。
- 营地全景逻辑宽度为 `1050`，只有背景、建筑和前景层移动。
- `360×640` 只可作为地图、角色和 Tile 等世界素材的内部参考，不能决定 UI 画布。
- 世界 Tile 为 `16×16` 源像素、`48×48` 逻辑显示尺寸。
- UI 交付必须同时注明逻辑显示尺寸与 PNG 实际尺寸，例如“逻辑 `50×50`、交付 `150×150 (@3x)`”。
- `.creator/default-meta.json` 已将图片默认采样设为 `nearest`；Pixel Art 禁止线性过滤。
- 新增资源、目录或脚本必须让 Cocos Creator 导入一次并生成 `.meta`；`assets/**/*.meta` 必须提交，禁止手写或伪造。移动已有 Component 时必须连同原 `.meta` 一起移动，以保持 UUID 和场景引用稳定。

## 11. 不可破坏的架构边界

战斗保持单向数据流：

```text
CombatCommand → 结算器 → CombatEvent → 表现层
```

表现层只消费战斗事件，不能反向决定伤害，否则会破坏加速、跳过动画、回放和自动化测试。

七维内部字段名已经冻结：

```text
strength magic technique speed constitution armor resistance
```

显示文案可以使用《昆吾禁地》的“力道、法力、神识、遁速、肉身、护体、定力”，但普通文案调整不能顺手修改内部字段、事件或存档 ID。任何内部改名必须按全量数据与存档迁移处理。

参考游戏中的口语在进入 PRD、UI、本地化表或美术提示词前，必须先转换为《昆吾禁地》正式术语。完整映射以 `Docs/06_游戏策划案.md` §2.1 为准。

## 12. Git、生成目录与协作注意事项

- 只使用 `pnpm-lock.yaml`；不要生成 `package-lock.json` 或 `yarn.lock`。
- `assets/**/*.meta`、`settings/` 和项目级构建模板必须提交。
- `library/`、`temp/`、`local/`、`profiles/`、`build/`、`dist/` 和 `node_modules/` 不提交。
- 大型源美术、字体、音频和第三方压缩包由 Git LFS 管理。
- 工作区可能同时存在人工或其他代理的未提交修改；修改前先检查 `git status`，不要覆盖无关变更。
- 使用 Codex 时，验证、构建、预览和 Cocos 视觉验收由用户执行；除非用户在当前任务中明确要求，不由 Codex 自动运行。

## 13. 常见需求从哪里开始

| 想做的事 | 首先查看 |
|---|---|
| 确认需求和验收 | `Docs/07_分阶段产品需求文档_PRD.md` → 对应 `Docs/PRD/*` |
| 查看 Demo 当前做到哪里 | `Docs/Demo/05_Demo开发进度与待办.md` |
| 查看正式项目阶段状态 | `Docs/08_开发进度与待办.md` |
| 调整营地主大厅节点 | `assets/bundles/camp/Camp.scene` |
| 调整灵源院页面 | `CampLingPuPage.prefab` + `assets/scripts/presentation/camp/ling_pu/` |
| 调整入山整备页面 | `CampExpeditionPage.prefab` + `assets/scripts/presentation/camp/expedition/` |
| 替换营地建筑或背景图 | `assets/bundles/camp/buildings/`、`env_camp_panorama_bg.png` |
| 调整 HUD 图标 | `assets/bundles/camp/ui/top/`、`ui/bottom/` |
| 修改战斗公式 | 对应 PRD → `assets/scripts/domain/CombatFormulas.ts` / `CombatResolver.ts` → `assets/data/balance/` |
| 修改地图规则 | PRD-05 → `assets/scripts/domain/MapTypes.ts`、`Movement.ts`、`FogOfWar.ts` |
| 修改存档 | PRD-10 → `assets/scripts/services/Save*`、`ProfileCodec.ts`、`default_profile.json` |
| 修改本地化文案 | `assets/data/localization/zh_cn.json` |
| 新增或检查第三方素材 | `ThirdParty/DemoAssets/README.md` 和许可快照 |
| 修改 Cocos 工程分辨率或 Bundle | `settings/`、`tools/configure-bundles.mjs`；先阅读技术方案 |
