import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const projectRoot = "D:/Developer/Project/KunWu";
const outputDir = path.join(projectRoot, "outputs", "art_asset_gap_20260731");
const previewDir = path.join(projectRoot, ".codex_tmp", "art_asset_gap_20260731", "previews");
const outputPath = path.join(outputDir, "昆吾禁地_美术素材缺口清单_20260731.xlsx");

const item = (
  id,
  phase,
  priority,
  category,
  module,
  asset,
  target,
  unit,
  formal,
  temporary,
  blocker,
  spec,
  tempPlan,
  acceptance,
  ip,
  source,
) => ({
  id,
  phase,
  priority,
  category,
  module,
  asset,
  target,
  unit,
  formal,
  temporary,
  blocker,
  spec,
  tempPlan,
  acceptance,
  ip,
  source,
});

const gaps = [
  item("ART-HALL-001", "P2公开Demo", "P0-立即", "场景", "营地大厅", "营地后景横向长卷（封印山体、瀑布、云层、远处法光）", 1, "套", 0, 3, "部分", "按375:817视窗展示；独立于建筑层；建议覆盖2.8倍设计宽并留横滑余量", "继续使用3张大厅参考图和纯色灰盒，仅作构图参考", "左右边界不露空白；中部默认视口能读出山门与主殿层级", "必须原创，不临摹原作场景构图", "Docs/02 §6.1；PRD-01"),
  item("ART-HALL-002", "P2公开Demo", "P0-立即", "场景", "营地大厅", "营地中景地面与道路模块（台基、道路、坡地、溪流）", 1, "套", 0, 1, "部分", "像素模块化；与七建筑热区分离；Point过滤", "使用Camp.scene彩色矩形灰盒", "道路可读、建筑落点统一、横滑时无拼接断层", "原创修仙营地语汇", "Docs/02 §6.1；Docs/08 §1.2"),
  item("ART-HALL-003", "P2公开Demo", "P1-高", "场景", "营地大厅", "营地前景遮挡层（旗杆、药篓、木箱、近景草木）", 1, "套", 0, 0, "否", "透明PNG/图集；不能遮住建筑标签与入口", "先不放前景或使用简单色块", "横滑视差自然；关键按钮无遮挡", "原创", "Docs/02 §6.1"),
  item("ART-HALL-004", "P2公开Demo", "P0-立即", "建筑", "营地大厅", "七座成长建筑锁定/未解锁外观", 7, "座", 0, 7, "部分", "招贤馆、百宝库、还魂殿、灵圃、炼器坊、交易行、议事殿；独立Sprite", "继续使用320×240建筑灰盒和文字标签", "25%缩放仍可按轮廓识别；锁定态不只靠灰度", "原创建筑，不复刻原作建筑", "Docs/02 §6.1、§12；PRD-11 §8"),
  item("ART-HALL-005", "P2公开Demo", "P0-立即", "建筑", "营地大厅", "七座成长建筑已解锁外观", 7, "座", 0, 7, "部分", "与锁定态同锚点、同占地；可叠加灯火和状态标记", "继续使用建筑灰盒", "视觉锚点分别体现悬榜、铜锁、魂灯、梯田、炉火、价牌、主旗", "原创", "Docs/02 §6.1、§12"),
  item("ART-HALL-006", "P2公开Demo", "P0-立即", "建筑", "营地大厅", "传送阵/入山入口", 1, "座", 0, 1, "是", "建议360×190逻辑框；阵纹、台基、激活/禁用两态", "使用传送阵文字灰盒", "默认中部完整可见；禁用时仍说明原因", "原创阵纹", "Docs/02 §6.1；Docs/08 §1.2.5"),
  item("ART-HALL-007", "P2公开Demo", "P1-高", "建筑", "营地大厅", "四个未开放场景锚点（竞技场、遗迹、圣迹、教会）", 4, "处", 0, 4, "否", "背景建筑剪影；明确封锁且不伪装成按钮", "保留场景文字锚点", "玩家能识别竞技场但不会误认为已开放", "原创", "Docs/02 §6.1；PRD-01"),
  item("ART-HALL-008", "P2公开Demo", "P1-高", "场景", "营地大厅", "营地环境摆件包（旗、箱、药篓、灯、货架、驮兽）", 1, "套", 0, 0, "否", "16×16基础像素网格，按32/48像素模块组合", "复用纯色块，不影响逻辑", "不抢建筑轮廓；同屏主色不超过三组", "原创", "Docs/02 §6.1"),
  item("ART-HALL-009", "P2公开Demo", "P1-高", "角色", "营地大厅", "走动杂役/NPC小人变体", 3, "名", 0, 0, "否", "32×32或48×48；Idle/Walk；2.5头身", "暂不显示走动角色", "不遮入口；循环无滑步；外观与原作角色无相似组合", "原创人物", "Docs/04 §11"),
  item("ART-HALL-010", "P1核心闭环", "P0-立即", "角色", "营地NPC", "岑守一列表头像", 1, "个", 0, 1, "部分", "建议64×64或96×96；清晰职业/身份轮廓", "使用文字列表和通用头像灰盒", "列表和对话中身份一致，缩小后可读", "原创NPC造型与姓名", "Docs/08 §1.2.5；PRD-08"),
  item("ART-HALL-011", "P2公开Demo", "P1-高", "角色", "营地NPC", "岑守一半身立绘/表情", 3, "张", 0, 0, "否", "正常、严肃、释然三态；像素半身或高像素立绘", "对话继续使用文字与纯色面板", "不依赖长动画表达情绪；不与原作角色相似", "原创NPC造型", "Docs/04 §12"),
  item("ART-HALL-012", "P2公开Demo", "P1-高", "动画", "营地大厅", "营地环境循环动画包（炊烟、灯火、旗帜、云、水）", 1, "套", 0, 0, "否", "局部循环帧+Tween；同屏环境动画≤25", "Demo先仅做Tween或静态", "循环无跳帧；低端Web设备可关闭", "原创/可登记CC0来源", "Docs/03 §5；Docs/04 §11"),

  item("ART-UI-001", "P1核心闭环", "P0-立即", "UI", "全局", "原创UI基础组件包（面板、按钮、页签、列表、进度条、弹窗、输入态）", 1, "套", 0, 6, "是", "墨色木/石底板、青铜与玉边框、朱砂选中；九宫格", "使用Kenney Pixel UI 6张PNG和Cocos纯色节点", "48×48dp触控；正常/悬停/按下/禁用可辨", "Kenney仅可作Demo，占位与原创分目录", "Docs/02 §7；PRD-11 §8"),
  item("ART-UI-002", "P1核心闭环", "P0-立即", "图标", "全局资源", "七种资源图标（灵粮、灵木、玄铁、灵晶、庚精、灵石、魂晶）", 7, "个", 0, 0, "是", "源尺寸24×24/32×32；高对比像素轮廓", "文字缩写或通用几何占位", "24×24仍能分辨；灵晶与灵石不能混淆", "原创符号；不得沿用原作法宝轮廓", "Docs/02 §8、§12；PRD-11 §8"),
  item("ART-UI-003", "P2公开Demo", "P0-立即", "图标", "修士详情/检定", "七维属性图标（力道、法力、神识、遁速、肉身、护体、定力）", 7, "个", 0, 0, "是", "24×24/32×32；图形+文字双重表达", "使用属性首字和色块", "属性检定与战斗详情中含义一致", "原创", "Docs/PRD/03 §8；PRD-11 §8"),
  item("ART-UI-004", "P2公开Demo", "P1-高", "UI", "修士卡牌", "六档灵根资质边框", 6, "个", 0, 0, "部分", "名称、轮廓纹理和颜色同时变化", "使用灵根文字+单色描边", "色弱模式下仍可辨认；异灵根不使用暗红", "原创", "PRD-11 §8；PRD-03 §3"),
  item("ART-UI-005", "P2公开Demo", "P1-高", "UI", "物品/装备", "五装备品质边框", 5, "个", 0, 0, "部分", "颜色、角纹与品质文字同时变化", "使用文字和普通边框", "缩略图中不只靠颜色区分", "原创", "PRD-11 §8"),
  item("ART-UI-006", "P1核心闭环", "P0-立即", "图标", "大厅底部HUD", "设置、成就、排行榜、邮件、日常进度图标", 5, "个", 0, 5, "部分", "建议24×24或32×32；未开放态统一覆盖", "继续使用文字按钮/灰盒", "设置可点击；其余四项明确未开放且无红点", "原创或CC0占位需登记", "Docs/02 §7.3；Docs/08 §1.2.6"),
  item("ART-UI-007", "P1核心闭环", "P0-立即", "图标", "全局操作", "通用操作图标包（返回、关闭、确认、取消、信息、锁、刷新、加减等）", 16, "个", 0, 0, "是", "16×16、24×24、32×32三档；统一笔触", "文字按钮临时代替", "鼠标与触控含义一致；禁用态清楚", "原创或许可明确的CC0", "PRD-09 §4"),
  item("ART-UI-008", "P2公开Demo", "P0-立即", "图标", "战斗/职业", "Demo技能图标", 16, "个", 0, 0, "是", "24×24/32×32；按剑气、灵火、雷法、阵法、治疗、魔气分类", "用技能首字/几何符纹占位", "三个技能起手与图标都能区分", "Demo可用登记CC0；MVP必须原创", "Docs/02 §8、§12"),
  item("ART-UI-009", "P2公开Demo", "P0-立即", "图标", "仓库/装备", "Demo装备图标", 20, "个", 0, 0, "是", "24×24/32×32；武器、防具、饰品分类轮廓", "使用纯色方块+物品名", "同类装备在24×24下可区分", "原创或登记CC0占位", "Docs/02 §12；PRD-07"),
  item("ART-UI-010", "P2公开Demo", "P1-高", "图标", "仓库/掉落", "材料与任务物图标包", 12, "个", 0, 0, "部分", "矿石、木材、符片、魂火、Boss任务物", "复用资源图标并加文字", "任务物与普通材料有独立角标", "原创", "PRD-07；PRD-08"),
  item("ART-UI-011", "P2公开Demo", "P0-立即", "图标", "任务/地图", "任务与POI图标包（阵眼、洞府、资源、营地、残碑、传送、出口等）", 16, "个", 0, 0, "是", "地图上建议24×24；已完成/未完成双态", "使用文字缩写和简单几何", "复杂地图中3秒内可发现交互点", "原创", "Docs/05 §8；PRD-09 §6"),
  item("ART-UI-012", "P2公开Demo", "P0-立即", "图标", "地图Boss", "主线、支线、野外Boss三类地图标记", 3, "个", 0, 0, "是", "实心朱印、空心蓝印、带角金印", "用文字“主/支/野”占位", "不依赖颜色也能一眼区分", "原创", "Docs/03 §6.1；PRD-11 §8"),
  item("ART-UI-013", "P1核心闭环", "P0-立即", "图标", "营地建筑", "建筑状态图标（锁定、可进入、可升级）", 3, "个", 0, 3, "部分", "24×24；锁、门/光点、上箭头；可叠加在建筑Sprite", "继续使用LOCKED/AVAILABLE/UNLOCKED文字", "状态与点击反馈一致；不可只靠灰度", "原创", "PRD-11 §8；Docs/08 §1.2.5"),
  item("ART-UI-014", "P1核心闭环", "P0-立即", "UI", "建筑与生产", "灵圃生产弹窗视觉套件", 1, "套", 0, 0, "是", "主/招募/储量升级弹窗共用纵向九宫格、资源行底板、复用大厅三种资源图标、加减按钮、升级/杂役招募/招募/取消/关闭共用按钮三态、30秒周期条；不制作专用确认弹窗PNG", "先用Kenney面板、纯色资源行和文字按钮接线", "无需切换场景；资源行显示库存/上限和升级；等待30秒能看到资源变化；灵粮或灵木不足时对应确认按钮禁用", "原创UI；只参考第三方截图的信息层级，不复制双龙边框、升级按钮或其他具体造型", "Docs/08 §1.3；Docs/14 §5"),
  item("ART-UI-015", "P1核心闭环", "P0-立即", "UI", "修士与编队", "名册、详情、四人编队页面视觉套件", 1, "套", 0, 0, "是", "七维、三技能、灵根、境界、死亡/伤势、四槽位", "先用列表和色块头像", "无前后排暗示；死亡修士不可编队", "原创UI", "Docs/Demo/05 §1.4；PRD-03/04"),
  item("ART-UI-016", "P2公开Demo", "P1-高", "UI", "招募与转职", "招贤馆、候选卡和职业树页面视觉套件", 1, "套", 0, 0, "部分", "三候选、刷新价格、六初始/十二一转节点", "先用文字卡片和节点连线", "分支定位、技能与成长差异可读", "原创UI", "PRD-03 §4、§7"),
  item("ART-UI-017", "P1核心闭环", "P0-立即", "UI", "背包/装备/入山", "仓库、装备与入山装载页面视觉套件", 1, "套", 0, 0, "是", "物品格、负重条、灵粮携带、确认入山", "使用基础网格和文字", "玩家能区分灵粮与负重并看到无法入山原因", "原创UI", "Docs/08 §1.5–1.6；PRD-07"),
  item("ART-UI-018", "P1核心闭环", "P0-立即", "UI", "地图探索", "地图HUD、格子选中、路径与检定页面视觉套件", 1, "套", 0, 0, "是", "坐标、灵粮、负重、探查范围、任务、回营；路径消耗", "灰盒HUD与颜色高亮", "未知格不泄露对象；检定后果清楚", "原创UI", "PRD-09 §6；PRD-05"),
  item("ART-UI-019", "P1核心闭环", "P0-立即", "UI", "战斗/结算", "战斗HUD与回城结算视觉套件", 1, "套", 0, 0, "是", "四头像、行动条、三技能、状态、敌血、嘲讽、1×/2×、暂停", "纯色头像框、文本状态和进度条", "不表现前后排；关键信息在低特效下仍完整", "原创UI", "PRD-09 §7；PRD-04"),
  item("ART-UI-020", "P2公开Demo", "P1-高", "UI", "任务/对话", "主支线、对话、回看页面视觉套件", 1, "套", 0, 1, "部分", "任务层级、目标、奖励、NPC头像/立绘区", "沿用现有NPC列表和全屏对话灰盒", "主线目标一屏可读；可回看且可快速跳过", "原创UI", "PRD-08；PRD-09 §3"),
  item("ART-UI-021", "P2公开Demo", "P1-高", "UI", "新手引导", "高亮遮罩、指示箭头、手势与步骤提示素材包", 1, "套", 0, 0, "部分", "鼠标/触控均可理解；安全区内显示", "用半透明矩形和文字提示", "一次只要求一个动作；可跳过/回看", "原创UI", "PRD-09 §8"),
  item("ART-UI-022", "P2公开Demo", "P2-中", "UI", "设置/Credits", "设置、许可证和Credits正式页面视觉套件", 1, "套", 0, 1, "否", "音量、闪光、震屏、字号、许可列表", "保留现有设置页面壳", "许可证文本可滚动且不截断", "必须展示OFL和第三方署名", "PRD-09 §3、§9"),
  item("ART-UI-023", "P3B五图MVP", "P2-中", "图标", "职业/技能", "新增一转技能图标（补足54主动技能）", 38, "个", 0, 0, "否", "在Demo 16个基础上增补至54；同系统一笔触", "阶段开发时继续用符号占位", "每对分支至少两个技能视觉差异明显", "MVP原创", "PRD-03 §11"),
  item("ART-UI-024", "P3C五图MVP", "P2-中", "图标", "装备", "新增装备图标（补足120件）", 100, "个", 0, 0, "否", "在Demo 20个基础上增补；可复用底型但不能只换色", "沿用文字物品格", "同底型需有材质或轮廓差异", "MVP原创", "Docs/02 §12"),

  item("ART-CHR-001", "P2公开Demo", "P0-立即", "角色", "地图探索", "六初始职业探索造型源稿", 6, "名", 0, 0, "是", "2.5头身；32×32或48×48；武修/法修/医修/潜修/符修/体修", "可先用统一色块小人+职业符号", "25%缩放可识别职业；无原作肖像相似", "必须原创或深度改造CC0", "Docs/02 §4.2、§12"),
  item("ART-CHR-002", "P2公开Demo", "P0-立即", "动画", "地图探索", "六初始职业四方向探索动画图集", 6, "套", 0, 0, "是", "Idle4、Walk6、Interact4、Hurt3、Down6；四方向", "Demo可用登记免费素材改造，先接通1套公共动作", "脚底不滑；武器位置不跳；事件帧齐全", "Demo可CC0改造，MVP原创替换", "PRD-11 §4/§6；Docs/04 §3.1"),
  item("ART-CHR-003", "P2公开Demo", "P0-立即", "角色", "战斗", "六初始职业战斗造型源稿", 6, "名", 0, 0, "是", "64×64；3–3.5头身；单方向侧视", "使用几何占位或临时免费素材", "肩宽与武器适度夸张；职业剪影清楚", "MVP原创", "Docs/02 §4；Docs/02 §12"),
  item("ART-CHR-004", "P2公开Demo", "P0-立即", "动画", "战斗", "六初始职业完整战斗动画图集", 6, "套", 0, 0, "是", "Idle4–6、Attack6–10、Cast8–12、Hurt3–4、Death8–12、Revive6–8", "先让固定新手队使用可替换公共动作", "cast_commit/hit_frame/recover_start/end标记正确", "Demo可用许可素材；MVP原创", "PRD-11 §6；Docs/04 §3.2"),
  item("ART-CHR-005", "P2公开Demo", "P0-立即", "角色", "武修一转", "护山卫与飞剑客战斗造型源稿", 2, "名", 0, 0, "是", "护山卫盾牌低重心；飞剑客剑匣窄袖锐利轮廓", "在武修灰盒上加盾/剑匣色块", "两分支不能只换色；职责从剪影可读", "原创", "Docs/02 §4.3；PRD-03 §6"),
  item("ART-CHR-006", "P2公开Demo", "P0-立即", "动画", "武修一转", "护山卫与飞剑客完整战斗动画图集", 2, "套", 0, 0, "是", "各含三技能差异动作及通用受击/死亡/复活", "复用武修底层动作并加差异Pose", "盾击、挑衅、反击与单体/群体剑技可分辨", "原创关键Pose", "PRD-11 §4；Docs/04 §4"),
  item("ART-CHR-007", "P1核心闭环", "P0-立即", "角色", "修士名册", "四名固定新手修士差异化头像", 4, "个", 0, 0, "是", "64×64/96×96；同职业也需发髻、体型或配饰差异", "通用色块头像+姓名首字", "四人编队中不会认错角色", "原创", "Docs/08 §1.4；PRD-03 §11"),
  item("ART-CHR-008", "P2公开Demo", "P1-高", "图标", "职业树", "十八职业节点图标（6初始+12一转）", 18, "个", 0, 0, "部分", "24×24/32×32；保留职业血缘又体现分支职责", "用职业名首字+连线占位", "职业卡不只靠服装猜测分支", "原创", "Docs/02 §4.3"),
  item("ART-CHR-009", "P2公开Demo", "P1-高", "角色", "换装挂点", "Demo武器与背部法宝挂件包", 6, "件", 0, 0, "否", "weapon_hand、weapon_back、effect_origin挂点；逐帧稳定", "武器直接烘焙进角色图集", "挂点无抖动；不遮关键动作", "原创法器轮廓", "Docs/04 §9"),
  item("ART-CHR-010", "P3B五图MVP", "P2-中", "角色", "完整一转", "其余十个一转职业造型源稿", 10, "名", 0, 0, "否", "在武修两分支外补齐雷法师等十个分支", "继续复用初始职业灰盒", "每对分支在轮廓和至少两套技能动作上显著不同", "MVP原创", "Docs/02 §4.3；PRD-03 §6"),
  item("ART-CHR-011", "P3B五图MVP", "P2-中", "动画", "完整一转", "其余十个一转职业战斗动画图集", 10, "套", 0, 0, "否", "复用身体底层；每分支至少重制两组Attack/Cast", "阶段开发时复用初始动作", "动作命中帧与技能逻辑同步", "MVP原创关键Pose", "PRD-11 §4；Docs/04 §4.1"),
  item("ART-CHR-012", "P3B五图MVP", "P3-远期", "角色", "招募外观池", "六职业招募外观变体", 12, "名", 0, 0, "否", "每初始职业至少2个体型/发型组合；共用动作底层", "同职业共用单一形象", "随机招募不会频繁出现完全同脸", "原创且避开原作人物组合", "PRD-03 §2"),

  item("ART-ENM-001", "P2公开Demo", "P0-立即", "敌人", "地图1", "地图1普通敌人造型", 6, "种", 0, 0, "是", "石灵/尸傀等；普通怪≤20主色；64×64战斗框", "几何色块或登记免费怪物素材", "轮廓和攻击职责可区分", "Demo可CC0改造，MVP原创", "Docs/02 §5、§12；PRD-06"),
  item("ART-ENM-002", "P2公开Demo", "P0-立即", "敌人", "地图1", "地图1精英造型", 2, "种", 0, 0, "是", "在族群部件上增加独立武器/核心，不只放大换色", "普通敌人加明显精英标记占位", "一眼识别为高威胁", "原创差异部件", "Docs/02 §12；PRD-06"),
  item("ART-ENM-003", "P2公开Demo", "P0-立即", "Boss", "地图1", "守门石灵与尸傀头领造型", 2, "个", 0, 0, "是", "96×96或128×128；独立弱点、阶段轮廓与地图地标", "放大灰盒+文字预警，仅用于逻辑", "危险技能0.6–1.5秒预警；不能只换色放大", "原创", "Docs/05 §3；PRD-06 §5"),
  item("ART-ENM-004", "P2公开Demo", "P0-立即", "动画", "地图1战斗", "地图1敌人战斗动画图集", 10, "套", 0, 0, "是", "6普通+2精英+2首领；Idle/Attack或Cast/Hurt/Death", "先复用少量公共动作图集", "死亡后不再Idle；10单位同屏达性能目标", "Demo许可素材需登记", "Docs/04 §3.2；Docs/04 §15"),
  item("ART-ENM-005", "P3A地图2", "P1-高", "敌人", "地图2", "地图2普通敌人造型", 5, "种", 0, 0, "否", "尸傀、木魅、禁制化形主题", "地图2预览不进入完整战斗", "与地图1族群有部件血缘但职责可读", "原创", "PRD-06 §5/§9"),
  item("ART-ENM-006", "P3A地图2", "P1-高", "敌人", "地图2", "地图2精英造型", 2, "种", 0, 0, "否", "机制型精英独立核心/武器", "后续制作", "不只换色", "原创", "PRD-06 §9"),
  item("ART-ENM-007", "P3A地图2", "P1-高", "Boss", "地图2", "封坛尸将、木魅妖母、银甲尸王造型", 3, "个", 0, 0, "否", "96/128像素；三种职责与剪影；封坛尸将含三阶段", "Demo仅制作封坛尸将轮廓预览", "三类Boss标记与战斗轮廓一致", "原创个体，避免原作妖物复刻", "Docs/02 §5.2；PRD-06 §5"),
  item("ART-ENM-008", "P3A地图2", "P1-高", "动画", "地图2战斗", "地图2敌人战斗动画图集", 10, "套", 0, 0, "否", "5普通+2精英+3Boss；Boss含阶段切换", "后续制作", "预警、阶段与逻辑事件帧对齐", "原创/许可清晰", "PRD-11 §5/§6"),
  item("ART-ENM-009", "P3B五图MVP", "P2-中", "敌人", "地图3", "地图3普通/精英/Boss造型", 10, "种", 0, 0, "否", "5普通+2精英+3Boss；傀儡、器灵、邪修主题", "后续制作", "机械关节、能量体和人形高速轮廓清楚", "原创", "Docs/02 §2；PRD-06 §5"),
  item("ART-ENM-010", "P3B五图MVP", "P2-中", "动画", "地图3战斗", "地图3敌人战斗动画图集", 10, "套", 0, 0, "否", "普通/精英/Boss完整动作", "后续制作", "器灵半透明效果与命中轮廓兼容", "原创", "PRD-11 §5/§6"),
  item("ART-ENM-011", "P3B五图MVP", "P2-中", "敌人", "地图4", "地图4普通/精英/Boss造型", 8, "种", 0, 0, "否", "4普通+1精英+3Boss；残魂、玄岩兽、魔道猎手", "后续制作", "低矮厚重与细长锐利轮廓有强对比", "原创", "Docs/02 §2；PRD-06 §5"),
  item("ART-ENM-012", "P3B五图MVP", "P2-中", "动画", "地图4战斗", "地图4敌人战斗动画图集", 8, "套", 0, 0, "否", "普通/精英/Boss完整动作", "后续制作", "残魂透明不影响受击可读性", "原创", "PRD-11 §5/§6"),
  item("ART-ENM-013", "P3C五图MVP", "P2-中", "敌人", "地图5", "地图5普通/精英/Boss造型", 9, "种", 0, 0, "否", "4普通+1精英+3地区Boss+1最终Boss", "后续制作", "实体、能量体、尸身与最终Boss轮廓分层", "原创", "Docs/02 §2；PRD-06 §5"),
  item("ART-ENM-014", "P3C五图MVP", "P2-中", "动画", "地图5战斗", "地图5敌人战斗动画图集", 9, "套", 0, 0, "否", "含最终Boss多阶段/部件破坏；分层≤12 Sprite", "后续制作", "阶段变化不只换色；不遮战斗UI", "原创", "Docs/04 §2、§13"),

  item("ART-MAP-001", "P1核心闭环", "P0-立即", "地图", "全局探索", "迷雾、已探索与当前可见三态视觉素材", 1, "套", 0, 0, "是", "低分辨率Mask+噪声边缘+轻雾纹理；低画质变体", "先使用黑色/半透明矩形遮罩", "未知/已探索/可见不混淆；已探索地形可读", "原创纹理或程序生成", "Docs/03 §6；Docs/05 §6"),
  item("ART-MAP-002", "P1核心闭环", "P0-立即", "地图", "全局探索", "队伍棋子、选中格、路径与移动消耗标记", 1, "套", 0, 0, "是", "32×32/48×48；整数坐标；路径含方向和消耗", "使用纯色方格、线段和数字", "鼠标与触控都能确认目标格；不泄露未知格", "原创", "PRD-09 §6"),
  item("ART-MAP-003", "P2公开Demo", "P0-立即", "地图", "地图公共对象", "十二类POI场景物件（阵眼、洞府、资源、营地、残碑、传送、出口等）", 12, "类", 0, 0, "是", "16×16源Tile组合；带可交互呼吸高光挂点", "使用图标+文字对象", "3秒内能发现；完成态保持坐标稳定", "原创", "Docs/05 §8；Docs/02 §6.2"),
  item("ART-MAP-004", "P2公开Demo", "P0-立即", "地图", "资源点", "五类野外资源节点", 5, "类", 0, 0, "是", "灵粮、灵木、玄铁、灵晶、庚精；采集前后双态", "使用资源图标落点", "资源类型和是否采集清楚", "原创", "Docs/05 §9"),
  item("ART-MAP-005", "P2公开Demo", "P0-立即", "地图", "地图1破禁山麓", "地图1 TileSet（山石、残符、废营、木栈道）", 1, "套", 0, 0, "是", "Tile源16×16；覆盖48×64地图；地表/边缘/装饰分层", "使用测试Tile和纯色逻辑格", "可走/不可走无需碰撞线也能识别", "Demo可改造CC0，MVP统一原创", "Docs/02 §2、§3；Docs/05 §3"),
  item("ART-MAP-006", "P2公开Demo", "P0-立即", "地图", "地图1破禁山麓", "地图1大地标与事件构筑包", 4, "处", 0, 0, "是", "山门、废营、断崖、外层阵柱；固定坐标构图", "大色块+文字地标", "无需小地图也能判断方位", "原创", "Docs/02 §2；Docs/05 §3"),
  item("ART-MAP-007", "P2公开Demo", "P1-高", "地图", "地图1破禁山麓", "地图1前景遮挡、天气与环境装饰包", 1, "套", 0, 0, "否", "树冠、梁柱、雾带、尘、山雾；可关闭动态表现", "只做静态装饰/不做天气", "不遮交互物；低画质保留路径可读性", "原创/程序纹理", "Docs/02 §6.2；Docs/05 §10–11"),
  item("ART-MAP-008", "P2公开Demo", "P1-高", "地图", "地图1小型副本", "地图1小型副本入口与独立小场景模块", 1, "套", 0, 0, "部分", "石门/洞府入口+小场景背景；含属性检定节点", "使用弹窗或纯色独立场景", "入口尺寸与对比高于普通POI", "原创", "Docs/02 §2.1；Docs/05 §8"),
  item("ART-MAP-009", "P2公开Demo", "P1-高", "地图", "地图2预览", "地图2白玉广场预览Tile与边界景观", 1, "套", 0, 0, "部分", "白玉、铜灯、朱砂阵眼；可进入有限区域", "使用地图1测试Tile换色仅作内部预览", "与地图1视觉主题明显不同；预览边界合理", "公开Demo不得简单换色冒充成品", "Docs/02 §2；PRD-00 §5"),
  item("ART-MAP-010", "P3A地图2", "P1-高", "地图", "地图2白玉广场", "地图2完整TileSet与场景模块", 1, "套", 0, 0, "否", "64×64地图；普通区、事件、小副本、三Boss地标、两类出口", "后续制作", "玉砖、阵眼和洞府构图稳定；地图2→4出口可读", "原创", "Docs/05 §3；PRD-11 §3"),
  item("ART-MAP-011", "P3B五图MVP", "P2-中", "地图", "地图3灵宝遗址", "地图3完整TileSet与场景模块", 1, "套", 0, 0, "否", "铜绿、器架、库门、残器；56×72", "后续制作", "高负重收益区与机关区可读", "原创", "Docs/02 §2；Docs/05 §3"),
  item("ART-MAP-012", "P3B五图MVP", "P2-中", "地图", "地图4古殿群", "地图4完整TileSet与场景模块", 1, "套", 0, 0, "否", "殿柱、丹陛、帷幔、封印令；72×64", "后续制作", "主殿/偏殿/封印令台层级清楚", "原创", "Docs/02 §2；Docs/05 §3"),
  item("ART-MAP-013", "P3C五图MVP", "P2-中", "地图", "地图5镇魔禁域", "地图5完整TileSet与场景模块", 1, "套", 0, 0, "否", "封链、塔砖、魔气、裂隙；64×80", "后续制作", "实体地形与魔气危险区不混淆", "原创", "Docs/02 §2；Docs/05 §3"),
  item("ART-MAP-014", "P2公开Demo", "P1-高", "场景", "战斗背景", "地图1战斗背景/战斗地面", 3, "张", 0, 0, "部分", "普通、精英、Boss三档；不遮单位和预警", "使用纯色渐变或地图Tile拼接", "单位、伤害数字和地面预警清晰", "原创", "Docs/03 §1；PRD-04"),
  item("ART-MAP-015", "P3A地图2", "P2-中", "场景", "战斗背景", "地图2战斗背景/战斗地面", 3, "张", 0, 0, "否", "普通、支线/精英、Boss三档", "后续制作", "白玉地面不吞掉青白技能特效", "原创", "Docs/03 §3"),
  item("ART-MAP-016", "P3B五图MVP", "P3-远期", "场景", "战斗背景", "地图3–5战斗背景包", 9, "张", 0, 0, "否", "每图普通、精英/支线、Boss三档", "后续制作", "与各地图色盘一致且保留预警对比度", "原创", "Docs/02 §2；Docs/03 §3"),

  item("ART-VFX-001", "P2公开Demo", "P0-立即", "特效", "技能基础库", "六类能量基础粒子/序列帧素材", 6, "套", 0, 0, "是", "剑气、灵火、雷法、阵法、治疗、魔气；含发射/飞行/命中", "使用Cocos简单粒子和几何线条", "能量类别不只靠颜色；主体像素边缘清晰", "Demo可用登记CC0，MVP重制", "Docs/03 §3；PRD-11 §7"),
  item("ART-VFX-002", "P2公开Demo", "P0-立即", "特效", "职业技能", "Demo 16个技能表现包", 16, "套", 0, 0, "是", "与技能图标和人物命中帧对应；普通技能短演出", "复用六类能量基础库组合", "技能目标、命中时机和强度可读", "MVP需重制轮廓、节奏和色盘", "Docs/03 §4；Docs/02 §12"),
  item("ART-VFX-003", "P1核心闭环", "P0-立即", "特效", "通用战斗反馈", "命中、暴击、治疗、护盾、闪避、格挡、死亡、复活等反馈包", 12, "个", 0, 0, "是", "伤害数字不被遮挡；可对象池复用", "Tween+文字数字+少量粒子", "关闭高质量特效后规则信息仍完整", "原创/许可明确", "Docs/03 §4.2、§10"),
  item("ART-VFX-004", "P2公开Demo", "P0-立即", "特效", "Boss", "三类Boss地图标记与战斗预警动画", 3, "套", 0, 0, "是", "地面阵纹、电弧聚集、符文倒计时；0.6–1.5秒", "纯色预警圈+倒计时文字", "低画质仍能看到范围和伤害时点", "原创", "Docs/03 §6.1；PRD-06 §10"),
  item("ART-VFX-005", "P2公开Demo", "P1-高", "特效", "地图1 Boss", "守门石灵/尸傀头领阶段切换与终结特效", 2, "套", 0, 0, "部分", "弱点显露、石裂/魂火；不做血腥肢解", "镜头轻震+色闪+文字阶段提示", "阶段轮廓改变且不遮UI", "原创", "Docs/02 §5.2；Docs/03 §8"),
  item("ART-VFX-006", "P1核心闭环", "P0-立即", "特效", "地图探索", "迷雾揭开、神识扩散与属性检定反馈", 1, "套", 0, 0, "是", "Mask扩散、属性汇聚、成功/险过/强行通过三态", "简单遮罩Tween+文字结果", "检定结果和失败代价一眼可读", "程序生成/原创", "Docs/03 §6"),
  item("ART-VFX-007", "P2公开Demo", "P1-高", "特效", "营地/UI", "资源增减、招募、升级、掉落、建筑解锁反馈包", 1, "套", 0, 0, "部分", "轻弹、上浮数字、朱印落下、灰影到完整色彩", "使用Tween和文字Toast", "不使用全屏红闪；重复操作不残留", "原创", "Docs/03 §9"),
  item("ART-VFX-008", "P2公开Demo", "P1-高", "特效", "营地/地图", "传送阵启动与场景切换特效", 1, "套", 0, 0, "部分", "角色溶解、阵纹亮起、切场遮罩", "淡入淡出+加载遮罩", "切场不露黑帧；可跳过长前摇", "原创", "Docs/04 §11"),
  item("ART-VFX-009", "P2公开Demo", "P2-中", "特效", "地图环境", "尘、雨、灵气、魔气环境特效", 4, "套", 0, 0, "否", "分地图Bundle；不超过性能预算；可关闭", "Demo仅静态纹理或不启用", "不遮交互物；低端机关闭后地图仍完整", "原创/程序生成", "Docs/03 §5；Docs/02 §6.2"),
  item("ART-VFX-010", "P2公开Demo", "P0-立即", "特效", "性能适配", "核心特效低画质变体", 1, "套", 0, 0, "是", "减少粒子/柔光/扭曲但保留预警、命中和范围", "直接复用基础几何预警", "桌面与移动Web均可切换且规则不丢失", "与正式VFX同许可", "PRD-11 §7；Docs/03 §11"),

  item("ART-BRAND-001", "P2公开Demo", "P1-高", "品牌", "启动页", "原创游戏Logo/标题字", 1, "个", 0, 0, "部分", "竖屏小尺寸可读；不使用原作Logo字体/构图", "Boot继续显示纯文字标题", "375px宽下清晰；黑底和场景底均可用", "必须原创", "Docs/02 顶部IP说明"),
  item("ART-BRAND-002", "P2公开Demo", "P2-中", "品牌", "主菜单/商店页", "Demo主视觉/封面图", 1, "张", 0, 0, "否", "375:817竖图；原创禁地山门+四人剪影", "使用游戏内大厅/地图截图", "不暗示原作官方授权", "必须原创", "PRD-09 §3"),
  item("ART-BRAND-003", "P3C五图MVP", "P3-远期", "字体", "标题与章节", "定制像素篆刻标题字形", 1, "套", 0, 0, "否", "仅标题/章节使用；正文继续Ark Pixel", "沿用现有OFL字体", "常用标题字符完整且小尺寸可读", "原创字形或明确授权", "Docs/02 §7.2"),
  item("ART-BRAND-004", "P3C五图MVP", "P3-远期", "剧情", "剧情结局", "结局与章节插图", 3, "张", 0, 0, "否", "轻量像素场景/角色剪影；不做长篇逐帧动画", "使用游戏内场景截图+文字", "可跳过、可回看；无原作角色复刻", "必须原创", "Docs/04 §12"),
];

