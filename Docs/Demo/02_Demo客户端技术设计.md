# 《昆吾禁地》Demo 客户端技术设计

适用产品版本：0.1 Demo  
文档修订：1.0  
日期：2026-08-02  
技术基线：Cocos Creator 3.8.7 + TypeScript + WebGL

## 1. 客户端目标

客户端只为 Demo 闭环提供必要场景、页面、交互和本地运行能力，同时保持未来接入服务端
时无需重写 Presenter 与领域层。

```text
Boot.scene
→ Camp.scene
   ├─ 灵圃模态页
   └─ 入山整备模态页
→ Map.scene
   ├─ Map 逻辑页
   └─ Combat 逻辑页（D0 灰盒复用宿主）
→ 归营原子结算 + 黑屏缓动切场
→ Camp.scene
```

D0 不为背包、任务、招募、转职等正式页面提前建立空场景；不可用入口只显示明确反馈。

## 2. Demo 本地调用链

```text
Presenter
→ Application Service
→ 纯领域规则 / Repository
→ Service 更新 GameState、保存并发出应用事件
→ Presenter 渲染 ViewModel
```

- Presenter 只负责节点、输入、动画和 ViewModel 渲染。
- Application Service 负责一次玩家操作的排队、请求、状态应用、保存和事件。
- `domain/` 不依赖 Cocos、HTTP、DTO、事件总线或存档实现。
- Demo 不强制 API Port、服务端 DTO 或 Local Adapter；大厅/灵圃已有实现可以保留。
- 页面不得直接修改 `GameState` 后自行保存，业务变更统一交给 Service 串行处理。

## 3. 页面模块

| 模块 | D0 职责 | 关键状态 |
|---|---|---|
| Boot | 加载配置与存档、失败恢复 | loading/error/ready |
| Camp Hall | 横滑、固定 HUD、入口 | panorama position、HUD snapshot |
| Ling Pu | 生产调岗与消费确认 | production snapshot、command lock |
| Expedition | 编队、灵息、负重、装载和地图选择 | party/loadout/readiness |
| Map | 移动、迷雾、补给和遭遇 | expedition state、visible tiles |
| Combat | 消费 CombatEvent 并播放 | snapshot、event queue、outcome |
| Return Transition | 原子归营结算、黑屏缓动与大厅刷新 | settling/fading/routing |

表现层继续按页面放在 `assets/scripts/presentation/`，Application Service 按业务模块放在
`assets/scripts/services/`。单个 TypeScript 文件不得超过 300 行。

## 4. 输入与防误触

- 营地横滑开始后记录按下点；累计位移超过逻辑 12dp 即进入拖动态。
- 拖动态必须取消本次建筑点击，即使触点最终停在建筑热区内。
- `TOUCH_END` 后由全景控制器给出本次手势是否为 tap；建筑 Presenter 不得只依赖 Button
  自身的 click 事件判断。
- 同一入口在 350ms 内只响应一次；打开模态页或开始路由后立即锁定入口。
- 地图滑动、列表滚动和资源行按钮使用同一“拖动不触发点击”原则。

当前如果仍能在横滑时打开建筑，视为 D0 阻断交互缺陷，不能因历史待办标记为完成而忽略。

## 5. 状态与持久化

- `GameState` 保存当前权威客户端镜像；页面不得各存一份业务真相。
- 所有消费、奖励、队伍和地图状态变更必须经过 Application Service 串行提交。
- D0 使用 IndexedDB 主档与备份；重要命令成功后立即保存。
- 重复点击、场景加载失败和刷新恢复必须有稳定结果；消费与奖励使用本地事务标识防止重复执行。
- 刷新后至少恢复 Wallet、灵圃、队伍、装载、地图位置、迷雾和敌人状态。

## 6. 性能与资源

- UI 逻辑基准为 `375×817`，营地全景宽度为 `1050`。
- D0 首次压缩下载保持小于 25MB；D1 按 PRD-10 的 Demo 预算执行。
- 像素素材使用 Nearest；大地图只保留可见范围节点，迷雾与 Tile 不逐帧全量重建。
- CombatResolver 保持 20Hz 纯事件结算；D0 玩家界面只提供正常速度，表现层不反向影响伤害。
- 非当前 Demo 闭环资源不进入首包。

## 7. 当前技术文档

大厅 HUD 与灵圃的已落地详细设计见：

- [客户端详细设计](Tech/P1_HALL_ECO_客户端技术设计.md)
- [本地适配器与验收](Tech/P1_HALL_ECO_本地适配器与验收.md)
- [API 契约](API/P1_CAMP_HUD_LING_PU_API.md)

入山整备、地图、战斗和归营转场在进入编码前，只需在本目录补齐客户端状态流、存档、
失败恢复和人工验收；Demo 阶段不要求服务端设计、API 契约或 Local Adapter。

D0 地图与战斗的已落地详细设计见：

- [D0 地图探索客户端设计](Tech/D0_MAP_客户端技术设计.md)
- [D0 固定遭遇战客户端设计](Tech/D0_COMBAT_客户端技术设计.md)
