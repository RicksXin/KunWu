# 《昆吾禁地》PRD 10：Web技术、存档、性能与数据

版本：0.1  
模块：TECH  
负责人：技术负责人、客户端、工具、QA

## 1. 技术基线

- Cocos Creator 3.8 LTS。
- TypeScript。
- Web Mobile。
- WebGL成熟路径，不依赖实验性WebGPU。
- Cocos UI。
- Tiled TMX/JSON。
- IndexedDB。
- Asset Bundle。

## 2. 浏览器矩阵

Must：

- Windows Chrome。
- Windows Edge。
- Windows Firefox。
- macOS Chrome/Safari。
- Android Chrome。
- iOS Safari。

PWA作为P3C Should，不阻断P2 Demo。

## 3. Asset Bundle

```text
start-scene
shared
camp
career_base
career_tier_1
map_01
map_02
map_03
map_04
map_05
```

- 首屏只加载启动和shared最小资源。
- 营地加载后预载map_01。
- 接近出口时预载目标地图。
- 地图2隐藏出口满足条件后才预载map_04。
- Bundle使用版本Hash。
- Bundle之间不互相引用业务脚本。

## 4. 存档

IndexedDB：

```text
kunwu_game
├─ profiles
├─ backups
├─ settings
└─ telemetry_local
```

存档包含：

- Schema版本。
- 游戏版本。
- UTC时间。
- 校验值。
- Payload。

写入：

1. 序列化和校验。
2. 旧主档进入backups。
3. 同一transaction写入新档。
4. 失败保留旧档。

## 5. 导入导出

- 导出`.kwsave`。
- 文件包含版本、时间和校验。
- 导入先预览角色、进度和时间。
- 覆盖前二次确认。
- 不兼容新版本拒绝导入并显示原因。
- 导入成功后立即创建备份。

## 6. 数据驱动

数据源：

- CSV：扁平数值。
- JSON：职业树、任务、地图、事件。

构建前校验：

- ID唯一。
- 引用存在。
- 每职业恰好三个技能。
- 地图对象坐标合法。
- 出口目标存在。
- 掉落权重合法。
- 文本Key存在。

## 7. 性能预算

| 指标 | Demo | MVP |
|---|---:|---:|
| 首次压缩下载 | <25MB | <60MB |
| 地图加载 | <2秒 | <2秒 |
| 桌面帧率 | 60FPS | 60FPS |
| 移动低画质 | ≥30FPS | ≥30FPS |
| 桌面内存 | <450MB | <450MB |
| 移动内存 | <300MB | <300MB |
| 存档 | <2MB | <5MB |

## 8. 错误处理

- Bundle失败：重试、返回大厅、显示错误码。
- IndexedDB失败：保留内存状态并提示导出。
- WebGL上下文丢失：暂停并尝试恢复。
- 浏览器后台：暂停表现，恢复后按时间补算。
- 数据Schema失败：阻止进入游戏，显示版本。
- 弱网：不影响已加载地图，禁止切图时明确提示。

## 9. 本地遥测

事件：

- 启动和教程。
- 出征开始/结束。
- 地图对象交互。
- 属性检定。
- 战斗与Boss。
- 转职。
- 存档错误。

默认只保存在本地。上传前必须有隐私说明和用户同意。

## 10. 功能需求

| ID | 需求 | 阶段 |
|---|---|---|
| P0-TECH-001 | Web构建和浏览器适配 | P0 |
| P0-TECH-002 | IndexedDB和备份 | P0 |
| P0-TECH-003 | Bundle和数据校验 | P0 |
| P2-TECH-004 | 导入导出和错误页 | P2 |
| P2-TECH-005 | Demo性能预算 | P2 |
| P3B-TECH-006 | 五图分包和卸载 | P3B |
| P3C-TECH-007 | PWA和缓存 | P3C |
| P4-TECH-008 | 存档迁移、兼容和压力测试 | P4 |

## 11. 验收

- 连续刷新20次不坏档。
- 20个历史存档可迁移。
- Bundle不进入错误的首屏包。
- 浏览器后台30分钟恢复正确。
- 清理网站数据后可通过导入恢复。
- 五图切换没有持续内存增长。
- 断网时已加载内容仍可运行。

## 12. 不做

- 账号服务器。
- 云存档。
- 在线支付。
- 多人同步。
- 服务端权威战斗。
- WebGPU首发依赖。

