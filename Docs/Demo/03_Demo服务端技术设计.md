# 《昆吾禁地》Demo 服务端技术设计

适用产品版本：0.1 Demo  
文档修订：1.0  
日期：2026-08-02  
状态：可选的未来联网参考；不作为 D0/D1 门槛

## 1. 设计目标

Demo 当前全部在客户端本地运行，但所有业务流程都假设未来存在服务端权威。服务端项目
建立后，客户端只替换 API Adapter，不重写 Presenter、Application Service 和领域表现。

建议未来服务端作为独立项目部署，按业务边界拆分：

```text
Account/Profile Service
Camp/Economy Service
Party/Expedition Service
Map Session Service
Combat/Settlement Service
Content Config Service
```

D0/D1 不实现真实部署、账号、数据库、Token 和联网同步，也不要求为后续 Demo 模块继续
补齐服务端设计。本文只保留已有设计，供正式项目恢复 API First 时参考。

## 2. 权威数据

| 数据 | 未来权威方 | Demo 当前实现 |
|---|---|---|
| 账号、档案版本 | 服务端 | Local Adapter + IndexedDB |
| Wallet、生产、消费 | 服务端 | Camp Local Adapter |
| 修士、队伍、灵息、装载 | 服务端 | Expedition Local Adapter（待补） |
| 地图位置、迷雾、固定对象 | 服务端会话 | Map Local Adapter（待补） |
| 战斗指令与结算 | 服务端结算器 | 本地纯 CombatResolver |
| 战利品与回城入账 | 服务端原子事务 | Settlement Local Adapter（待补） |
| 页面开关、动画、音效 | 客户端 | Cocos 表现层 |

即使本地运行，Local Adapter 也必须模拟“服务端返回完整快照，客户端以响应覆盖镜像”的语义。

## 3. 核心事务

### 3.1 入山

在一个事务内校验队伍、灵息、负重、库存和地图解锁，扣除入山消耗并创建地图会话。
加载场景失败时不得留下已扣资源但无有效会话的状态。

### 3.2 地图移动

每步提交目标格和会话版本。权威方校验相邻、地形、补给和固定对象，返回新位置、剩余灵粮、
迷雾差量和遭遇。客户端不能先扣粮后等待接口确认。

### 3.3 战斗

服务端接收稳定 `CombatCommand`，使用同版本数据和随机种子产生 `CombatEvent`。客户端只播放
事件。D0 可由 Local Adapter 直接调用同一纯 TypeScript 结算器。

### 3.4 回城结算

在同一事务内验证地图/战斗会话未结算，合并临时战利品、更新固定敌人状态、结束会话并返回
最新 Profile 摘要。重复请求必须返回首次结果，不能重复发奖。

## 4. 一致性要求

- 所有命令要求幂等键和期望状态版本。
- 消费、奖励、等级提升和会话切换必须原子完成。
- 时间只使用服务端 UTC；Local Adapter 通过 `TimeService` 模拟。
- 错误响应使用稳定错误码，并尽可能携带最新快照。
- 配置有独立版本；结算记录所使用的配置版本和随机种子。
- DTO 数值不超过 JavaScript 安全整数范围。

## 5. Demo 不实现的服务端能力

- 注册登录、跨设备同步和云存档。
- 排行榜、邮件、支付、广告、运营活动和 PvP。
- WebSocket/SSE 实时推送。
- 数据库迁移、监控、限流、审计和多区部署。

这些内容可以在正式项目立项时补齐，不阻塞 Demo，但 Demo API 不能设计成只能本地调用的形状。

## 6. 已有详细设计

大厅与灵源院的服务端预留见
[P1-HALL / P1-ECO 服务端技术设计](Tech/P1_HALL_ECO_服务端技术设计.md)。后续每个 Demo
业务模块在实现前建立同级文档，并在 [Demo API](04_Demo_API与本地适配器.md) 登记。
