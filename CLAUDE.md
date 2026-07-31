# 《昆吾禁地》工程约定

本文件是本仓库的长期工程约定，适用于整个仓库，只记录容易踩错的部分，不替代产品与
技术文档。`AGENTS.md` 是同一份约定的 Codex 侧镜像；本文件变更后应同步更新它。

## 项目与事实源

- 项目：竖屏 2D 像素修仙游戏。
- 技术栈：Cocos Creator 3.8.7、TypeScript、WebGL，Web Mobile 首发。
- 产品需求以 `Docs/PRD/` 为准；唯一事实源表见
  `Docs/07_分阶段产品需求文档_PRD.md` §3。
- 实现方式以 `Docs/01_技术实现方案.md` 为准。
- 若本文件与产品或技术文档冲突，以对应事实源为准。

## 常用命令

包管理器只使用 pnpm，不使用 npm 或 yarn；版本由 `packageManager` 锁定。

```bash
pnpm check          # typecheck + 单测 + 数据校验 + 场景校验；提交前运行
pnpm test           # 领域层单测，Node 原生 runner，不依赖引擎
pnpm test:watch
pnpm typecheck      # 使用 Cocos 自带 tsc 检查 assets/ 与 tests/
pnpm validate:data  # 构建前数据表校验（PRD-10 §6 七条规则）
pnpm validate:scene # 场景与 Prefab 的结构、脚本引用和产品约束校验
pnpm build:web      # 命令行构建 Web Mobile
pnpm serve          # 本地预览构建产物，并打印手机可访问的局域网地址
pnpm verify:gate    # 门禁自动化验证（体积、安全区、分包、错误码等 11 项）
```

- 执行 `pnpm build:web` 前必须先关闭 Cocos Creator，避免工程锁冲突。
- 编辑器预览地址通常为 `http://127.0.0.1:7456/`。
- 修改场景文件后必须先在编辑器按 `Cmd+R` 刷新资源，否则编辑器会继续使用旧缓存，
  症状是「明明改了却看不到」。
- Cocos 安装在非默认路径时，通过 `COCOS_APP` 环境变量指定。
- 工程不安装独立 `typescript` 依赖。`pnpm typecheck` 使用 Cocos 自带版本以保证版本
  一致；引擎自身的 `.d.ts` 不满足 strict，`tools/typecheck.mjs` 按路径过滤，只对本
  工程代码判定失败。
- 打开工程可用 Cocos Dashboard 添加本目录，或运行：
  `/Applications/Cocos/Creator/3.8.7/CocosCreator.app/Contents/MacOS/CocosCreator --project .`

## Cocos 资源规则

- 新增脚本后必须让 Cocos Creator 导入一次，由编辑器生成 `.meta`。
- `assets/**/*.meta` 必须提交；缺失会导致全项目引用断裂。
- 禁止手写或用脚本伪造 `.meta`。UUID 必须由编辑器分配，伪造的 UUID 与编辑器后续
  分配的不一致，会造成引用错乱。
- `library/`、`temp/`、`local/`、`profiles/`、`build/` 是生成目录，已在
  `.gitignore`，不应提交。

### Camp 场景的修改方式

`assets/bundles/camp/Camp.scene` 与 `prefabs/*.prefab` 可以用脚本改，也可以在编辑器改。
分界不是「谁有权改」，而是「哪些操作需要编辑器分配 UUID」。

**可以用脚本改**（走 `pnpm edit:camp`，见下）：

- 节点尺寸、位置、缩放、`active`
- 删除已有组件
- 把 Sprite 指向**已导入**的图片（从现有 `.meta` 读 UUID）
- Label 文案、颜色等纯数据属性

**必须在编辑器做**（UUID 只能由编辑器分配，伪造会导致全项目引用错乱）：

- 新增图片、字体等资源，生成 `.meta`
- 新建节点、另存 Prefab
- 确认视觉效果——摆位置需要看着背景图判断，脚本只能算几何

```bash
pnpm edit:camp --size yi_shi_dian=720x480 --pos yi_shi_dian=0,490
pnpm edit:camp --remove-component TopHUD:cc.Sprite
pnpm edit:camp --sprite ling_pu=env_camp_building_ling_pu
pnpm edit:camp --dry-run ...        # 只打印将要发生的变更
```

`tools/edit-camp-scene.mjs` 每次改动前自动备份到 `local/scene-backups/`，改完自动跑
`validate:scene`，校验失败自动回滚。删组件时会重排整个数组并同步重写全部 `__id__`
引用，因此不会留下孤儿条目。

- `tools/gen-camp-scene.mjs` 只是场景完全缺失时的灰盒初始化脚本；仍然禁止用它整体
  覆盖正式场景（加 `--force` 会直接拒绝）。日常改动用 `pnpm edit:camp`。
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

