# 《昆吾禁地》长期工程约定

本文件是本仓库唯一完整的长期工程记忆，适用于 Codex、Claude Code 和其他开发代理。
它只记录稳定且容易踩错的约定，不替代策划、PRD、技术方案、Demo 待办或具体模块设计。

## 1. 项目与事实源

- 项目：竖屏 2D 像素修仙游戏。
- 技术栈：Cocos Creator 3.8.7、TypeScript、WebGL；Web Mobile 首发。
- `Docs/1.0策划案/` 是 1.0 前四章正式版本的源头策划，`Docs/PRD/` 是该正式版本面向
  产品实现、交互和验收的落地文档。
- 策划到实现严格单向派生：

```text
Docs/1.0策划案 → Docs/PRD → 实现与验收
```

- 职业、装备、技能、品阶、等级等规则先改策划，再同步到已有对应 PRD。
- 只修改页面、交互、异常处理或验收口径时，只改 PRD，不反向改写策划。
- 策划与 PRD 冲突时以策划为源头，并明确标记待同步差异，不让实现者自行二选一。
- 技术实现以 `Docs/01_技术实现方案.md` 为准；PRD 模块事实源表见
  `Docs/07_分阶段产品需求文档_PRD.md` §3。
- 0.1 是 Demo 版本；D0/D1 只是 0.1 Demo 内部制作阶段，不是产品版本号。其范围、技术、
  进度和验收统一从 `Docs/Demo/` 进入。
- 1.0 策划、PRD 与 0.1 Demo 文档严格隔离，互不充当范围、进度、需求编号或验收事实源，
  也不因一方变化自动修改另一方。修改 1.0 策划并同步 PRD 时，不自动扩大或改写 0.1 Demo。

## 2. 常用命令与环境

包管理器只使用 pnpm，版本由 `packageManager` 锁定。

```bash
pnpm check          # typecheck + 单测 + 数据校验 + 场景校验
pnpm test           # 领域层单测
pnpm test:watch
pnpm typecheck      # 使用 Cocos 自带 tsc
pnpm validate:data
pnpm build:web      # Web Mobile 构建
pnpm serve          # 预览构建产物
pnpm verify:gate    # 阶段或发布门禁
```

- 执行 `pnpm build:web` 前关闭 Cocos Creator，避免工程锁冲突。
- 编辑器预览通常为 `http://127.0.0.1:7456/`。
- 修改场景后，在编辑器中按 `Cmd+R` 刷新资源，再运行预览。
- Cocos 非默认安装路径通过 `COCOS_APP` 指定。
- 工程不安装独立 `typescript`；`tools/typecheck.mjs` 使用 Cocos 自带版本并过滤无关引擎声明报错。
- 可从 Cocos Dashboard 添加本目录，也可运行：

```bash
/Applications/Cocos/Creator/3.8.7/CocosCreator.app/Contents/MacOS/CocosCreator --project .
```

## 3. Cocos 资源与 Camp 场景

- 新增脚本或资源后必须由 Cocos Creator 导入并生成 `.meta`。
- `assets/**/*.meta` 必须提交；禁止手写或用脚本伪造 `.meta` 和 UUID。
- 移动已有 Component 或资源时必须连同 `.meta` 一起移动，以保留 UUID 和场景引用。
- `library/`、`temp/`、`local/`、`profiles/`、`build/` 是生成目录，不应提交。
- `Camp.scene` 与 `prefabs/*.prefab` 是实际节点树和视觉的事实源。
- 已有节点的位置、尺寸、缩放、显隐、组件属性和已导入 Sprite 引用可用
  `pnpm edit:camp` 修改；新增资源、节点、Prefab 和视觉确认必须在编辑器完成。
- `tools/gen-camp-scene.mjs` 只用于场景完全缺失时的灰盒初始化，禁止覆盖正式场景。
- 不新增一次性 `patch-camp-*.mjs`；批量纯数据修改统一扩展或调用 `edit:camp`。

营地配置分工如下：

| 内容 | 事实源 |
|---|---|
| 逻辑 id、节点名、Presenter 路径 | `assets/scripts/domain/CampSceneContract.ts` |
| 尺寸、坐标、中文显示名 | `tools/camp-layout-config.mjs` |
| 实际节点树与视觉 | `Camp.scene` 与 `prefabs/*.prefab` |

- Presenter 通过 `CAMP_*_PATHS` 取节点路径，禁止内联路径字符串。
- tools 侧通过 `tools/camp-domain-contract.mjs` 读取领域契约，并以
  `node --experimental-strip-types` 运行。
