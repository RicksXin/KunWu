# P1-HALL / P1-ECO 客户端技术设计

适用产品版本：0.1 Demo  
文档修订：1.0  
日期：2026-08-02  
范围：顶部固定 HUD、底部固定 HUD、灵圃生产面板
归属：D0 可玩样机

关联需求：

- [PRD-01 大厅与全局导航](../../PRD/01_大厅与全局导航_PRD.md)
- [PRD-02 建筑、资源与离线生产](../../PRD/02_建筑资源与离线生产_PRD.md)
- [PRD-09 UI、交互与新手引导](../../PRD/09_UI交互与新手引导_PRD.md)
- [API 契约](../API/P1_CAMP_HUD_LING_PU_API.md)
- [服务端技术设计](P1_HALL_ECO_服务端技术设计.md)
- [本地适配器与验收清单](P1_HALL_ECO_本地适配器与验收.md)

## 1. 目标与边界

本轮只重建数据与事务边界，不改变已经确认的节点树、Prefab 布局、美术资源、按钮
文案和产品规则。三个 UI 模块统一采用以下调用链：

```text
Presenter
  → Application Service
  → CampApiPort
  → LocalCampApiAdapter（当前）/ HttpCampApiAdapter（未来）
  → DTO Response
  → Application Service 更新 GameState、保存并广播应用事件
  → Presenter 只渲染 ViewModel
```

禁止事项：

- Presenter 直接读取或修改 `GameState.require()`。
- Presenter 读取灵圃配置表、计算产量、停工、费用、容量或事务结果。
- Presenter 调用 `fetch`、拼装 HTTP JSON、处理鉴权或服务端错误体。
- Local Adapter 直接修改 Cocos 节点或绕过 Application Service 广播 UI 事件。
- API DTO 直接复用 `Profile`、`Wallet`、`CampState` 等存档模型。

## 2. 当前代码结构

```text
assets/scripts/
├─ domain/
│  ├─ LingPu.ts                         # 纯领域规则
│  └─ Production.ts                     # 纯生产结算
├─ services/
│  ├─ LingPuService.ts                  # Local Adapter 使用的本地领域编排器
│  └─ camp/
│     ├─ CampApplicationModels.ts       # Presenter 使用的 ViewModel
│     ├─ CampApplicationMappers.ts      # DTO ↔ GameState / ViewModel
│     ├─ CampApplicationError.ts        # 应用层错误
│     ├─ CampHudApplicationService.ts   # 顶部、底部 HUD 查询服务
│     ├─ LingPuApplicationService.ts    # 灵圃查询与命令服务
│     └─ api/
│        ├─ CampApiDtos.ts              # 传输无关 DTO
│        ├─ CampApiPort.ts              # API Port、请求与错误
│        ├─ LocalCampApiMapper.ts        # 本地存档/领域结果 → DTO
│        ├─ LocalCampApiState.ts         # 本地命令副本与空结算结构
│        └─ LocalCampApiAdapter.ts       # 当前异步本地实现
└─ presentation/camp/
   ├─ hall/
   │  ├─ CampHudPresenter.ts
   │  ├─ CampBottomHudPresenter.ts
   │  └─ ResourceBar.ts
   └─ ling_pu/
      ├─ CampLingPuPresenter.ts
      ├─ LingPuRenderer.ts
      └─ LingPuViewTypes.ts
```

所有 TypeScript 文件保持在 300 行以内。以后新增 HTTP Adapter 时不得把 HTTP、鉴权、
重试和 JSON 映射塞回 Presenter。

## 3. 依赖注入与运行时组装

`AppRoot` 是 Composition Root，创建并持有：

1. `GameState`、`EventBus`、`TimeService`、`SaveRepository`。
2. 原有 `LingPuService`，只作为本地领域执行器。
3. `LocalCampApiAdapter`，实现 `CampApiPort`。
4. `CampHudApplicationService` 和 `LingPuApplicationService`。

Application Service 只依赖 `CampApiPort`，未来切换 HTTP 时只替换注入实例：

```text
开发/单机：LocalCampApiAdapter
联调/线上：HttpCampApiAdapter
测试：FakeCampApiAdapter
```

场景和 Prefab 上仍只挂 Presenter，不向 Cocos Inspector 暴露 API 实现。
`AppRoot.saveCurrentProfile()` 对所有 Application Service 的存档请求做全局串行化；
单次写入失败会返回当次错误，但不会使后续保存永久卡在已拒绝的 Promise 上。

## 4. 顶部与底部 HUD 数据流

### 4.1 查询

```text
CampHudPresenter / CampBottomHudPresenter
  → CampHudApplicationService.refresh()
  → CampApiPort.getCampHud()
  → CampHudSnapshotDto
  → 更新 GameState.wallet 并持久化最新镜像
  → 转为 CampHudViewModel
  → camp.hudChanged
  → 两个 Presenter 分别渲染
```

`refresh()` 对并发请求做 Promise 合并。顶部和底部在同一帧同时请求时，只执行一次
Port 调用。钱包、主线或档案变更时先使 HUD 快照失效；Application Service
用请求代次拦截失效前发出的延迟响应，避免旧 GET 覆盖灵圃命令后的新余额。

### 4.2 展示职责

- 顶部 Presenter：头像点击反馈、主线单行截断、资源栏渲染。
- `ResourceBar`：只渲染 `CampTopResourcesViewModel`，不认识 `Wallet`。
- 底部 Presenter：入口点击节流、设置页面本地导航、禁用原因反馈、灵石数值显示。
- 服务返回入口 `enabled/disabled/hidden`；Presenter 不按版本号或名称自行判断开放状态。

