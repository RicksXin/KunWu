# KunWu Demo 免费素材清单

整理日期：2026-07-29

本目录仅用于玩法 Demo 和灰盒验证。正式 MVP 应逐项替换为统一风格的原创素材，或重新确认届时的授权状态。

## 使用原则

- 优先使用 CC0；CC0 素材虽然不强制署名，项目仍保留来源记录。
- Ark Pixel Font 使用 SIL Open Font License 1.1，发布时必须随字体保留 `OFL.txt`。
- 不将原始素材包单独转售或作为素材库再次分发。
- 不使用《凡人修仙传》的角色姓名、造型、对白、法宝名称或剧情文本。
- Demo 统一建议采用 16×16 环境格、32×32 或 48×48 人物逻辑尺寸、整数倍缩放和 Point/Nearest 采样。

## 已下载素材

| 类别 | 本地目录 | 作者/来源 | 许可 | Demo 用途 | 备注 |
|---|---|---|---|---|---|
| 俯视武者动画 | `Characters/SamuraiTopdown_CC0` | [sebshady / OpenGameArt](https://opengameart.org/content/samurai-sprites) | CC0 | 探索角色、攻击、死亡、斩击 | 48×48帧，适合换色并增加道袍、发髻、剑匣 |
| 侧视武者动作参考 | `Characters/SamuraiSideview_CC0` | [Segel / OpenGameArt](https://opengameart.org/content/samurai-character) | CC0 | 战斗动作节奏参考 | 原图是高清卡通而非像素，Demo 可缩小占位，MVP 不建议直接使用 |
| 僧侣/施法者动画 | `Characters/Monk_CC0` | [rehcub / OpenGameArt](https://opengameart.org/content/2d-character-monk) | CC0 | 阵修、符修、御器占位 | 有待机、攻击、飞行、阅读、转换动作 |
| 动画怪物 | `Enemies/AnimatedMonsters_CC0` | [stealthix / OpenGameArt](https://opengameart.org/content/animated-monsters) | CC0 | 骷髅、尸傀、邪修占位 | 含待机、行走、攻击、受击、倒地 |
| 法术序列帧 | `VFX/SpellEffects_CC0` | [StarsteelGaming / OpenGameArt](https://opengameart.org/content/spell-effects-by-starsteelgaming) | CC0 | 火法、冰锥、雷法 | 可换色为剑气、煞气、灵焰 |
| 地牢 Tilemap | `Environment/PunyDungeon_CC0` | [Shade / OpenGameArt](https://opengameart.org/content/16x16-puny-dungeon-tileset) | CC0 | 洞府、封印遗迹、机关 | 含16×16地砖、门、陷阱、火焰、传送门和Tiled示例 |
| 俯视地牢与人物 | `Environment/TopdownDungeonCharacter_CC0` | [profpatonildo / OpenGameArt](https://opengameart.org/content/pixel-art-top-down-dungeon-tileset-and-rpg-character-with-animations) | CC0 | 快速搭建探索原型 | 含可编辑Aseprite文件 |
| 像素 UI | `UI/KenneyPixelUI_CC0` | [Kenney](https://www.kenney.nl/assets/pixel-ui-pack) | CC0 | 按钮、面板、滑条和选择框 | 建议重新配色为墨黑、石青、朱砂 |
| 符文图标 | `Icons/KenneyRunes_CC0` | [Kenney](https://www.kenney.nl/assets/rune-pack) | CC0 | 阵纹、禁制、状态和技能图标 | 含PNG、SpriteSheet和矢量源文件 |
| 中文像素字体 | `Fonts/ArkPixel12px_OFL` | [TakWolf / Ark Pixel Font](https://github.com/TakWolf/ark-pixel-font) | OFL-1.1 | 中文正文与UI | 简体中文使用 `ark-pixel-12px-proportional-zh_cn.ttf` |

原始下载页快照保存在 `_license_snapshots`，原始压缩包保存在 `_archives`。

## 压缩包校验

| 文件 | SHA-256 |
|---|---|
| `animated_monsters.zip` | `1D7C1742E1E4C64E9DD07869DC2A46CE7C8E47FFC06D6B1F87745E518BC5A423` |
| `ark_pixel_font_12px.zip` | `46220875DD8A88F2A0E2E25DF2732AF6B5749E02BF4B06BA66520B7F163AD109` |
| `kenney_pixel_ui.zip` | `B76F2F60F2BE76EB8E66511038FA4D48FAEC11E638316FA37D06084878CDF0C7` |
| `kenney_runes.zip` | `FBC69B7036E399D56AAE249C667476A7C6E50E80A8612030E1CA17DDB9C1B2D9` |
| `monk.zip` | `62C55A3F26F455DCDE46C357740E9E10E283DDE844CF362DA60190BF7B8D0C2A` |
| `puny_dungeon.zip` | `22FD85633CCD3D92FF7F4F036CC3934841EF497637F34E22C90431D479FA7954` |
| `samurai_sideview.zip` | `F7B19F54339214E935AA575A36CF98452E07805852E164C389BEF2F975F86954` |
| `samurai_topdown.zip` | `89A294B00A2C4186D7E049784B7230CAC7484D9EAB66E8DBE2C5D898379CB307` |
| `spell_effects.zip` | `B5692931609436BC11FED995393BA560080043C448EF37AEE6C636425FD56C4E` |
| `topdown_dungeon_character.zip` | `F0CF1A8216CD072834AE230D5A244328835510DC402DE63357124C3208C80980` |

## 原创修仙化改造建议

Demo 不需要重画像素动作，可以在现有动作帧上做覆盖层：

1. 将武士头盔替换为发髻、玉冠或斗笠。
2. 将盔甲替换为道袍、护肩、腰牌和储物袋。
3. 刀替换为飞剑、拂尘、阵旗、葫芦或符箓。
4. 在背部增加剑匣、药篓、灵兽袋等职业轮廓。
5. 以青白、玄黑、朱砂、土黄区分不同流派。
6. 施法动作复用攻击帧，但额外叠加符纹、残影、雷弧和法宝 Sprite。

建议的首批原创角色代号：

- 青锋客：飞剑与破甲。
- 玄甲士：护体和反击。
- 丹霞子：丹药、火法和治疗。
- 伏阵生：阵旗、封锁和移位。

这些名称和外形均为项目原创占位，不对应原著人物。
