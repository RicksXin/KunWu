# Kenney Pixel UI Pack

第三方素材来源与许可记录（CLAUDE.md「第三方素材」要求）。

## 来源

| 项 | 值 |
|---|---|
| 名称 | Kenney UI Pack (Pixel Adventure / RPG Expansion) |
| 作者 | Kenney（<https://kenney.nl>） |
| 许可 | CC0 1.0 Universal（公共领域奉献） |
| 本地副本 | `ThirdParty/DemoAssets/UI/KenneyPixelUI_CC0/` |
| 许可快照 | 同目录 `License.txt` |

## 为何放在 `assets/third_party/`

引擎只能加载 `assets/` 下的资源，而 PRD-11 §135 与 CLAUDE.md 要求
第三方素材**不得混入原创目录**。故单列 `assets/third_party/` 作为隔离区：
既能被引擎加载，又与 `assets/art/` 的原创资产分开，便于 P4 阶段整体替换
（PRD-00 §5：P4 做原创资产替换和许可复核）。

## 已导入文件

取自 `9-Slice/Ancient/`（暗色调界面用灰/褐两套）与 `9-Slice/space.png`。
未导入其余 30 个 png，避免首屏体积无谓增长（PRD-10 §7 预算 < 25MB）。

| 文件 | 用途 | SHA-256 |
|---|---|---|
| `grey.png` | 按钮常态 | `4b6eadb1565f2b7890001b19e978eaf64830efa618dae554b43d0af4122fccde` |
| `grey_pressed.png` | 按钮按下态 | `38068e8040ed94573d85e0c8a11eda017d83562e7d73c81cd5e21803b660c648` |
| `grey_inlay.png` | 凹陷底（资源栏） | `770265d3a33978bd887fe12159fe940cc9c83a7ed6fa71d4f718b70b22ecc2ed` |
| `brown.png` | 建筑按钮常态 | `5223c9086c245cbee564debb9c0bd95cb03d5df1e44859ed5a2fc4ccaf7790ed` |
| `brown_pressed.png` | 建筑按钮按下态 | `84d338ce6e30b072ca35dc86740eea1d747f7878a70ca8bc311f5b1016e5e1e2` |
| `panel.png` | 面板底（弹窗），源文件名 `space.png` | `4eb96da68441bb9892bee9bb2a31510ccec02a19d6a85209ca16e35f64ec0d1f` |

## 使用注意

- **9-Slice 必须在编辑器中设置 Border**，否则拉伸时圆角会变形。
  数值见各图，通常四边留 6–8 像素。
- 这些图是像素画，`filterMode` 必须为 `nearest`
  （`.creator/default-meta.json` 已设为默认，新导入无需手改）。
- CC0 无署名义务，但 Credits 页仍应列出（PRD-00 §5：P4 许可复核）。

## 替换计划

P4 阶段由原创像素 UI 替换。替换时只需改 `assets/third_party/` 的引用指向
`assets/art/ui/`，不涉及逻辑代码——Sprite 引用集中在场景与 Prefab 中。
