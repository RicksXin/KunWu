# 《昆吾禁地》Codex 项目记忆

本文件是 Codex 在本仓库中的长期工程约定，依据根目录 `CLAUDE.md` 建立。
适用于整个仓库。若本文件与产品或技术文档冲突，以对应事实源为准；若
`CLAUDE.md` 的工程约定发生变化，应同步更新本文件。

## 项目与事实源

- 项目：竖屏 2D 像素修仙游戏。
- 技术栈：Cocos Creator 3.8.7、TypeScript、WebGL，Web Mobile 首发。
- 产品需求以 `Docs/PRD/` 为准；唯一事实源表见
  `Docs/07_分阶段产品需求文档_PRD.md` §3。
- 实现方式以 `Docs/01_技术实现方案.md` 为准。
- `CLAUDE.md` 与本文件只记录容易踩错的工程约定，不替代 PRD。

## 常用命令

包管理器只使用 pnpm，不使用 npm 或 yarn；版本由 `packageManager` 锁定。

```bash
pnpm check          # typecheck + 单测 + 数据校验 + 场景校验；提交前运行
pnpm test           # 领域层单测，Node 原生 runner，不依赖引擎
pnpm test:watch
pnpm typecheck      # 使用 Cocos 自带 tsc 检查 assets/ 与 tests/
pnpm validate:data  # 构建前数据表校验
pnpm build:web      # 命令行构建 Web Mobile
pnpm serve          # 本地预览构建产物
pnpm verify:gate    # 门禁自动化验证
```

- 执行 `pnpm build:web` 前必须先关闭 Cocos Creator，避免工程锁冲突。
- 编辑器预览地址通常为 `http://127.0.0.1:7456/`。
- 修改场景文件后，必须先在编辑器中按 `Cmd+R` 刷新资源，避免继续使用旧缓存。
- Cocos 安装在非默认路径时，通过 `COCOS_APP` 环境变量指定。
- 工程不安装独立 `typescript` 依赖。`pnpm typecheck` 使用 Cocos 自带版本；
  `tools/typecheck.mjs` 会过滤引擎 `.d.ts` 中与本项目无关的 strict 报错。
- 打开工程可用 Cocos Dashboard 添加本目录，或运行：
  `/Applications/Cocos/Creator/3.8.7/CocosCreator.app/Contents/MacOS/CocosCreator --project .`

## Cocos 资源规则

- 新增脚本后必须让 Cocos Creator 导入一次，由编辑器生成 `.meta`。
- `assets/**/*.meta` 必须提交；缺失会导致资源引用断裂。
- 禁止手写或用脚本伪造 `.meta`。UUID 必须由编辑器分配，否则后续导入可能
  造成 UUID 不一致和引用错乱。
- `library/`、`temp/`、`local/`、`profiles/`、`build/` 是生成目录，不应提交。

### Camp 场景的修改方式

`assets/bundles/camp/Camp.scene` 与 `prefabs/*.prefab` 可以用脚本改，也可以在编辑器改。
分界不是「谁有权改」，而是「哪些操作需要编辑器分配 UUID」。

**可以用脚本改**（走 `pnpm edit:camp`）：节点尺寸、位置、缩放、`active`、删除已有组件、
把 Sprite 指向已导入的图片、Label 文案与颜色等纯数据属性。

**必须在编辑器做**：新增资源并生成 `.meta`、新建节点、另存 Prefab、确认视觉效果。
UUID 只能由编辑器分配，伪造会导致全项目引用错乱。

```bash
pnpm edit:camp --size yi_shi_dian=720x480 --pos yi_shi_dian=0,490
pnpm edit:camp --remove-component TopHUD:cc.Sprite
pnpm edit:camp --sprite ling_pu=env_camp_building_ling_pu
pnpm edit:camp --dry-run ...
```

`tools/edit-camp-scene.mjs` 改前自动备份到 `local/scene-backups/`，改完自动跑
`validate:scene`，失败自动回滚。

- `tools/gen-camp-scene.mjs` 只是场景完全缺失时的灰盒初始化脚本；禁止用它整体覆盖
  正式场景（`--force` 会直接拒绝）。
- 不要写新的一次性 `patch-camp-*.mjs`。需要批量改就多传几个参数给 `edit:camp`。
- 校验脚本只检查关键结构、引用和产品约束，不锁死每个节点的具体坐标。

### 营地配置的三处分工

改营地时先认清改的是哪一层，否则很容易出现两份 id 各自漂移：

| 内容 | 事实源 | 说明 |
|---|---|---|
| 逻辑 id、节点名、Presenter 访问路径 | `assets/scripts/domain/CampSceneContract.ts` | 表现层与 `tools/` 共用同一份 |
| 尺寸、坐标、中文显示名 | `tools/camp-layout-config.mjs` | 按 id 建表，不自带 id 列表 |
| 实际节点树与视觉 | `Camp.scene` 与 `prefabs/*.prefab` | 以编辑器保存结果为准 |

- Presenter 一律通过 `CAMP_*_PATHS` 常量取节点路径，禁止内联路径字符串。
  内联的那份不会被校验，改名后只在运行期打一行 `console.error`。
- `tools/camp-domain-contract.mjs` 是 tools 侧读取领域层契约的桥；用到它的脚本
  必须以 `node --experimental-strip-types` 运行。
- `pnpm validate:scene` 会交叉核对上表前两层的键完全一致，并逐条验证
  `presenterPaths` 在场景与 Prefab 中真实存在。

## 不可违反的架构约束

### 战斗数据单向流

严格保持：

```text
CombatCommand → 结算器 → CombatEvent → 表现层
```

