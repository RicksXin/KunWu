# P1-HALL / P1-ECO 本地适配器实现与验收

归属：D0 可玩样机

版本：1.0  
日期：2026-08-02

关联文档：

- [客户端技术设计](P1_HALL_ECO_客户端技术设计.md)
- [服务端技术设计](P1_HALL_ECO_服务端技术设计.md)
- [API 契约](../API/P1_CAMP_HUD_LING_PU_API.md)

## 1. 当前实现

本地接口实现：

- `assets/scripts/services/camp/api/LocalCampApiAdapter.ts`
- `assets/scripts/services/camp/api/LocalCampApiMapper.ts`
- `assets/scripts/services/camp/api/LocalCampApiState.ts`

它实现 `CampApiPort` 的全部 P1 接口，并始终返回 `Promise`。本地模式没有 HTTP、Token
或服务器进程，但保留与未来服务端相同的 DTO、版本、幂等和错误边界。

## 2. 本地事务模型

每次灵圃命令：

1. 从 `GameState` 读取当前 Profile。
2. 复制本次需要的 Wallet 与 CampState，不直接改原对象。
3. 在副本上调用现有 `LingPuService` 和纯领域结算器。
4. 生成独立 API DTO 与新 `state_version`。
5. 返回 Application Service。
6. Application Service 把响应映射回 `GameState`、保存并广播事件。

这保证 Local Adapter 不绕过 Service 修改客户端权威镜像，也保证切换 HTTP Adapter 时
Presenter 无需改变。

## 3. 已实现的协议行为

- HUD 与灵圃查询都是异步 Promise。
- API 正式资源 ID 与历史存档字段隔离。
- 调岗提交绝对人数。
- 命令检查 `expected_version`。
- 命令使用 `idempotency_key`，成功和业务失败结果都在当前会话缓存；
  同键更换操作或请求内容返回 `idempotency_key_reused`。
- 业务失败可携带最新灵圃快照。
- 生产结算、调岗、招募、升级和前台恢复仍复用现有领域规则。
- Application Service 负责更新 `GameState`、存档与事件。
- 所有灵圃命令在 Application Service 内串行化，面板操作、周期结算与
  前后台切换不会使用同一旧版本并发提交。
- 结算响应的灵粮 `yields` 返回扣除维护后的净变化。

## 4. 故障模拟

`LocalCampApiAdapter.simulateNextFailure()` 可令下一次接口调用返回：

| 模式 | API code | 预期客户端行为 |
|---|---|---|
| `offline` | `offline` | 保留当前画面，提示恢复连接后重试 |
| `timeout` | `timeout` | 解锁按钮，提示超时，可重试 |
| `conflict` | `conflict` | 刷新最新状态，再提示重试 |
| `internal` | `internal` | 保留状态，显示通用服务异常 |

该入口只用于测试/联调，正常运行不主动注入故障。

## 5. 用户执行的验证命令

Codex 不代为运行。用户需要时可执行：

```bash
pnpm typecheck
pnpm test
pnpm validate:data
pnpm validate:scene
```

本轮不涉及构建模板、Bundle 分包或发布资源，日常验证不需要执行完整 Web 构建。

## 6. 正常流程验收清单

### 6.1 顶部 HUD

- [ ] 新档进入大厅，五资源来自 API ViewModel，不闪现 Prefab 假数值。
- [ ] 顺序固定为灵粮、灵木、玄铁、灵晶、庚精。
- [ ] 灵晶读取内部 `spiritStone`，不与底部灵石串用。
- [ ] 主线为空时显示“暂无主线任务”；长文案仍单行截断。
- [ ] 灵圃产出、招募或升级后顶部资源自动刷新。

### 6.2 底部 HUD

- [ ] 右下灵石读取内部 `immortalCoin`。
- [ ] 设置入口正常打开设置页。
- [ ] 成就、排行、邮件、日常按 API 状态显示明确未开放原因。
- [ ] HUD 查询失败时原余额不被错误清零。

### 6.3 灵圃

- [ ] 打开面板触发 `panel_open` 结算并显示三条开放资源。
- [ ] 加减岗位提交绝对目标人数；快速点击仍按顺序处理。
- [ ] 灵粮净产量随灵木/玄铁分配实时变化。
- [ ] 招募成功原子扣灵粮并增加 5 名杂役，岗位不变。
- [ ] 灵粮不足时招募按钮禁用，取消不改变状态。
- [ ] 储量升级成功原子扣灵木并提高目标等级，产量与岗位不变。
- [ ] 灵木不足和满级分别显示正确错误。
- [ ] 关闭面板触发 `panel_close` 结算并回到原大厅位置。
- [ ] 30 秒到点后全局自动结算，即使灵圃面板未打开也更新顶部资源。

## 7. 异常与恢复验收清单

- [ ] `timeout`：按钮从处理中恢复，当前 ViewModel 保留，可再次点击。
- [ ] `offline`：不扣资源、不改变岗位，恢复后重试成功。
- [ ] `conflict`：客户端应用最新快照，不用旧版本静默覆盖。
- [ ] 重复发送同一成功幂等键：资源只扣一次、人数或等级只增加一次。
- [ ] 同一状态连续快速招募：只有满足最新资源和版本的请求成功。
- [ ] 业务失败前若完成生产周期：页面先收到最新产出，再显示业务失败原因。
- [ ] 存档失败：内存画面保持服务响应结果，提示“操作已生效，但存档失败”；
      招募/升级确认弹窗关闭，不得诱导玩家重复消费。
- [ ] 浏览器后台恢复：P1 不计算后台收益，周期锚点从恢复时重新开始。
- [ ] 系统时间倒退：显示生产暂停提示，不产生异常收益。

## 8. HTTP 切换验收清单

未来增加 `HttpCampApiAdapter` 后必须复用同一套 Presenter 验收，并额外确认：

- [ ] Port 切换不修改任何 Cocos Prefab 或 Presenter。
- [ ] `If-Match`、`Idempotency-Key` 请求头正确发送。
- [ ] `401/403/409/422/503/504` 映射为约定应用错误。
- [ ] 服务端 UTC 驱动倒计时，本机改时间不能刷收益。
- [ ] 断线重连或推送事件只触发刷新，不直接写 UI。
- [ ] 多设备冲突以服务端最新快照为准。

## 9. 当前限制

- Local Adapter 的版本号和幂等缓存只在当前应用会话内存在。
- 当前没有 HTTP Adapter、账号鉴权、服务器数据库或跨设备同步。
- P1 仍不结算离线收益，不开放灵晶、庚精岗位。
- 本地故障模拟为一次性注入，不模拟真实网络延迟曲线。