const currentAssets = [
  ["字体", "Ark Pixel 12px 中文字体", 1, "正文与灰盒UI", "是", "是（保留OFL）", "assets/fonts/ark-pixel-12px-proportional-zh_cn.ttf", "OFL；发布包需保留许可证", "继续使用，补充Credits展示"],
  ["UI占位", "Kenney Pixel UI 九宫格", 6, "按钮/面板占位", "是", "否（风格不统一）", "assets/third_party/kenney_pixel_ui/*.png", "本地含License与PROVENANCE", "MVP替换为原创墨色/青铜/朱砂主题"],
  ["参考图", "大厅左/中/右参考图", 3, "大厅构图参考", "仅内部参考", "否", "assets/refer/lobby_left.jpg 等", "来源/商用权不能按正式资产推定", "只用于构图，不直接打包发布"],
  ["灰盒", "Camp三层横滑大厅", 1, "功能与布局验证", "是", "否", "assets/bundles/camp/Camp.scene", "Cocos节点与纯色Sprite，不是正式美术", "按缺口明细逐层替换"],
  ["灰盒", "Boot启动场景", 1, "启动流程验证", "是", "否", "assets/scenes/Boot.scene", "无正式品牌视觉", "补Logo与加载背景"],
  ["数据壳", "地图Bundle清单", 2, "分包和加载验证", "是", "否", "assets/bundles/map_01、map_02", "只有manifest，无Tile/场景资源", "优先补地图1，地图2先做预览包"],
  ["空目录", "正式美术目录", 0, "尚无文件", "否", "否", "assets/art", "当前为空", "建立characters/environment/ui/icons分层"],
  ["空目录", "正式VFX目录", 0, "尚无文件", "否", "否", "assets/vfx", "当前为空", "建立common/skills/environment/boss分层"],
  ["文档提及但本地缺失", "SamuraiTopdown_CC0", 0, "探索人物/斩击占位候选", "否（未下载）", "否", "Docs/02 §9中提及；本地无对应目录", "不能视为已取得许可或已收集", "若使用需重新下载、核验许可、登记来源"],
  ["文档提及但本地缺失", "SamuraiSideview_CC0", 0, "战斗节奏参考候选", "否（未下载）", "否", "Docs/02 §9中提及；本地无对应目录", "未取得本地副本和许可记录", "仅作动作节奏参考，不作为MVP成品"],
  ["文档提及但本地缺失", "Monk_CC0", 0, "施法/御器占位候选", "否（未下载）", "否", "Docs/02 §9中提及；本地无对应目录", "未取得本地副本和许可记录", "下载后仍需重制职业轮廓"],
  ["文档提及但本地缺失", "AnimatedMonsters_CC0", 0, "怪物占位候选", "否（未下载）", "否", "Docs/02 §9中提及；本地无对应目录", "未取得本地副本和许可记录", "下载后需加原创族群部件"],
  ["文档提及但本地缺失", "PunyDungeon_CC0", 0, "遗迹Tile灰盒候选", "否（未下载）", "否", "Docs/02 §9中提及；本地无对应目录", "未取得本地副本和许可记录", "公开Demo前改为白玉/青铜/朱砂语汇"],
  ["文档提及但本地缺失", "TopdownDungeonCharacter_CC0", 0, "地图角色占位候选", "否（未下载）", "否", "Docs/02 §9中提及；本地无对应目录", "未取得本地副本和许可记录", "下载后统一32/48像素比例"],
  ["文档提及但本地缺失", "KenneyRunes_CC0", 0, "技能/禁制图标候选", "否（未下载）", "否", "Docs/02 §8–9中提及；本地无对应目录", "未取得本地副本和许可记录", "可收集作Demo占位，MVP必须原创"],
  ["文档提及但本地缺失", "SpellEffects_CC0", 0, "法术VFX候选", "否（未下载）", "否", "Docs/03 §13中提及；本地无对应目录", "未取得本地副本和许可记录", "若使用需重制轮廓、节奏、色盘和命中段"],
];

