# 《昆吾禁地》Demo API 与本地适配器

适用产品版本：0.1 Demo  
文档修订：1.0  
日期：2026-08-02  
API 主版本：`v1`

状态：大厅/灵圃已有实现与未来联网参考；D0/D1 后续模块不要求按本文件先行设计。

## 1. 通用约定

- Base URL 预留为 `/api/v1`；Local Adapter 不发 HTTP，但实现相同 Port。
- 所有方法返回 `Promise`，禁止为本地模式增加同步捷径。
- JSON/DTO 使用 `snake_case`，不暴露 `Profile`、`Wallet` 等客户端存档模型。
- 查询响应包含 `api_version`、`state_version`、`server_time_utc`。
- 命令包含 `expected_version`、`idempotency_key`；HTTP Adapter 分别映射到 `If-Match`、
  `Idempotency-Key`。
- Local Adapter 至少可注入成功、业务失败、超时、断网和版本冲突。
- Application Service 应用响应、保存并发出事件；Adapter 不直接操作 `GameState` 或 Presenter。

## 2. Demo API 清单

| 模块 | API Port | 接口范围 | 状态 |
|---|---|---|---|
| Camp/HUD | `CampApiPort` | HUD 查询、入口状态 | 已设计、已实现 Local Adapter |
| Ling Pu | `CampApiPort` | 快照、结算、调岗、招募、储量升级、会话恢复 | 已设计、已实现 Local Adapter |
| Expedition | `ExpeditionApiPort` | 队伍、装载、地图列表、入山事务 | Demo 不要求，正式项目再评估 |
| Map | `MapSessionApiPort` | 会话快照、移动、遭遇、返程 | Demo 不要求，正式项目再评估 |
| Combat | `CombatApiPort` | 创建战斗、提交命令、读取事件、结束 | Demo 不要求，正式项目再评估 |
| Settlement | `SettlementApiPort` | 预览、确认入账、返回营地 | Demo 不要求，正式项目再评估 |

大厅与灵圃详细契约见
[P1 Camp HUD 与灵圃 API](API/P1_CAMP_HUD_LING_PU_API.md)。其余 Demo 模块可以直接采用
本地 Application Service 与 Repository，不需要先登记详细 API 契约。

## 3. 建议端点

```text
GET  /camp/hud
GET  /camp/ling-pu
POST /camp/ling-pu/settlements
PUT  /camp/ling-pu/assignments/{resource_id}
POST /camp/ling-pu/workers:recruit
POST /camp/ling-pu/storage/{resource_id}:upgrade

GET  /expedition/preparation
PUT  /expedition/parties/{party_id}
PUT  /expedition/loadout
POST /expeditions

GET  /map-sessions/{session_id}
POST /map-sessions/{session_id}/moves
POST /map-sessions/{session_id}:return

POST /combats
POST /combats/{combat_id}/commands
GET  /combats/{combat_id}/events

GET  /settlements/{settlement_id}
POST /settlements/{settlement_id}:commit
```

端点只是 Demo 技术设计基线；字段和错误必须在各模块详细 API 文档冻结后才能编码。

## 4. 通用错误

| code | 语义 | 默认处理 |
|---|---|---|
| `invalid_request` | 参数或状态非法 | 显示明确原因，不重试 |
| `unauthorized` | 未来 Token 失效 | 进入登录恢复；Local 模式不产生 |
| `offline` | 无网络 | 保留当前 ViewModel，允许重试 |
| `timeout` | 请求超时 | 保留状态，幂等重试 |
| `conflict` | 状态版本变化 | 应用最新快照后提示重试 |
| `insufficient_resource` | 资源不足 | 刷新权威快照和消费确认 |
| `session_expired` | 地图/战斗会话无效 | 恢复到最近安全状态 |
| `already_committed` | 结算已入账 | 返回首次结果，不重复奖励 |
| `save_failed` | 本地镜像持久化失败 | 结果不回滚，单独提示保存失败 |

## 5. Local Adapter 验收

每个 Port 至少覆盖：

- 同一请求在正常情况下返回与未来 HTTP 一致的 DTO。
- 同一幂等键重复请求只执行一次。
- 旧 `expected_version` 返回冲突与最新快照。
- 业务失败不产生部分扣除、部分奖励或半个会话。
- 人工注入超时/断网后页面不清空，重试不重复消费。
- 刷新浏览器后恢复最后一次成功响应形成的业务状态。
- Presenter 不直接读取领域配置、修改 `GameState` 或调用本地结算器。

已落地的大厅/灵圃验收见
[P1-HALL / P1-ECO 本地适配器与验收](Tech/P1_HALL_ECO_本地适配器与验收.md)。
