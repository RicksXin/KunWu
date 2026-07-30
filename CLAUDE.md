# 《昆吾禁地》工程约定

竖屏 2D 像素修仙 · Cocos Creator 3.8.7 + TypeScript + WebGL · Web Mobile 首发

文档以 `Docs/PRD/` 为准（唯一事实源表见 `Docs/07_分阶段产品需求文档_PRD.md` §3），
实现方式见 `Docs/01_技术实现方案.md`。本文件只记录容易踩错的工程约定。

## 命令

```bash
npm run check      # typecheck + 单测，提交前跑这个
npm test           # 领域层单测（Node 原生 runner，不依赖引擎）
npm run test:watch
npm run typecheck  # 用 Cocos 自带 tsc 检查 assets/ 与 tests/
npm run validate:data  # 构建前数据表校验（PRD-10 §6 七条规则）
```

**新增脚本后必须用编辑器导入一次**生成 `.meta`（`assets/**/*.meta` 必须提交，
丢失会导致全项目引用断裂）。不要手写或用脚本伪造 `.meta`——
UUID 由编辑器分配，伪造的 UUID 与编辑器后续分配的不一致，会造成引用错乱。

工程不装 `typescript` 依赖，`npm run typecheck` 调用 Cocos 自带的那份以保证版本一致；
Cocos 装在非默认位置时用 `COCOS_APP` 环境变量指定。引擎自身的 `.d.ts` 不满足 `strict`，
会产生上百条无关报错，`tools/typecheck.mjs` 按路径过滤，只对本工程代码判定失败。

打开工程：Cocos Dashboard 添加本目录，或
`/Applications/Cocos/Creator/3.8.7/CocosCreator.app/Contents/MacOS/CocosCreator --project .`

## 不可违反的架构约束

**战斗数据单向流**（技术方案 §10）
`CombatCommand` → 结算器 → `CombatEvent` → 表现层。表现层只消费事件，
不得反向决定伤害。破坏这条会同时失效：加速战斗、跳过动画、战斗回放、自动化测试。

**七维字段名已冻结**（技术方案 §6）
`strength` `magic` `technique` `speed` `constitution` `armor` `resistance`。
数据表、存档、技能定义、探索检定全部依赖这七个键，改名等于全量迁移。

**格子坐标与像素坐标不混用**（技术方案 §9.1）
领域层只认 `GridCoord`，像素换算由表现层负责。

**数值不硬编码**（技术方案 §1）
一律从数据表读取。每个职业节点必须恰好 3 个主动技能，由 Schema 校验保证。

**ID 用英文小写蛇形**，不用显示名做逻辑判断。授权名与原创名通过本地化表切换，
不影响存档 ID（IP 双轨，见策划案 §2）。

## 目录

```
assets/scripts/
├─ domain/        无引擎依赖的纯 TS，可直接单测
├─ services/      八个持久服务（技术方案 §4.1）
├─ repositories/  数据表加载与存档读写
└─ presentation/  Cocos Component、Presenter/ViewModel
tests/            单测，故意放在 assets/ 外，避免被打进 Web 产物
```

`library/` `temp/` `local/` `profiles/` `build/` 是生成目录，已在 `.gitignore`。
`assets/**/*.meta` 必须提交——丢失会导致全项目引用断裂。

## 跨目录导入

用 Cocos 原生前缀，不要在 `tsconfig.json` 自定义 `paths`：

```ts
import { GridCoord } from 'db://assets/scripts/domain/GridCoord';
```

`temp/tsconfig.cocos.json` 注入了 `db://assets/*` 映射，自定义 `paths` 会整体覆盖它。

Node 单测认不了 `db://` 协议，也不接受省略扩展名的相对导入，
由 `tests/resolver.mjs`（解析钩子）在测试期补齐。**不要为了迁就 Node 去改 `assets/`
里的导入风格**——那会破坏引擎解析。测试自身的类型检查走 `tsconfig.tests.json`，
它不继承根配置，因为测试跑在 Node 而非引擎里。

**只作类型使用的导入必须写 `import type`。** 类型擦除不移除值导入，
对类型别名（如 `Attributes`）会在运行期报「does not provide an export named」。

## 像素规格

设计画布 1080×1920（9:16），像素内部参考 360×640 整数 3 倍放大。
世界 Tile 16×16 源像素 → 48×48 屏幕像素。
`.creator/default-meta.json` 已把图片默认 `filterMode` 设为 `nearest`，
新导入的像素图不必手动改；**禁止对 Pixel Art 开线性过滤**。

## 第三方素材

`ThirdParty/DemoAssets/` 全部 CC0 或 OFL，附来源、许可快照与 SHA-256。
不得混入 `assets/` 原创目录。Ark Pixel 字体发布须随附 `OFL.txt`。
大文件走 Git LFS（`.gitattributes`），clone 后先执行 `git lfs install`。
