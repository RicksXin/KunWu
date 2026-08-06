# P1 Camp HUD 与灵源院 API 契约

适用产品版本：0.1 Demo  
文档修订：1.0  
日期：2026-08-02  
API 主版本：`v1`
归属：D0 可玩样机

关联文档：

- [客户端技术设计](../Tech/P1_HALL_ECO_客户端技术设计.md)
- [服务端技术设计](../Tech/P1_HALL_ECO_服务端技术设计.md)
- [本地适配器与验收](../Tech/P1_HALL_ECO_本地适配器与验收.md)

## 1. 通用约定

- Base URL：`/api/v1`
- Content-Type：`application/json; charset=utf-8`
- 鉴权：`Authorization: Bearer <access_token>`；Local Adapter 不校验 Token。
- 时间：所有 `*_utc` 字段都是 Unix UTC 秒整数。
- 版本：响应 `state_version` 是不透明字符串，客户端不得解析大小。
- 命令并发：`If-Match: <state_version>`。
- 命令幂等：`Idempotency-Key: <unique-request-id>`。
- 数量：库存、费用、人数均为非负整数；结算的资源变化量允许为负，
  资源服务端使用 64 位整数，但 API v1 必须限制在 JavaScript 安全整数范围
  `-9007199254740991..9007199254740991`。
- JSON 字段使用 `snake_case`，不暴露客户端 `Profile`/`Wallet` 字段名。

当前 TypeScript Port 将 `If-Match` 和 `Idempotency-Key` 表示为请求 DTO 中的
`expected_version`、`idempotency_key`；未来 HTTP Adapter 负责把它们转成请求头。

## 2. 正式资源 ID

| API ID | 显示名 | 当前客户端存档字段 |
|---|---|---|
| `spirit_grain` | 灵粮 | `spiritGrain` |
| `spirit_wood` | 灵木 | `spiritWood` |
| `dark_iron` | 玄铁 | `darkIron` |
| `spirit_crystal` | 灵晶 | `spiritStone` |
| `geng_jing` | 庚精 | `gengJing` |
| `spirit_stone_balance` | 灵石余额 | `immortalCoin` |

灵源院 P1 命令的 `resource_id` 只接受前三项。

## 3. GET `/camp/hud`

用途：顶部五资源、主线摘要、底部入口状态和灵石余额。

响应 `200`：

```json
{
  "api_version": "v1",
  "state_version": "128",
  "server_time_utc": 1785600000,
  "top_resources": [
    {"resource_id": "spirit_grain", "amount": 120, "status": "normal"},
    {"resource_id": "spirit_wood", "amount": 30, "status": "normal"},
    {"resource_id": "dark_iron", "amount": 20, "status": "normal"},
    {"resource_id": "spirit_crystal", "amount": 0, "status": "normal"},
    {"resource_id": "geng_jing", "amount": 0, "status": "normal"}
  ],
  "main_task": {"objective": "前往议事殿，与岑守一交谈"},
  "bottom_entries": [
    {"entry_id": "settings", "state": "enabled", "unavailable_reason": null},
    {"entry_id": "achievements", "state": "disabled", "unavailable_reason": "成就尚未开放"},
    {"entry_id": "leaderboard", "state": "disabled", "unavailable_reason": "排行榜尚未开放"},
    {"entry_id": "mail", "state": "disabled", "unavailable_reason": "邮件尚未开放"},
    {"entry_id": "daily_progress", "state": "disabled", "unavailable_reason": "日常进度尚未开放"}
  ],
  "spirit_stone_balance": 0
}
```

`status`：`normal | near_capacity | full | shutdown`。P1 未实现的资源可保持 `normal`。
`main_task.objective=null` 表示没有进行中的主线，客户端显示“暂无主线任务”。

## 4. GET `/camp/ling-pu`

用途：读取灵源院完整展示快照；GET 不执行生产结算。

响应 `200`：

```json
{
  "api_version": "v1",
  "state_version": "128",
  "server_time_utc": 1785600000,
  "cycle_seconds": 30,
  "last_settled_at_utc": 1785599980,
  "next_settlement_at_utc": 1785600010,
  "worker_total": 6,
  "worker_idle": 2,
  "resources": [
    {
      "resource_id": "spirit_grain",
      "stock": 120,
      "capacity": 200,
      "assigned_workers": 2,
      "worker_limit": 4,
      "production_per_cycle": -3,
      "is_full": false,
      "is_shutdown": false,
      "shutdown_reason": null,
      "storage_upgrade": {
        "current_level": 1,
        "max_level": 5,
        "current_capacity": 200,
        "next_capacity": 400,
        "spirit_wood_cost": 20,
        "can_afford": true,
        "is_max_level": false
      }
    }
  ],
  "recruit": {
    "spirit_grain_cost": 100,
    "workers_granted": 5,
    "can_afford": true
  }
}
```