const specs = [
  ["基础画布", "参考像素画布", "360×640", "整数倍放大；UI设计视窗另为375×817"],
  ["Web视窗", "PC/H5可见区", "375:817", "高度优先等比缩放；两侧/上下黑边；内容不得整体压扁"],
  ["Cocos设计坐标", "内部设计分辨率", "1080×1920", "大厅全景保留独立横向内容宽度"],
  ["Tile", "地图源尺寸", "16×16", "Point过滤、无抗锯齿、整数坐标"],
  ["探索角色", "逻辑框", "32×32或48×48", "约2.5头身；四方向"],
  ["战斗角色", "逻辑框", "64×64", "约3–3.5头身；单方向侧视"],
  ["Boss", "逻辑框", "96×96或128×128", "占战斗区高度不超过45%"],
  ["UI图标", "源尺寸", "16×16、24×24、32×32", "24×24下仍需辨认"],
  ["颜色", "角色/怪物主色", "角色24–32色；普通怪≤20色", "特效柔光必须放独立层"],
  ["图集", "单张优先上限", "2048×2048", "按职业和地图Bundle拆分"],
  ["探索动画", "帧数基线", "Idle4/Walk6/Interact4/Hurt3/Down6", "逐格移动0.16–0.22秒"],
  ["战斗动画", "帧数基线", "Idle4–6/Attack6–10/Cast8–12/Hurt3–4/Death8–12/Revive6–8", "普通技能演出≤1.2秒"],
  ["Boss预警", "前摇", "0.6–1.5秒", "低画质仍必须保留范围与伤害时点"],
  ["触控", "最小热区", "48×48dp", "鼠标和触控交互等价"],
  ["交付", "每套资产", "源文件+PNG/图集+预览", "附锚点、FPS、事件帧、作者、许可、署名要求"],
  ["IP", "人物与场景", "原创优先", "不得临摹原作人物、服装、Logo、场景构图或法宝外形"],
  ["免费素材", "Demo使用", "许可登记后可用", "MVP不能只换色；需重制剪影、关键Pose、笔触或色盘"],
  ["验收", "可读性", "25%缩放", "职业、敌人层级和交互点仍可辨认"],
];