- `pnpm validate:scene` 负责交叉核对配置键、路径和场景/Prefab 引用。

## 4. 不可违反的架构约束

### 战斗数据流

```text
CombatCommand → 结算器 → CombatEvent → 表现层
```

表现层只消费事件，不反向决定伤害，否则会破坏加速、跳过动画、回放和自动化测试。

### 七维与坐标

- 七维内部字段名冻结：

```text
strength magic technique speed constitution armor resistance
```

- 普通文案可使用昆吾正式术语；内部键改名必须按数据、接口和存档迁移处理。
- 领域层只使用 `GridCoord`，不得混用格子坐标与像素坐标；像素换算只在表现层完成。

### 数据与标识

- 数值从数据表读取，不在业务代码硬编码。
- 每个职业节点恰好拥有 3 个主动技能，由 Schema 校验。
- 逻辑 ID 使用英文小写蛇形命名；禁止用显示名做逻辑判断。
- 授权名与原创名通过本地化切换，不改变存档 ID。
- 用户引用外部游戏术语时，写入文档、UI、本地化或素材前，先按
  `Docs/06_游戏策划案.md` §2.1 转换为《昆吾禁地》正式术语。
- 既有 `Hero`、`Expedition`、`stamina` 等内部标识暂时保持稳定；文案调整不得顺手触发迁移。

## 5. 目录与 TypeScript 约定

```text
assets/scripts/
├─ domain/        无引擎依赖的领域逻辑，可直接单测
├─ services/      应用流程与持久服务
├─ repositories/  数据表加载、映射与存档读写
└─ presentation/  Cocos Component、Presenter、ViewModel
tests/            位于 assets 外，避免进入 Web 构建产物
```

- 领域层不得反向依赖 Cocos 表现层。
- `presentation/` 按玩家可识别的页面模块组织；页面内部再拆协调器、节点绑定、渲染、
  素材和共享 UI 工具。
- `domain/`、`services/` 按架构职责组织；复杂公共模块使用“稳定入口文件 + 同名功能子目录”。
- 单个 TypeScript 文件不得超过 300 行；接近上限按职责拆分，不得压缩格式规避。
- 跨目录导入使用 Cocos 原生 `db://`，不在 `tsconfig.json` 自定义 `paths`。
- 仅用于类型的导入写 `import type`。
- 不使用 TypeScript `enum`、`namespace` 或构造函数参数属性；枚举语义使用
  `as const` 数组和联合类型，兼容 Node strip-only 模式。

## 6. 0.1 Demo 与 1.0 正式项目

- 0.1 只制作 Demo；D0 可玩样机与 D1 公开切片是其内部交付阶段。
- Demo 执行文档全部位于 `Docs/Demo/`；进度唯一事实源是
  `Docs/Demo/05_Demo开发进度与待办.md`。
- 1.0 是覆盖前四章的第一个正式版本，包含招贤馆；正式策划只从 `Docs/1.0策划案/` 进入，
  正式产品落地只从 `Docs/PRD/` 进入。
- `Docs/PRD/` 只落地 1.0 正式版本；不把 D0/D1 或旧 P1/P2 的 Demo 阶段编号、进度或验收
  写入 1.0 PRD。
- `Docs/08_开发进度与待办.md` 只维护 P3 以后正式阶段的冻结、解冻和排期。
- 0.1 Demo 可裁剪 1.0 正式范围但不得改写系统规则；规则变化仍须先走 1.0 策划与 PRD，
  只有用户明确要求同步时才修改 Demo 文档。
- D0/D1 以本地可玩闭环为优先，不强制建立服务端设计、API Port、HTTP DTO、Local Adapter
  四件套，但仍保持纯领域层、Presenter 不修改业务真相、重要操作原子保存和刷新恢复。
- D1 通过后的正式需求按未来独立服务端设计，并在实现前产出互相链接的：客户端技术设计、
  服务端技术设计、API 契约、本地接口实现与验收清单。

正式项目的客户端调用链固定为：

```text
Presenter → Application Service → API Port
          → Local Adapter / HTTP Adapter
          → Response → Service 更新 GameState、持久化并发事件 → Presenter 刷新
```

- Presenter 不直接调用 `fetch`、拼 DTO 或修改权威业务状态。
- API Port、DTO、错误类型独立于传输实现；Local/HTTP Adapter 实现同一接口并依赖注入。
- Local Adapter 保持异步 `Promise` 语义，并可模拟成功、业务失败、超时和冲突。
- API DTO、领域模型和存档模型分离，通过 Repository/Mapper 转换。
- 服务端设计须明确数据权威方；账号、交易、付费货币、排行榜和联网结算默认服务端权威。