实际响应必须包含 `spirit_grain`、`spirit_wood`、`dark_iron` 三条资源。示例为简洁只展开
一条。`production_per_cycle` 是服务端按当前岗位计算的净展示值，灵粮允许为负。

## 5. POST `/camp/ling-pu/settlements`

请求头：`If-Match`、`Idempotency-Key`。  
用途：面板打开、关闭、周期到点或应用切后台时结算。

请求：

```json
{"reason": "panel_open"}
```

`reason`：`panel_open | panel_close | timer | app_hide`。

成功 `200` 返回统一命令响应，见第 10 节。

## 6. PUT `/camp/ling-pu/assignments/{resource_id}`

请求头：`If-Match`、`Idempotency-Key`。  
用途：把一个岗位设置为绝对目标人数。

请求：

```json
{"target_worker_count": 3}
```

约束：

- P1 `resource_id` 只允许三种基础岗位。
- 单次请求相对当前人数只能改变 1。
- 总分配人数不得超过杂役总数。
- 服务端先按旧分配结算，再应用目标人数。

成功 `200` 返回统一命令响应。

## 7. POST `/camp/ling-pu/workers:recruit`

请求头：`If-Match`、`Idempotency-Key`。  
请求体：`{}`。

服务端在事务内重新读取招募费用和当前灵粮。成功后扣除配置费用、增加配置人数，不改变
任何岗位分配。成功 `200` 返回统一命令响应。

## 8. POST `/camp/ling-pu/storage/{resource_id}:upgrade`

请求头：`If-Match`、`Idempotency-Key`。  
请求体：`{}`。

服务端先按旧容量结算，再校验最高等级和灵木，原子扣除灵木并提升指定资源储量等级。
成功 `200` 返回统一命令响应。

## 9. POST `/camp/ling-pu/session:resume`

请求头：`If-Match`、`Idempotency-Key`。  
请求体：`{}`。

P1 用途：浏览器从后台恢复时丢弃后台时长，把在线结算锚点设置为服务端当前 UTC。
成功 `200` 返回统一命令响应。

## 10. 统一命令响应

```json
{
  "request_id": "recruit-1785600000000-2",
  "snapshot": {"...": "与 GET /camp/ling-pu 相同"},
  "settlement": {
    "cycles": 1,
    "yields": {
      "spirit_grain": -3,
      "spirit_wood": 1,
      "dark_iron": 1
    },
    "clock_rolled_back": false,
    "discarded_seconds": 0
  }
}
```

即使本次命令没有完成周期，`settlement` 仍存在且 `cycles=0`。客户端必须以 `snapshot`
覆盖本地镜像，不得自行把 `yields` 累加一次。
`yields.spirit_grain` 是扣除当次岗位维护后的灵粮净变化，因此可为负；
灵木和玄铁为实际入库前的本次产出变化。

## 11. 错误响应

```json
{
  "api_version": "v1",
  "trace_id": "01J...",
  "error": {
    "code": "conflict",
    "message": "灵源院状态版本已变化",
    "retryable": true
  },
  "latest_ling_pu_snapshot": {"...": "可选，结构同灵源院快照"}
}
```

| HTTP | code | 可重试 | 说明 |
|---:|---|---|---|
| 400 | `invalid_request` | 否 | 参数、资源 ID 或人数非法 |
| 401 | `unauthorized` | 是 | Token 缺失或失效 |
| 403 | `forbidden` | 否 | 账号无权访问 |
| 409 | `conflict` | 是 | `If-Match` 版本冲突 |
| 409 | `idempotency_key_reused` | 否 | 同 Key 对应不同请求 |
| 422 | `no_idle_worker` | 否 | 没有空闲杂役 |
| 422 | `job_empty` | 否 | 岗位已为 0 |
| 422 | `insufficient_spirit_grain` | 否 | 招募灵粮不足 |
| 422 | `insufficient_spirit_wood` | 否 | 升级灵木不足 |
| 422 | `max_storage_level` | 否 | 已满级 |
| 503 | `config_unavailable` | 是 | 配置暂不可用 |
| 503 | `offline` | 是 | 客户端传输层断网映射 |
| 504 | `timeout` | 是 | 客户端传输层超时映射 |
| 500 | `internal` | 是 | 未分类服务异常 |

业务失败可能附带 `latest_ling_pu_snapshot`，因为命令校验前的在线周期结算可能已经成功。
客户端先应用最新快照，再显示失败原因。

## 12. 推送事件预留

未来 WebSocket/SSE 只推送失效事件：

```json
{"event": "camp.hud.updated", "state_version": "129"}
{"event": "camp.ling_pu.updated", "state_version": "129"}
```

客户端收到后重新调用 GET；不直接把推送 Payload 当 ViewModel。