const workbook = Workbook.create();
const summary = workbook.worksheets.add("汇总");
const detail = workbook.worksheets.add("缺口明细");
const existing = workbook.worksheets.add("已有与参考");
const standard = workbook.worksheets.add("规格与验收");

workbook.comments.setSelf({ displayName: "User" });

const colors = {
  ink: "#15201F",
  dark: "#21312F",
  jade: "#3F7168",
  jadeLight: "#DDEBE6",
  bronze: "#987445",
  parchment: "#F4F0E6",
  red: "#A8463D",
  redLight: "#F5DDDA",
  amber: "#C28B37",
  amberLight: "#F8EBCF",
  green: "#3F7A58",
  greenLight: "#DDEEDF",
  blue: "#416B8A",
  blueLight: "#DFEAF2",
  gray: "#687371",
  grayLight: "#E9EEEC",
  white: "#FFFFFF",
};

for (const sheet of [summary, detail, existing, standard]) {
  sheet.showGridLines = false;
}

// 资源缺口明细
detail.getRange("A1:R1").merge();
detail.getRange("A1").values = [["《昆吾禁地》美术素材缺口明细"]];
detail.getRange("A2:R2").merge();
detail.getRange("A2").values = [["盘点日期：2026-07-31｜范围：视觉美术、动画、VFX、UI；不含音频。正式已有只统计可直接进入发行包的资产，灰盒和参考图单列。"]];
detail.getRange("A4:R4").merge();
detail.getRange("A4").values = [["使用方法：先筛选“优先级=P0-立即”，即可得到当前核心闭环与公开Demo最先要补的素材；K列为公式计算的正式缺口。"]];
const detailHeaders = [["编号", "目标阶段", "优先级", "大类", "页面/场景", "素材包", "目标数量", "单位", "正式已有", "临时/参考", "正式缺口", "当前状态", "阻塞可演示", "规格建议", "Demo临时方案", "验收重点", "IP/许可要求", "需求依据"]];
detail.getRange("A6:R6").values = detailHeaders;
const detailRows = gaps.map((g) => [
  g.id,
  g.phase,
  g.priority,
  g.category,
  g.module,
  g.asset,
  g.target,
  g.unit,
  g.formal,
  g.temporary,
  0,
  "待计算",
  g.blocker,
  g.spec,
  g.tempPlan,
  g.acceptance,
  g.ip,
  g.source,
]);
const detailEnd = 6 + detailRows.length;
detail.getRange(`A7:R${detailEnd}`).values = detailRows;
detail.getRange("K7").formulas = [["=IF(G7>I7,G7-I7,0)"]];
detail.getRange(`K7:K${detailEnd}`).fillDown();
detail.getRange("L7").formulas = [["=IF(I7>=G7,\"正式可用\",IF(J7>0,\"有临时素材/仍需替换\",\"完全缺失\"))"]];
detail.getRange(`L7:L${detailEnd}`).fillDown();
detail.tables.add(`A6:R${detailEnd}`, true, "ArtGapTable").style = "TableStyleMedium2";
detail.freezePanes.freezeRows(6);
detail.freezePanes.freezeColumns(6);
detail.getRange(`B7:B${detailEnd}`).dataValidation = { rule: { type: "list", values: ["P1核心闭环", "P2公开Demo", "P3A地图2", "P3B五图MVP", "P3C五图MVP"] } };
detail.getRange(`C7:C${detailEnd}`).dataValidation = { rule: { type: "list", values: ["P0-立即", "P1-高", "P2-中", "P3-远期"] } };
detail.getRange(`M7:M${detailEnd}`).dataValidation = { rule: { type: "list", values: ["是", "部分", "否"] } };
detail.getRange(`C7:C${detailEnd}`).conditionalFormats.add("containsText", { text: "P0-立即", format: { fill: colors.redLight, font: { bold: true, color: colors.red } } });
detail.getRange(`C7:C${detailEnd}`).conditionalFormats.add("containsText", { text: "P1-高", format: { fill: colors.amberLight, font: { bold: true, color: "#7B541D" } } });
detail.getRange(`L7:L${detailEnd}`).conditionalFormats.add("containsText", { text: "完全缺失", format: { fill: colors.redLight, font: { color: colors.red } } });
detail.getRange(`L7:L${detailEnd}`).conditionalFormats.add("containsText", { text: "有临时素材", format: { fill: colors.amberLight, font: { color: "#7B541D" } } });
detail.getRange(`M7:M${detailEnd}`).conditionalFormats.add("containsText", { text: "是", format: { fill: colors.redLight, font: { bold: true, color: colors.red } } });
detail.getRange(`M7:M${detailEnd}`).conditionalFormats.add("containsText", { text: "部分", format: { fill: colors.amberLight, font: { color: "#7B541D" } } });