## 7. Figma 设计稿规范

完整的 Figma 文件索引、主题 Variable、组件状态、评审与 Cocos 交付规则统一从
`Docs/Figma/README.md` 进入；本节只保留长期稳定的最高层约定。

### 事实源与状态

- PRD 决定功能、规则和交互；用户确认的 Figma 决定目标视觉；Cocos Scene/Prefab 是当前实现。
- Figma 页面或版本必须标记 `Draft`、`Review`、`Approved`；只有 `Approved` 可作为实现依据。
- 未经用户确认，不得把 Draft 或 Review 稿直接实现。
- Figma 若改变产品规则或交互，先修改对应策划/PRD；只改变视觉时先确认 Figma，再改 Cocos。

### 画布、布局与组件

- 页面 Frame 使用 `375×817`；营地全景逻辑宽 `1050`。
- Figma 中新增或整理的组件规范板、素材面板与临时设计面板统一放在
  `02｜面板与组件` 页面，不得散落在 `Page 1`；页面成稿仍按页面索引归档。
- 固定 HUD 与横滑内容分层，并明确安全区、固定区、滚动区、遮罩和触控热区。
- 重复 UI 使用 Figma Component/Variant，并建立其与 Cocos Prefab/组件的对应关系。
- 组件按需覆盖 `normal`、`pressed`、`disabled`、`locked`、`selected`、`loading`、
  `empty`、`error` 状态，不用口头约定补缺失状态。
- 颜色、字号、间距、圆角等使用 Variable/Token 管理，避免散落魔法值。
- 图层使用语义名称，避免 `Rectangle 123`；导出资源使用英文小写蛇形命名。
- 文案不得烘焙进背景图；动态内容必须保留独立文本层。

### 像素与交付

- Pixel Art 保持整数像素对齐和整数倍缩放，不使用模糊插值。
- 每张导出图同时标注逻辑显示尺寸和 PNG 实际尺寸，例如：
  `逻辑 50×50、交付 150×150 (@3x)`。
- 每次设计交付至少包含：页面流程、加载/空/异常状态、组件状态、资源导出表，以及
  Figma 节点到 Cocos Prefab/节点的映射。

## 8. UI 视窗与像素规格

- UI 唯一设计基准和玩家可见窗口为 `375×817`；顶部、底部 HUD 固定，不随大厅横滑。
- 营地全景逻辑宽度为 `375×2.8 = 1050`；只有背景、建筑和相应前景层横向移动。
- `360×640` 只可作为地图、角色、Tile 等世界像素素材的内部参考，不参与 UI 布局推导。
- `1080×1920` 是旧 Cocos 工程坐标，不是当前设计基准；迁移时必须明确标注两种口径。
- UI 素材必须同时写逻辑尺寸与交付像素尺寸，不能只写含义不明的单一尺寸。
- 世界 Tile 当前为 `16×16` 源像素、`48×48` 逻辑显示尺寸，不反向决定 UI 画布。
- 图片默认 `filterMode` 为 `nearest`；禁止 Pixel Art 使用线性过滤。

## 9. 第三方素材

- `ThirdParty/DemoAssets/` 只允许 CC0 或 OFL 素材，并保留来源、许可快照和 SHA-256。
- 第三方素材不得混入 `assets/` 原创素材目录。
- 发布 Ark Pixel 字体时随附 `OFL.txt`。
- 大文件使用 Git LFS；首次 clone 后先执行 `git lfs install`。

## 10. 修改与验证原则

- 修改前阅读相关策划、PRD、技术方案或 Demo 文档，不凭页面现状猜产品规则。
- 保留工作区中已有且与当前任务无关的用户或其他代理修改。
- 修改范围与请求一致，不顺带重构无关模块。
- 所有验证默认由用户亲自操作。除非用户在当前任务明确要求，代理不得主动运行
  `pnpm check`、类型检查、测试、数据/场景校验、构建、预览，也不得代替用户在 Cocos
  Creator 或浏览器中做运行与视觉验收。
- 完成修改后只说明需要刷新的资源、建议命令和人工验收点，由用户决定是否执行。
- 新增脚本或资源时提醒用户让 Cocos Creator 导入并生成 `.meta`。
- 用户明确要求验证时，日常迭代仍不做完整 Web 构建；只有构建模板、Bundle、发布资源、
  阶段验收或提交前最终验证才运行 `pnpm build:web` 和 `pnpm verify:gate`。