依据技术方案 §10，严格保持：

```text
CombatCommand → 结算器 → CombatEvent → 表现层
```

表现层只消费事件，不得反向决定伤害。破坏这条会同时失效：加速战斗、跳过动画、
战斗回放和自动化测试。

### 七维字段名冻结

依据技术方案 §6，以下字段名不可直接改名：

```text
strength magic technique speed constitution armor resistance
```

数据表、存档、技能定义和探索检定依赖这七个键。任何改名都必须按全量数据与存档迁移
处理，不能作为普通文案修改。

### 坐标边界

依据技术方案 §9.1：

- 领域层只使用 `GridCoord`。
- 格子坐标与像素坐标不得混用。
- 像素换算只由表现层负责。

### 数据与标识

- 数值一律从数据表读取，不在业务代码中硬编码（技术方案 §1）。
- 每个职业节点必须恰好拥有 3 个主动技能，由 Schema 校验保证。
- 逻辑 ID 使用英文小写蛇形命名。
- 禁止用显示名做逻辑判断。
- 授权名与原创名通过本地化表切换，不能改变存档 ID（IP 双轨，见策划案 §2）。

## 目录职责

```text
assets/scripts/
├─ domain/        无引擎依赖的纯 TypeScript，可直接单测
├─ services/      八个持久服务（技术方案 §4.1）
├─ repositories/  数据表加载与存档读写
└─ presentation/  Cocos Component、Presenter、ViewModel
tests/            单测；位于 assets/ 外，避免进入 Web 构建产物
```

新增代码应遵守上述分层，领域逻辑不得反向依赖 Cocos 表现层。

## 导入与 TypeScript 限制

跨目录导入使用 Cocos 原生 `db://` 前缀，不在 `tsconfig.json` 中自定义 `paths`：

```ts
import { GridCoord } from 'db://assets/scripts/domain/GridCoord';
```

- `temp/tsconfig.cocos.json` 会注入 `db://assets/*` 映射，自定义 `paths` 会整体覆盖它。
- Node 测试通过 `tests/resolver.mjs` 在测试期兼容 `db://` 与省略扩展名的相对导入；
  不要为了迁就 Node 修改 `assets/` 内的导入风格，那会破坏引擎解析。
- 测试类型检查使用 `tsconfig.tests.json`，不继承根配置，因为测试运行在 Node 而非引擎。
- 仅用于类型的导入必须写 `import type`。类型擦除不移除值导入，对类型别名（如
  `Attributes`）会在运行期报「does not provide an export named」。
- 不使用构造函数参数属性，例如 `constructor(readonly width: number)`；改为显式声明
  字段并在构造函数体赋值。
- 不使用 TypeScript `enum` 或 `namespace`。枚举语义用 `as const` 数组和联合类型。
- 上述语法限制来自 Node strip-only 模式，违反时会出现
  `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`。

## 像素规格

- 设计画布：1080×1920（9:16）。
- 像素内部参考：360×640，以整数 3 倍放大。
- 世界 Tile：16×16 源像素，对应 48×48 屏幕像素。
- `.creator/default-meta.json` 已将图片默认 `filterMode` 设为 `nearest`，新导入的
  像素图不必手动改。
- 禁止对 Pixel Art 使用线性过滤；缩放必须保持像素清晰。

## 第三方素材

- `ThirdParty/DemoAssets/` 中只允许 CC0 或 OFL 素材，并保留来源、许可快照和 SHA-256。
- 第三方素材不得混入 `assets/` 原创素材目录。
- 发布 Ark Pixel 字体时必须随附 `OFL.txt`。
- 大文件使用 Git LFS（见 `.gitattributes`）；首次 clone 后先执行 `git lfs install`。

## 修改与验证原则

- 开始修改前先阅读相关 PRD 和技术方案，不凭页面现状猜测产品规则。
- 保留工作区中已有且与当前任务无关的用户或其他代理改动。
- 修改范围应与用户请求一致，不顺带重构无关模块。
- 日常代码、页面或场景迭代不执行完整 Web 构建。改完后在 Cocos Creator 中按 `Cmd+R`
  刷新资源，再点击运行预览即可。
- 新增脚本时仍须先让 Cocos Creator 导入并生成 `.meta`，再运行预览。
- 完成一个功能模块后运行 `pnpm check`，检查类型、单测、数据和场景。
- 只有修改构建模板、Bundle 分包或发布资源，或者进行阶段验收、提交前最终验证时，
  才运行 `pnpm build:web` 和 `pnpm verify:gate`。
- 不要在每次代码修改后重复执行「完整构建 + Web 预览 + 门禁验证」。验证强度应与修改
  风险和当前交付阶段相匹配。