// 已有与参考
existing.getRange("A1:I1").merge();
existing.getRange("A1").values = [["现有素材、灰盒与文档中提及但未落地的免费素材"]];
existing.getRange("A2:I2").merge();
existing.getRange("A2").values = [["注意：“文档中写过可用”不等于本地已收集或许可已核验。当前仅Ark Pixel字体可直接作为正式资产继续使用。"]];
existing.getRange("A4:I4").values = [["类型", "名称", "数量", "当前用途", "可用于Demo", "可作为MVP正式", "本地路径/证据", "许可/风险", "后续动作"]];
existing.getRange(`A5:I${4 + currentAssets.length}`).values = currentAssets;
existing.tables.add(`A4:I${4 + currentAssets.length}`, true, "CurrentAssetsTable").style = "TableStyleMedium4";
existing.freezePanes.freezeRows(4);
existing.getRange(`F5:F${4 + currentAssets.length}`).conditionalFormats.add("containsText", { text: "否", format: { fill: colors.redLight, font: { color: colors.red } } });
existing.getRange(`E5:E${4 + currentAssets.length}`).conditionalFormats.add("containsText", { text: "是", format: { fill: colors.greenLight, font: { color: colors.green } } });

// 规格与验收
standard.getRange("A1:D1").merge();
standard.getRange("A1").values = [["美术制作规格与验收速查"]];
standard.getRange("A2:D2").merge();
standard.getRange("A2").values = [["以下为当前文档中的硬性口径，外包、免费素材改造和原创制作均应遵守。"]];
standard.getRange("A4:D4").values = [["类别", "项目", "当前标准", "说明/验收"]];
standard.getRange(`A5:D${4 + specs.length}`).values = specs;
standard.tables.add(`A4:D${4 + specs.length}`, true, "ArtSpecsTable").style = "TableStyleMedium2";
standard.freezePanes.freezeRows(4);
const checklistStart = 7 + specs.length;
standard.getRange(`A${checklistStart}:D${checklistStart}`).merge();
standard.getRange(`A${checklistStart}`).values = [["交付包必须包含"]];
standard.getRange(`A${checklistStart + 1}:D${checklistStart + 7}`).values = [
  ["1", "源文件", "Aseprite/PSD或其他可编辑源文件", "图层命名清楚，第三方与原创分离"],
  ["2", "运行时文件", "PNG、Sprite Sheet、图集或材质", "Point过滤、无抗锯齿、尺寸与锚点明确"],
  ["3", "动画说明", "FPS、循环、事件帧", "cast_commit、hit_frame、recover_start、animation_end"],
  ["4", "预览", "GIF或短视频", "能快速评审动作、循环和VFX节奏"],
  ["5", "用途", "页面、场景、角色或技能ID", "避免同名素材误用"],
  ["6", "权利信息", "作者、来源、许可、署名", "免费素材必须保留原始下载地址和许可快照"],
  ["7", "验收记录", "缩放、Web端、低画质、IP复核", "桌面Chrome/Firefox、Android Chrome、iOS Safari抽查"],
];

