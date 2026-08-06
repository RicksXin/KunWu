---
name: figma-deliver-cocos-ui
description: Deliver approved KunWu Figma UI into the local Cocos Creator project, including design inspection, Cocos component mapping, @3x PNG export, one-pass TinyPNG compression, asset placement, and implementation handoff. Use when the user provides a Figma URL or node and asks to restore, implement, export, compress, replace, or integrate UI or art assets in the KunWu repository.
---

# Figma → Cocos UI 交付

按“需求事实源 → Approved Figma → Cocos Scene/Prefab”单向交付界面。保留原始 `@3x` PNG，使用 TinyPNG 做一次入库前压缩，再将尺寸不变的成品放入 Cocos 资源目录。

## 1. 读取项目约定

开始前完整读取仓库根目录的 [`CLAUDE.md`](../../../CLAUDE.md) 和 [`Docs/Figma/README.md`](../../../Docs/Figma/README.md)。按任务继续读取：

- 评审状态：[`01_文件页面与评审状态.md`](../../../Docs/Figma/01_文件页面与评审状态.md)
- 画布与横滑布局：[`02_画布安全区与布局.md`](../../../Docs/Figma/02_画布安全区与布局.md)
- 主题与文字：[`03_主题色字体与文字层级.md`](../../../Docs/Figma/03_主题色字体与文字层级.md)
- 组件索引：[`04_通用组件与资源索引.md`](../../../Docs/Figma/04_通用组件与资源索引.md)
- 组件状态：[`05_面板列表按钮与交互状态.md`](../../../Docs/Figma/05_面板列表按钮与交互状态.md)
- 图片与组件化：[`06_图片导入与组件化规范.md`](../../../Docs/Figma/06_图片导入与组件化规范.md)
- 导出与映射：[`07_资源导出与Cocos映射.md`](../../../Docs/Figma/07_资源导出与Cocos映射.md)

只加载与当前页面相关的策划、PRD、Demo 或技术文档，不用 Figma 推翻产品规则。

## 2. 确认交付范围

1. 从用户提供的 URL 提取精确的 `fileKey` 和 `nodeId`，不得猜测节点。
2. 确认节点为 `Approved`。若文档尚未登记，但用户在当前对话明确要求按该节点实现，则将确认范围记录到 Figma 状态文档后再实现；不得连带批准同页其他节点。
3. 先检查现有 Cocos Scene、Prefab、图片目录和映射，复用现有组件并保留无关改动。
4. 若设计改变功能或交互，先同步对应策划或 PRD；纯视觉变化再进入实现。

## 3. 读取 Figma

使用 Figma MCP 前先加载当前环境要求的 Figma design-to-code/implement-design Skill。

1. 先调用 `get_design_context` 读取目标节点。
2. 输出过大时调用 `get_metadata` 定位子节点，再分别读取必要组件。
3. 始终调用 `get_screenshot` 获取视觉事实源。
4. 将 MCP 返回的 React/Tailwind 仅作为结构参考，转换为 Cocos Creator 节点、Prefab、Sprite、Label、Mask、Layout、Graphics、Animation 或 Tween。
5. 不把手机状态栏、安全区参考线或纯评审标注导出为游戏素材。

## 4. 拆分组件与资源

实现前列出映射表，至少包含：

| Figma 节点 | 状态 | 逻辑尺寸 | `@3x` 尺寸 | Cocos Prefab/节点 | 表现方式 | 输出路径 |
|---|---|---:|---:|---|---|---|

遵守以下规则：

- 动态文字、数字、价格、倒计时、建筑名和按钮文案使用 Label，不烘焙进 PNG。
- 重复结构抽成 Figma Component 与 Cocos Prefab/共享组件。
- 可由 Label、Tint、Mask、九宫格、Graphics、Tween 或粒子表达的内容不重复导出位图。
- 图标可见尺寸与至少 `48×48` 的触控热区分离。
- `375×817` 固定 HUD 与 `1050` 宽横滑内容保持分层。
- Pixel Art 使用整数逻辑坐标、整数倍缩放和 nearest 过滤。

## 5. 导出 `@3x` 原图

1. 使用 Figma MCP 的素材下载能力将需要入库的位图导出为 PNG，并明确设置 `3x`/`pngScale: 3`。
2. 交付像素尺寸必须严格等于逻辑尺寸的三倍；不得通过下载后放大伪造 `@3x`。
3. 使用英文小写蛇形文件名，并与 Variant/Cocos 状态命名一致。
4. 将未压缩原图保存到：

```text
ArtSource/figma_exports/<scope>/raw_3x/
```

5. 不覆盖、删除或二次压缩原图；不把整页截图当作可交互 UI 资源。

## 6. 使用 TinyPNG 做入库前压缩

TinyPNG 是离线入库步骤，不是 Cocos 运行时处理。

1. 若需要代理操作网页，先加载浏览器控制 Skill，再打开 `https://tinypng.com/`。
2. 只上传当前交付表内的 `raw_3x` PNG；不得上传参考截图、设计文档或范围外素材。
3. 下载压缩结果到：

```text
ArtSource/figma_exports/<scope>/tinypng_3x/
```

4. 保持像素宽高、透明通道、文件名和扩展名不变；不得缩放、裁切或转成 JPEG/WebP。
5. 每张图片只经过一次 TinyPNG；不得把压缩成品再次上传压缩。
6. 不覆盖 `raw_3x`。若网页限制导致文件无法处理，保留原图并向用户说明，不擅自改用其他压缩方式。

TinyPNG 属于有损调色板压缩。小图标、像素边缘、透明阴影和雾气渐变由用户最终检查；发现色带、脏边或透明白边时，改用原始 PNG 或由用户指定其他方案。

## 7. 放入 Cocos 项目

1. 只把 `tinypng_3x` 中的成品复制到交付表约定的 `assets/` 路径。
2. 替换已有 PNG 时只覆盖图片文件，保留原 `.meta`、UUID 和引用。
3. 新增图片时不得创建、复制或伪造 `.meta`；提醒用户打开 Cocos Creator 导入并生成 UUID。
4. Cocos 中按逻辑尺寸显示，例如 `72×72` 的 `@3x` 图标节点尺寸仍为 `24×24`。
5. Camp 页面只能局部修改正式 Scene/Prefab，禁止用场景生成器整体覆盖 `Camp.scene`。
6. 视觉节点与业务状态分离：关注标记、锁定态、选中态等由运行时状态控制显隐或切换。

## 8. 实现与交付说明

完成时报告：

- 使用的 Approved Figma 节点和确认范围。
- 新增或替换的 Cocos 文件，以及保留的 `.meta` 情况。
- `raw_3x` 与 `tinypng_3x` 的保存位置。
- Figma Component/Variant 到 Cocos Prefab/节点的映射。
- 需要用户在 Cocos 中刷新、导入和人工验收的项目。

除非用户在当前任务明确授权，不运行测试、类型检查、构建、预览、场景校验或浏览器/Cocos 视觉验收。