表现层只消费事件，不得反向决定伤害。否则会破坏加速战斗、跳过动画、
战斗回放和自动化测试。

### 七维字段名冻结

以下字段名不可直接改名：

```text
strength magic technique speed constitution armor resistance
```

数据表、存档、技能定义和探索检定依赖这些键。任何改名都必须按全量数据与
存档迁移处理，不能作为普通文案修改。

### 坐标边界

- 领域层只使用 `GridCoord`。
- 格子坐标与像素坐标不得混用。
- 像素换算只由表现层负责。

### 数据与标识

- 数值一律从数据表读取，不在业务代码中硬编码。
- 每个职业节点必须恰好拥有 3 个主动技能，由 Schema 校验保证。
- 逻辑 ID 使用英文小写蛇形命名。
- 禁止用显示名做逻辑判断。
- 授权名与原创名通过本地化表切换，不能改变存档 ID。

## 目录职责

```text
assets/scripts/
├─ domain/        无引擎依赖的纯 TypeScript，可直接单测
├─ services/      持久服务
├─ repositories/  数据表加载与存档读写
└─ presentation/  Cocos Component、Presenter、ViewModel
tests/            单测；位于 assets/ 外，避免进入 Web 构建产物
```

新增代码应遵守上述分层，领域逻辑不得反向依赖 Cocos 表现层。

## 导入与 TypeScript 限制

跨目录导入使用 Cocos 原生 `db://` 前缀，不在 `tsconfig.json` 中自定义
`paths`：

```ts
import { GridCoord } from 'db://assets/scripts/domain/GridCoord';
```

- `temp/tsconfig.cocos.json` 会注入 `db://assets/*` 映射，自定义 `paths` 会覆盖它。
- Node 测试通过 `tests/resolver.mjs` 兼容 `db://` 与省略扩展名；不要为了迁就
  Node 修改 `assets/` 内的导入风格。
- 测试类型检查使用 `tsconfig.tests.json`，不继承根配置，因为测试运行在 Node。
- 仅用于类型的导入必须写 `import type`，避免类型擦除后产生无效的运行时导入。
- 不使用构造函数参数属性，例如 `constructor(readonly width: number)`；改为显式
  声明字段并在构造函数体赋值。
- 不使用 TypeScript `enum` 或 `namespace`。枚举语义用 `as const` 数组和联合类型。
- 上述语法限制来自 Node strip-only 模式，违反时会出现
  `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`。

## UI 视窗与像素规格

以下显示口径由用户于 2026-07-31 明确确认，后续 UI、场景和美术工作不得再把
历史尺寸混为一套：

- UI 唯一设计基准和玩家可见窗口为 `375×817`。顶部、底部 HUD 固定在该视窗内，
  不随大厅横滑。
- 营地全景逻辑宽度为 `375×2.8=1050`；只有全景背景、建筑和相应前景层横向移动。
- `360×640` 不参与 UI 布局或 UI 素材尺寸推导。它最多只作为地图、角色、Tile 等
  世界像素素材的内部参考，不能覆盖 `375×817` 的 UI 事实源。
- `1080×1920` 是早期工程配置，不是当前 UI 设计基准。仓库在完成迁移前仍可能存在
  该坐标下的场景节点和适配代码；修改时必须明确标注“旧 Cocos 工程坐标”和
  “375×817 UI 逻辑尺寸”，禁止静默换算或继续扩散旧口径。
- UI 美术清单和 GPT Image 提示词必须为每张素材分别写明：`375×817` 基准下的
  逻辑显示尺寸，以及最终交付 PNG 的实际像素尺寸。若使用 3 倍图，必须明确写成
  例如“逻辑 `50×50`、交付 `150×150 (@3x)`”，不能只写一个含义不明的尺寸。
- 世界 Tile 当前仍为 `16×16` 源像素、`48×48` 逻辑显示尺寸；该约定不反向决定 UI
  画布尺寸。
- `.creator/default-meta.json` 已将图片默认 `filterMode` 设为 `nearest`。
- 禁止对 Pixel Art 使用线性过滤；缩放必须保持像素清晰。

## 第三方素材

- `ThirdParty/DemoAssets/` 中只允许 CC0 或 OFL 素材，并保留来源、许可快照和
  SHA-256。
- 第三方素材不得混入 `assets/` 原创素材目录。
- 发布 Ark Pixel 字体时必须随附 `OFL.txt`。
- 大文件使用 Git LFS；首次 clone 后先执行 `git lfs install`。

## 修改与验证原则

- 开始修改前先阅读相关 PRD 和技术方案，不凭页面现状猜测产品规则。
- 保留工作区中已有且与当前任务无关的用户或其他代理改动。
- 修改范围应与用户请求一致，不顺带重构无关模块。
- 所有验证均由用户亲自操作。除非用户在当前任务中明确要求 Codex 验证，否则
  Codex 不得主动运行 `pnpm check`、类型检查、单测、数据/场景校验、构建、预览，
  也不得代替用户在 Cocos Creator 或浏览器中进行运行和视觉验收。
- Codex 完成修改后，应向用户说明需要刷新的资源、建议执行的验证命令与人工验收
  要点，但只提供步骤，不代为执行。
- 新增脚本或资源时，Codex 应提醒用户让 Cocos Creator 导入并生成 `.meta`；是否
  刷新、运行预览和验收均由用户决定并操作。
- 用户明确要求 Codex 验证时，日常代码、页面或场景迭代不执行完整 Web 构建；只有
  修改构建模板、Bundle 分包或发布资源，或者进行阶段验收、提交前最终验证时，才
  运行 `pnpm build:web` 和 `pnpm verify:gate`。
