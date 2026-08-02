# P1-HALL / P1-ECO 服务端技术设计

版本：1.0  
日期：2026-08-02  
状态：服务端预留设计，当前仓库尚未实现独立 Server
归属：D0 可玩样机

关联文档：

- [客户端技术设计](P1_HALL_ECO_客户端技术设计.md)
- [API 契约](../API/P1_CAMP_HUD_LING_PU_API.md)
- [本地适配器与验收](P1_HALL_ECO_本地适配器与验收.md)

## 1. 服务职责

未来 Camp 服务拆为查询与命令两类职责：

```text
CampQueryService
├─ 查询顶部资源、主线摘要、底部入口状态
└─ 查询灵圃完整快照

LingPuCommandService
├─ 在线周期结算
├─ 设置岗位绝对人数
├─ 招募杂役
├─ 升级单项资源储量
└─ P1 前台会话恢复与锚点重置
```

静态数值由版本化配置服务/配置表提供；命令代码不得硬编码招募费用、人数、容量或升级
消耗。

## 2. 数据权威范围

| 数据 | 权威方 | 客户端职责 |
|---|---|---|
| 五种生产资源与灵石余额 | 服务端 | 缓存并展示响应快照 |
| 杂役总数与岗位分配 | 服务端 | 提交目标值，不预测成功 |
| 三种储量等级 | 服务端 | 展示升级预览与结果 |
| 生产结算时间与周期 | 服务端 | 依据服务端时间显示倒计时 |
| 主线状态、入口开放状态 | 服务端 | 展示摘要与不可用原因 |
| 面板是否打开、动画、音效 | 客户端 | 完全负责 |
| UI 布局与本地辅助设置 | 客户端 | 完全负责 |

P1 本地模式由 Local Adapter 模拟服务端权威；切换联网模式后客户端本地存档不再作为
上述经济数据的最终裁决者。

## 3. 建议数据模型

```text
camp_account_state
├─ account_id                 PK
├─ state_version              bigint
├─ spirit_grain               bigint
├─ spirit_wood                bigint
├─ dark_iron                  bigint
├─ spirit_crystal             bigint
├─ geng_jing                  bigint
├─ spirit_stone               bigint
├─ worker_total               int
├─ last_settled_at_utc        bigint
└─ updated_at_utc             bigint

ling_pu_assignment
├─ account_id                 PK/FK
├─ resource_id                PK
└─ worker_count               int

ling_pu_storage_level
├─ account_id                 PK/FK
├─ resource_id                PK
└─ storage_level              int

camp_idempotency_record
├─ account_id                 PK/FK
├─ idempotency_key            PK
├─ request_hash
├─ response_status
├─ response_body
└─ expires_at_utc
```

所有资源使用有符号 64 位整数并在写入前检查非负与安全上限；API v1
输出还必须保证数值不超过 JavaScript 安全整数范围。`state_version` 每次权威变更
递增，用于乐观并发控制。

## 4. 命令事务

### 4.1 通用顺序

所有灵圃命令在同一数据库事务中执行：

1. 验证账号身份、资源 ID、幂等键和请求体。
2. 查询幂等记录；同键同请求直接返回首次结果，同键不同请求返回冲突。
3. `SELECT ... FOR UPDATE` 锁定账号营地状态。
4. 校验 `If-Match` / `expected_version`。
5. 使用服务端 UTC 按旧岗位、旧容量结算已完成周期。
6. 执行本次命令的最新条件校验与变更。
7. 递增 `state_version`，写入状态和幂等响应。
8. 提交后发布 `camp.ling_pu.updated` 领域事件。

任何消费与状态提升必须原子提交，禁止出现扣除灵木但储量等级未提升等部分成功。

### 4.2 设置岗位人数

- 请求提交绝对 `target_worker_count`。
- 只允许相对当前值改变 1；批量调岗未来另设接口。
- 所有岗位人数必须非负，总和不得超过 `worker_total`。
- 先结算旧岗位，再写入新人数。

### 4.3 招募杂役

- 在事务锁内重新读取灵粮。
- 灵粮不少于配置费用才允许扣除。
- 同事务扣除灵粮并增加配置人数，不改变岗位分配。
- 失败响应仍返回最新快照；若命令前结算产生收益，快照必须包含该收益。

### 4.4 储量升级

- 按旧容量结算后读取最新储量等级和灵木。
- 容量、最高等级、升级费用只读版本化配置。
- 同事务扣灵木、升目标资源等级。
- 最大容量由“等级 + 配置版本”推导，不另存一份可漂移容量。

### 4.5 结算与会话恢复

- P1 只认可前台在线时长。
- `app_hide` 先结算已完成在线周期。
- `session:resume` 把锚点重置为服务端当前时间，不结算后台时长。
- 时间倒退不可能由客户端系统时间影响服务端；Local Adapter 的回拨检测只用于单机模式。

## 5. 鉴权与权限

- 所有 `/api/v1/camp/**` 接口要求账号 Access Token。
- `account_id` 只从 Token/会话上下文读取，禁止接受客户端请求体传入。
- 玩家只能读写自己的营地状态。
- 管理后台修改资源必须走独立权限、审计和原因字段，不复用玩家命令接口。
- Token 失效返回 `401 unauthorized`；封禁或无权访问返回 `403 forbidden`。

## 6. 幂等与并发

- 所有 POST/PUT 命令要求 `Idempotency-Key`。
- 推荐保留幂等记录至少 24 小时。
- 同一账号同一 Key 的请求体哈希不一致时返回 `409 idempotency_key_reused`。
- `If-Match` 与当前 `state_version` 不一致时返回 `409 conflict`，附最新灵圃快照。
- 多设备同时操作时以先提交成功者为准；后提交者必须刷新后重试，不做静默覆盖。

## 7. 配置与版本

灵圃状态记录生效的 `balance_version`。配置发布遵循：

- 老状态可用当前兼容配置读取。
- 降低容量时不得直接吞掉玩家已有库存；需要单独迁移策略。
- 改招募费用和升级费用只影响事务开始时读取到的新请求。
- API 主版本通过路径 `/api/v1` 管理；兼容新增字段不升主版本。

## 8. 查询与缓存

- `GET /camp/hud` 可按账号做 1–3 秒短缓存。
- `GET /camp/ling-pu` 默认不做跨请求长缓存。
- 任一营地命令提交后使 HUD 与灵圃查询缓存同时失效。
- 主线或运营入口状态变更后使 HUD 缓存失效。
- 服务端响应必须带 `state_version` 和 `server_time_utc`。

## 9. 事件与推送

提交成功后发布内部领域事件：

```text
camp.wallet.updated
camp.ling_pu.updated
camp.story_summary.updated
```

未来若接 WebSocket/SSE，可向在线客户端推送失效通知；推送只触发重新查询，不直接把未经
Application Service 处理的 JSON 写进 UI。

## 10. 错误恢复与可观测性

- 日志字段：`trace_id`、`account_id`、`endpoint`、`idempotency_key`、旧/新版本、耗时、
  结算周期数和错误码。
- 指标：请求成功率、P95/P99、冲突率、幂等命中率、事务回滚率、资源负数拦截次数。
- 告警：负库存、版本倒退、同幂等键不同请求、结算周期异常放大。
- 返回客户端的错误不含数据库结构、堆栈或内部配置路径。

## 11. 部署前置

独立 Server 上线前还需补齐：账号服务、配置发布服务、数据库迁移、HTTP Adapter、鉴权、
Schema 契约测试、限流、审计、监控和数据迁移方案。本设计不代表当前 P1 已启用联网权威。