// 汇总
summary.getRange("A1:H1").merge();
summary.getRange("A1").values = [["《昆吾禁地》美术素材缺口总览"]];
summary.getRange("A2:H2").merge();
summary.getRange("A2").values = [["基于项目资产目录、开发进度与PRD交叉盘点｜2026-07-31"]];
summary.getRange("A4:B4").merge();
summary.getRange("C4:D4").merge();
summary.getRange("E4:F4").merge();
summary.getRange("G4:H4").merge();
summary.getRange("A4").formulas = [[`=COUNTA('缺口明细'!A7:A${detailEnd})`]];
summary.getRange("C4").formulas = [[`=COUNTIF('缺口明细'!C7:C${detailEnd},"P0-立即")`]];
summary.getRange("E4").formulas = [[`=SUM('缺口明细'!K7:K${detailEnd})`]];
summary.getRange("G4").formulas = [[`=IFERROR(SUM('缺口明细'!I7:I${detailEnd})/SUM('缺口明细'!G7:G${detailEnd}),0)`]];
summary.getRange("A5:B5").merge();
summary.getRange("C5:D5").merge();
summary.getRange("E5:F5").merge();
summary.getRange("G5:H5").merge();
summary.getRange("A5").values = [["缺口素材包"]];
summary.getRange("C5").values = [["P0立即处理"]];
summary.getRange("E5").values = [["正式缺口制作单元"]];
summary.getRange("G5").values = [["正式覆盖率"]];
summary.getRange("G4").format.numberFormat = "0.0%";