### 4.3 资源语义映射

| 产品语义 | API 字段 | 现有存档字段 |
|---|---|---|
| 灵粮 | `spirit_grain` | `Wallet.spiritGrain` |
| 灵木 | `spirit_wood` | `Wallet.spiritWood` |
| 玄铁 | `dark_iron` | `Wallet.darkIron` |
| 灵晶 | `spirit_crystal` | `Wallet.spiritStone` |
| 庚精 | `geng_jing` | `Wallet.gengJing` |
| 灵石 | `spirit_stone_balance` | `Wallet.immortalCoin` |

API 不暴露历史字段名，因此后续服务端数据模型不需要继承客户端存档命名。

## 5. 灵圃数据流

### 5.1 打开与关闭

- 打开面板：Presenter 先显示现有 ViewModel，再调用
  `LingPuApplicationService.settle('panel_open')`。
- 关闭面板：先关闭表现节点，再排队调用 `settle('panel_close')`。
- 每秒自动检查：`AppRoot` 调用 `settleIfDue()`；只有倒计时到零时才请求结算。
- 浏览器切后台：调用 `settle('app_hide')`。
- P1 回到前台：调用 `resumeOnlineSession()`，丢弃后台时长并重设在线生产锚点。

### 5.2 调岗

Presenter 只提交 `job + delta`。Application Service 根据当前 ViewModel 计算绝对目标人数，
向 Port 发送：

```text
resource_id
target_worker_count
expected_version
idempotency_key
```

使用绝对人数而不是对服务端提交 `+1/-1`，避免网络重试把同一操作执行两次。

### 5.3 招募与储量升级

确认弹窗的费用、当前库存、收益、可执行状态全部来自 `LingPuViewModel`。点击确认后：

1. Presenter 锁定主按钮。
2. Application Service 发送带幂等键和期望版本的命令。
3. Adapter/服务端原子执行“旧配置结算 → 最新条件校验 → 消费 → 状态变更”。
4. Service 用响应快照更新 `GameState`。
5. Service 保存并广播 `wallet.changed`、`camp.productionChanged`、
   `camp.lingPuStateChanged`。
6. Presenter 收到 ViewModel 后刷新并关闭确认弹窗。

### 5.4 倒计时

响应提供 `server_time_utc`、`cycle_seconds`、`next_settlement_at_utc`。每帧倒计时只在
Application Service 中用 `TimeService` 插值，不产生高频 API 请求，也不把倒计时写回
存档。到零后由全局每秒检查触发一次权威结算。

## 6. 状态、缓存与事件

| 内容 | 所在位置 | 生命周期 |
|---|---|---|
| 权威客户端镜像 | `GameState` | 当前档案 |
| HUD ViewModel | `CampHudApplicationService.current` | 档案切换时失效 |
| 灵圃 ViewModel | `LingPuApplicationService.current` | 档案切换时失效 |
| 并发查询 | `refreshInFlight` | 请求完成后清空 |
| 幂等结果 | Local Adapter 内存缓存 | 当前应用会话 |
| 弹窗开关、确认模式 | Presenter | 当前节点生命周期 |

应用事件：

| 事件 | 生产者 | 消费者 |
|---|---|---|
| `camp.hudChanged` | HUD Application Service | 顶部、底部 Presenter |
| `camp.lingPuStateChanged` | 灵圃 Application Service | 灵圃 Presenter |
| `wallet.changed` | 灵圃及其他业务 Service | HUD 刷新触发器、兼容模块 |
| `camp.productionChanged` | 灵圃 Application Service | 生产相关兼容模块 |
| `camp.lingPuNotice` | 灵圃 Application Service | 全局反馈 |

## 7. 异常、断网与冲突

- `offline`、`timeout`：保留当前 ViewModel，显示可重试提示，不清空页面。
- `conflict`：优先应用错误响应中的最新灵圃快照；没有快照时自动重新查询，再提示重试。
- 业务失败：错误响应可携带最新快照，因为失败操作之前可能已完成一个生产周期结算。
- `save_failed`：内存中的服务端响应结果不回滚，明确提示“操作已生效，
  但存档失败”并关闭消费确认弹窗，防止把再次点击误当成仅重试存档；后续应提供独立的重试保存入口。
- `profile_not_loaded`、`config_unavailable`：显示加载占位，不使用 Prefab 假数值。
- 快速点击：Presenter 交互队列 + Application Service 全局灵圃命令队列 +
  服务端版本校验 + 幂等键四层防护。面板命令、每秒结算和前后台生命周期命令
  共用同一 Application Service 队列，避免快速 `hide/show` 跳过前台会话恢复。

## 8. HTTP Adapter 接入要求

未来 `HttpCampApiAdapter` 必须：

- 实现同一个 `CampApiPort`，不得改变 Presenter 和 ViewModel。
- 将 `expected_version` 映射为 `If-Match`，将 `idempotency_key` 映射为
  `Idempotency-Key` 请求头。
- 统一处理鉴权、超时、断网、JSON Schema、错误码与服务端时间。
- 不直接更新 `GameState`；响应仍必须经过 Application Service。
- GET 可使用短时缓存，但命令成功、冲突或推送事件后必须失效。

## 9. 本轮不改

- 顶部头像和主线提示的最终跳转行为。
- 设置页面内部功能。
- 成就、排行榜、邮件、日常进度功能。
- 灵晶、庚精岗位、离线收益和整座灵圃建筑升级。
- 已确认的 Cocos Prefab 节点、尺寸和美术资源。