const categories = ["场景", "建筑", "角色", "动画", "敌人", "Boss", "地图", "UI", "图标", "特效", "品牌", "字体", "剧情"];
summary.getRange("A8:C8").values = [["大类", "缺口素材包", "正式缺口制作单元"]];
summary.getRange(`A9:A${8 + categories.length}`).values = categories.map((v) => [v]);
summary.getRange("B9").formulas = [[`=COUNTIF('缺口明细'!D$7:D$${detailEnd},A9)`]];
summary.getRange(`B9:B${8 + categories.length}`).fillDown();
summary.getRange("C9").formulas = [[`=SUMIF('缺口明细'!D$7:D$${detailEnd},A9,'缺口明细'!K$7:K$${detailEnd})`]];
summary.getRange(`C9:C${8 + categories.length}`).fillDown();
summary.tables.add(`A8:C${8 + categories.length}`, true, "CategorySummaryTable").style = "TableStyleMedium2";

const phases = ["P1核心闭环", "P2公开Demo", "P3A地图2", "P3B五图MVP", "P3C五图MVP"];
summary.getRange("E8:G8").values = [["目标阶段", "缺口素材包", "正式缺口制作单元"]];
summary.getRange(`E9:E${8 + phases.length}`).values = phases.map((v) => [v]);
summary.getRange("F9").formulas = [[`=COUNTIF('缺口明细'!B$7:B$${detailEnd},E9)`]];
summary.getRange(`F9:F${8 + phases.length}`).fillDown();
summary.getRange("G9").formulas = [[`=SUMIF('缺口明细'!B$7:B$${detailEnd},E9,'缺口明细'!K$7:K$${detailEnd})`]];
summary.getRange(`G9:G${8 + phases.length}`).fillDown();
summary.tables.add(`E8:G${8 + phases.length}`, true, "PhaseSummaryTable").style = "TableStyleMedium4";

summary.getRange("E16:H16").merge();
summary.getRange("E16").values = [["当前结论"]];
summary.getRange("E17:H22").merge();
summary.getRange("E17").values = [[
  "1. 当前正式视觉资产几乎为空，只有Ark Pixel字体可直接沿用。\n" +
  "2. Camp大厅功能已验收，但画面仍是灰盒；建筑、前中后景、图标和NPC形象均待补。\n" +
  "3. 下一开发闭环最先需要：原创UI基础组件、资源/属性图标、四名新手头像、地图1 Tile/POI、敌人和战斗VFX。\n" +
  "4. 文档提及的多个免费素材包本地并不存在，不能当作已收集或已授权。\n" +
  "5. “正式缺口制作单元”混合了套/张/个/角色等单位，只用于工作量粗排，不能直接作为报价总量。"
]];
summary.getRange("A25:H25").merge();
summary.getRange("A25").values = [["推荐执行顺序：P0立即（核心页面与地图1）→ P1高（大厅正式化与公开Demo润色）→ P2/P3（地图2–5、完整一转与装备扩充）。"]];
summary.freezePanes.freezeRows(2);

// 通用格式
const titleFormat = {
  fill: colors.ink,
  font: { bold: true, color: colors.white, size: 18, name: "Microsoft YaHei" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
const subtitleFormat = {
  fill: colors.dark,
  font: { color: "#DDE8E5", size: 10, name: "Microsoft YaHei" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
for (const [sheet, titleRange, subtitleRange] of [
  [summary, "A1:H1", "A2:H2"],
  [detail, "A1:R1", "A2:R2"],
  [existing, "A1:I1", "A2:I2"],
  [standard, "A1:D1", "A2:D2"],
]) {
  sheet.getRange(titleRange).format = titleFormat;
  sheet.getRange(subtitleRange).format = subtitleFormat;
  sheet.getRange(titleRange).format.rowHeight = 34;
  sheet.getRange(subtitleRange).format.rowHeight = 25;
}

detail.getRange("A4:R4").format = {
  fill: colors.jadeLight,
  font: { color: colors.dark, italic: true, name: "Microsoft YaHei" },
  wrapText: true,
};
detail.getRange("A6:R6").format = {
  fill: colors.jade,
  font: { bold: true, color: colors.white, name: "Microsoft YaHei" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
};
detail.getRange(`A7:R${detailEnd}`).format.font = { size: 9, name: "Microsoft YaHei" };
detail.getRange(`A7:R${detailEnd}`).format.verticalAlignment = "top";
detail.getRange(`E7:F${detailEnd}`).format.wrapText = true;
detail.getRange(`N7:R${detailEnd}`).format.wrapText = true;
detail.getRange(`G7:M${detailEnd}`).format.horizontalAlignment = "center";
detail.getRange(`G7:K${detailEnd}`).format.numberFormat = "0";
detail.getRange(`A6:R${detailEnd}`).format.borders = {
  insideHorizontal: { style: "thin", color: "#D6DFDC" },
  bottom: { style: "thin", color: "#A9B8B4" },
};
detail.getRange(`A7:R${detailEnd}`).format.rowHeight = 43;
const detailWidths = {
  A: 15, B: 13, C: 11, D: 10, E: 17, F: 34, G: 9, H: 7, I: 9, J: 10, K: 9, L: 18, M: 12, N: 38, O: 34, P: 36, Q: 28, R: 24,
};
for (const [col, width] of Object.entries(detailWidths)) detail.getRange(`${col}1:${col}${detailEnd}`).format.columnWidth = width;

for (const sheet of [existing, standard]) {
  const used = sheet.getUsedRange();
  used.format.font = { size: 10, name: "Microsoft YaHei" };
  used.format.verticalAlignment = "top";
  used.format.wrapText = true;
}
existing.getRange("A4:I4").format = { fill: colors.jade, font: { bold: true, color: colors.white }, horizontalAlignment: "center", verticalAlignment: "center", wrapText: true };
existing.getRange(`A5:I${4 + currentAssets.length}`).format.rowHeight = 40;
const existingWidths = { A: 18, B: 28, C: 9, D: 24, E: 15, F: 17, G: 40, H: 36, I: 38 };
for (const [col, width] of Object.entries(existingWidths)) existing.getRange(`${col}1:${col}${4 + currentAssets.length}`).format.columnWidth = width;
standard.getRange("A4:D4").format = { fill: colors.jade, font: { bold: true, color: colors.white }, horizontalAlignment: "center", verticalAlignment: "center" };
standard.getRange(`A${checklistStart}:D${checklistStart}`).format = { fill: colors.bronze, font: { bold: true, color: colors.white }, horizontalAlignment: "center" };
standard.getRange(`A5:D${checklistStart + 7}`).format.rowHeight = 35;
for (const [col, width] of Object.entries({ A: 18, B: 25, C: 36, D: 62 })) standard.getRange(`${col}1:${col}${checklistStart + 7}`).format.columnWidth = width;

summary.getRange("A4:H4").format = {
  fill: colors.jadeLight,
  font: { bold: true, size: 20, color: colors.ink, name: "Microsoft YaHei" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
summary.getRange("A5:H5").format = {
  fill: colors.dark,
  font: { bold: true, color: colors.white, name: "Microsoft YaHei" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
summary.getRange("A4:H4").format.rowHeight = 42;
summary.getRange("A5:H5").format.rowHeight = 25;
summary.getRange("A8:C8").format = { fill: colors.jade, font: { bold: true, color: colors.white }, horizontalAlignment: "center" };
summary.getRange("E8:G8").format = { fill: colors.bronze, font: { bold: true, color: colors.white }, horizontalAlignment: "center" };
summary.getRange("E16:H16").format = { fill: colors.bronze, font: { bold: true, color: colors.white }, horizontalAlignment: "center" };
summary.getRange("E17:H22").format = { fill: colors.parchment, font: { color: colors.ink, size: 10 }, wrapText: true, verticalAlignment: "top", borders: { preset: "outside", style: "thin", color: colors.bronze } };
summary.getRange("A25:H25").format = { fill: colors.jadeLight, font: { bold: true, color: colors.dark }, wrapText: true, horizontalAlignment: "center" };
summary.getRange("A25:H25").format.rowHeight = 38;
for (const [col, width] of Object.entries({ A: 20, B: 16, C: 18, D: 3, E: 20, F: 16, G: 18, H: 18 })) summary.getRange(`${col}1:${col}25`).format.columnWidth = width;
summary.getRange("E17:H22").format.rowHeight = 25;

// 关键单元格备注
workbook.comments.addThread({ cell: summary.getRange("E4") }, "“正式缺口制作单元”把套、张、个、角色等不同单位相加，仅用于粗排制作规模，不能直接作为外包报价总数。");
workbook.comments.addThread({ cell: existing.getRange("B9") }, "文档中列出的免费素材包多数并未出现在本地工程。只有实际下载、保留许可快照并登记来源后，才能视为已收集。");

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const summaryInspect = await workbook.inspect({
  kind: "table",
  range: "汇总!A1:H25",
  include: "values,formulas",
  tableMaxRows: 25,
  tableMaxCols: 8,
});
console.log("SUMMARY_INSPECT");
console.log(summaryInspect.ndjson);

const detailInspect = await workbook.inspect({
  kind: "table",
  range: `缺口明细!A1:M18`,
  include: "values,formulas",
  tableMaxRows: 18,
  tableMaxCols: 13,
});
console.log("DETAIL_INSPECT");
console.log(detailInspect.ndjson);

const detailTailInspect = await workbook.inspect({
  kind: "table",
  range: `缺口明细!A${detailEnd - 3}:M${detailEnd}`,
  include: "values,formulas",
  tableMaxRows: 4,
  tableMaxCols: 13,
});
console.log("DETAIL_TAIL_INSPECT");
console.log(detailTailInspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log("FORMULA_ERRORS");
console.log(errors.ndjson);

const previews = [
  ["汇总", "A1:H25", "summary.png", 1.4],
  ["缺口明细", "A1:R28", "detail.png", 0.8],
  ["已有与参考", `A1:I${4 + currentAssets.length}`, "existing.png", 0.9],
  ["规格与验收", `A1:D${checklistStart + 7}`, "standards.png", 1.0],
];
for (const [sheetName, range, fileName, scale] of previews) {
  const preview = await workbook.render({ sheetName, range, scale, format: "png" });
  await fs.writeFile(path.join(previewDir, fileName), new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
const savedBlob = await FileBlob.load(outputPath);
const reloaded = await SpreadsheetFile.importXlsx(savedBlob);
const reloadedCheck = await reloaded.inspect({
  kind: "table",
  range: "汇总!A4:H13",
  include: "values,formulas",
  tableMaxRows: 10,
  tableMaxCols: 8,
});
console.log("RELOADED_CHECK");
console.log(reloadedCheck.ndjson);
const reloadedErrors = await reloaded.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!",
  options: { useRegex: true, maxResults: 300 },
  summary: "reloaded workbook formula error scan",
});
console.log("RELOADED_FORMULA_ERRORS");
console.log(reloadedErrors.ndjson);
console.log(`OUTPUT=${outputPath}`);
console.log(`ROWS=${gaps.length}`);
