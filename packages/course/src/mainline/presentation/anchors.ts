import type { SubjectId } from '../domain.js'

/**
 * 色相锚 · 中国传统色策展库(生成式风格包家族的色相事实源)
 *
 * 背景:风格包此前只有 6 个手写 signature,`stylePackFor` 按学科×学段粗选——
 * 25666 个 KP 分摊下来,同学科同学段的课程永远撞同一张皮。这里不再手写调色板,
 * 而是策展一批色相锚(中国传统色),交给 pack-families.ts 的 OKLCH 引擎按
 * (锚 × 明度三态 × 质感签名)确定性派生出成千上万套实例。
 *
 * 色值核实自 zerosoul/chinese-colors(MIT,2.6k★,src/assets/colors.json),
 * 40 余个精选锚 > 500 个平庸色——这是策展不是全库搬运:
 * - 排除彩度过低的真灰/近黑白(锚的色相角在低彩度下数值不稳定,派生引擎也无从借力);
 * - 排除彩度过高的荧光色(如纯 #ff0000 一类,过艳刺眼,不是"传统色"气质);
 * - 保留少量刻意清淡的锚(月白/藕荷色)——它们的价值正是给"高中:低彩度锚"池供货,
 *   派生引擎只借它们的色相角,明度/彩度由 mood 规则重新分档,不会真的惨白。
 *
 * 派生引擎只读 `hex` 取色相角(h),`temperature` 与 `subjects` 只用于选锚过滤,
 * 不参与调色板数学——因此这里的 hex 无需在"重派生"意义上精确,只需色相稳定可辨。
 */
export interface ColorAnchor {
  id: string
  /** 中文传统色名 */
  name: string
  hex: string
  /** 典故/由来,一句话 */
  intro: string
  /** 冷暖归类:决定小学段(暖高明度)与质感签名池的准入 */
  temperature: 'warm' | 'cool' | 'neutral'
  /** 学科亲和;空数组 = 通用,不限学科 */
  subjects: readonly SubjectId[]
}

export const CHINESE_COLOR_ANCHORS: readonly ColorAnchor[] = [
  { id: 'yanzhi', name: '胭脂', hex: '#9d2933', intro: '女子妆容与国画重彩暗红颜料,沉郁而有分量', temperature: 'warm', subjects: ['chinese', 'history'] },
  { id: 'feise', name: '妃色', hex: '#ed5736', intro: '妃红雅称,湘妃色、杨妃色皆同源,温润不艳', temperature: 'warm', subjects: [] },
  { id: 'zhuhong', name: '朱红', hex: '#ff4c00', intro: '朱砂颜料研出的鲜艳红,篆刻朱泥与传统建筑常用', temperature: 'warm', subjects: ['chinese', 'history'] },
  { id: 'jiangzi', name: '绛紫', hex: '#8c4356', intro: '紫中带红,深沉内敛', temperature: 'warm', subjects: [] },
  { id: 'zaohong', name: '枣红', hex: '#c32136', intro: '似干枣的深红,厚重不轻浮', temperature: 'warm', subjects: [] },
  { id: 'juhuang', name: '橘黄', hex: '#ff8936', intro: '橙中偏黄,明快活泼', temperature: 'warm', subjects: ['general'] },
  { id: 'zhe', name: '赭', hex: '#9c5333', intro: '赭石颜料色,大地般沉稳', temperature: 'warm', subjects: ['history', 'geography'] },
  { id: 'tuose', name: '驼色', hex: '#a88462', intro: '驼毛本色,温厚低调', temperature: 'warm', subjects: [] },
  { id: 'xinghuang', name: '杏黄', hex: '#ffa631', intro: '杏子成熟时的暖黄,甜而不腻', temperature: 'warm', subjects: [] },
  { id: 'xiangse', name: '缃色', hex: '#f0c239', intro: '浅黄绢帛之色,书卷气十足', temperature: 'warm', subjects: ['chinese'] },
  { id: 'qiuxiang', name: '秋香色', hex: '#d9b611', intro: '秋日草木转黄之色,雅致不俗', temperature: 'warm', subjects: ['geography', 'biology'] },
  { id: 'ehuang', name: '鹅黄', hex: '#fff143', intro: '雏鹅绒毛般嫩黄,明亮清新', temperature: 'neutral', subjects: [] },
  { id: 'canghuang', name: '苍黄', hex: '#a29b7c', intro: '介于苍与黄之间的沉静色调', temperature: 'warm', subjects: [] },
  { id: 'douqing', name: '豆青', hex: '#96ce54', intro: '新豆嫩绿,清爽近自然', temperature: 'neutral', subjects: ['biology', 'science'] },
  { id: 'zhuqing', name: '竹青', hex: '#789262', intro: '竹叶老熟后的青绿,沉静耐看', temperature: 'neutral', subjects: ['chinese', 'biology'] },
  { id: 'songhualv', name: '松花绿', hex: '#057748', intro: '松花授粉时的墨绿,深沉如林', temperature: 'cool', subjects: ['biology', 'science'] },
  { id: 'ailv', name: '艾绿', hex: '#a4e2c6', intro: '艾草嫩叶的浅绿,清淡雅致', temperature: 'cool', subjects: ['biology'] },
  { id: 'feicui', name: '翡翠色', hex: '#3de1ad', intro: '翡翠宝石般的青绿,通透明艳', temperature: 'cool', subjects: ['chemistry', 'biology'] },
  { id: 'shiqing', name: '石青', hex: '#7bcfa6', intro: '矿物颜料石青,国画重彩常用底色', temperature: 'cool', subjects: ['chinese', 'history'] },
  { id: 'qingbi', name: '青碧', hex: '#48c0a3', intro: '青中带碧,湖光山色的常见色', temperature: 'cool', subjects: ['geography'] },
  { id: 'tonglv', name: '铜绿', hex: '#549688', intro: '铜器氧化生出的绿锈,古朴沧桑', temperature: 'cool', subjects: ['history', 'chemistry'] },
  { id: 'shuise', name: '水色', hex: '#88ada6', intro: '浅淡水光色,含蓄内敛', temperature: 'cool', subjects: [] },
  { id: 'weilan', name: '蔚蓝', hex: '#70f3ff', intro: '晴空般澄澈的蓝,明亮开阔', temperature: 'cool', subjects: ['physics', 'geography'] },
  { id: 'yuebai', name: '月白', hex: '#d6ecf0', intro: '月光下的浅蓝白,清冷素净', temperature: 'cool', subjects: [] },
  { id: 'cangqing', name: '苍青', hex: '#7397ab', intro: '苍茫青灰的蓝,克制沉稳', temperature: 'cool', subjects: [] },
  { id: 'qunqing', name: '群青', hex: '#4c8dae', intro: '群青颜料色,西画东传常见蓝', temperature: 'cool', subjects: ['physics', 'math'] },
  { id: 'dianqing', name: '靛青', hex: '#177cb0', intro: '蓝草提炼的靛青,是靛蓝的近亲', temperature: 'cool', subjects: ['physics', 'chemistry'] },
  { id: 'dianlan', name: '靛蓝', hex: '#065279', intro: '蓝草沉淀提炼,染坊传统主色', temperature: 'cool', subjects: ['physics', 'math', 'chemistry'] },
  { id: 'zangqing', name: '藏青', hex: '#2e4e7e', intro: '近黑的深蓝,肃穆端方', temperature: 'cool', subjects: ['history', 'math'] },
  { id: 'daila', name: '黛蓝', hex: '#425066', intro: '黛色调入蓝,文人书斋的沉静', temperature: 'cool', subjects: ['chinese'] },
  { id: 'baolan', name: '宝蓝', hex: '#4b5cc4', intro: '宝石般浓艳的蓝紫,华贵夺目', temperature: 'cool', subjects: ['general'] },
  { id: 'zanglan', name: '藏蓝', hex: '#3b2e7e', intro: '藏蓝近黑,比藏青更深邃', temperature: 'cool', subjects: ['history'] },
  { id: 'dai', name: '黛', hex: '#4a4266', intro: '古时女子画眉的青黑颜料,借指深沉蓝紫', temperature: 'cool', subjects: [] },
  { id: 'daizi', name: '黛紫', hex: '#574266', intro: '黛色偏紫,低调神秘', temperature: 'neutral', subjects: [] },
  { id: 'qinglian', name: '青莲', hex: '#801dae', intro: '青紫如莲花,浓艳庄重', temperature: 'neutral', subjects: ['general'] },
  { id: 'dingxiang', name: '丁香色', hex: '#cca4e3', intro: '丁香花般浅紫,柔和不张扬', temperature: 'neutral', subjects: ['english'] },
  { id: 'ouhe', name: '藕荷色', hex: '#e4c6d0', intro: '莲藕断面般浅粉紫,含蓄雅致', temperature: 'warm', subjects: ['chinese'] },
  { id: 'zitang', name: '紫棠', hex: '#56004f', intro: '紫中带棠梨般暗红,浓重深沉', temperature: 'warm', subjects: [] },
  { id: 'jiangzi2', name: '酱紫', hex: '#815476', intro: '酱色调入紫,内敛厚重', temperature: 'warm', subjects: [] },
  { id: 'chase', name: '茶色', hex: '#b35c44', intro: '茶汤般的赭红,温润家常', temperature: 'warm', subjects: [] },
  { id: 'kuhuang', name: '枯黄', hex: '#d3b17d', intro: '草木枯萎后的浅黄褐,秋日气息', temperature: 'warm', subjects: ['geography', 'biology'] },
  { id: 'cangcui', name: '苍翠', hex: '#519a73', intro: '苍劲的翠绿,山林常青之色', temperature: 'cool', subjects: ['biology', 'geography'] },
] as const

/**
 * 明亮现代色锚 · 明亮令默认锚池(2026-07-22,docs/design-refresh/2026-07-22-brightness-mandate.md)
 *
 * 传统色锚被用户判定为「上个世纪」的暗沉雅致——归档保留(库只增不减),退出默认池。
 * 这一代策展的坐标是**明亮的当代色**:高明度、敢碰撞、来自当代产品/平面设计的活跃
 * 色域,而非古籍色谱。策展规则(与传统锚同一套结构,只换气质):
 * - 排除彩度过低的真灰(<0.03,色相角不稳)与刺眼荧光(>0.25);
 * - **粉紫禁令(2026-07-22 用户裁定:粉紫色不适合 K12 课程)**:紫/洋红/粉锚
 *   (罗兰紫/荧紫/葡萄紫/牵牛紫红/洋红/玫瑰粉/蜜桃粉/丁香雾/藕粉雾 9 个)整体
 *   退出策展,色相环从此只覆盖 红→橙→黄→绿→青→蓝→靛 的课堂色带;深红端
 *   (石榴红/莓果红)保留——它们读作"红",不读作"粉";
 * - 尽量铺满课堂色带(≥8/12 色区),供 accent 色相轴撑开距离;
 * - 保留一组低彩度「高级灰调」锚(≤0.09)供高中池——高学段克制但不复古;
 * - 小学暖池:warm 锚跨红/橙/黄多个色区,明快不腻。
 */
export const MODERN_COLOR_ANCHORS: readonly ColorAnchor[] = [
  // ── 红/珊瑚(暖) ──
  { id: 'shiliu', name: '石榴红', hex: '#e63946', intro: '当代 UI 常青红,鲜而不刺', temperature: 'warm', subjects: ['chinese', 'history'] },
  { id: 'xiyou', name: '西柚红', hex: '#ff5a5f', intro: '西柚果肉的亮红,活力款待感', temperature: 'warm', subjects: ['general'] },
  { id: 'zhusha', name: '朱砂橘红', hex: '#ff4d6d', intro: '偏粉的橘红,霓虹时代的朱砂', temperature: 'warm', subjects: [] },
  { id: 'shanhu', name: '珊瑚橙', hex: '#ff6f61', intro: '珊瑚礁的暖橙红,数字产品的友好色', temperature: 'warm', subjects: ['english'] },
  { id: 'chitao', name: '赤陶橘', hex: '#e07a5f', intro: '地中海赤陶的哑光橘,温厚现代', temperature: 'warm', subjects: ['history', 'geography'] },
  // ── 橙/黄(暖) ──
  { id: 'luoxia', name: '落霞橙', hex: '#ff8a3d', intro: '城市黄昏的通透橙,明快提神', temperature: 'warm', subjects: [] },
  { id: 'nangua', name: '南瓜橙', hex: '#f77f00', intro: '饱满南瓜橙,插画系主力暖色', temperature: 'warm', subjects: ['science'] },
  { id: 'xingcheng', name: '杏橙', hex: '#ffb26b', intro: '杏子果霜的浅橙,柔亮不甜腻', temperature: 'warm', subjects: [] },
  { id: 'mitang', name: '蜜糖金', hex: '#ffb100', intro: '流动蜂蜜的亮金,富足感', temperature: 'warm', subjects: ['math'] },
  { id: 'jinzhan', name: '金盏黄', hex: '#fcbf49', intro: '金盏花的暖黄,阳光的物化', temperature: 'warm', subjects: [] },
  { id: 'ningmeng', name: '柠檬黄', hex: '#ffd60a', intro: '高纯柠檬黄,警示与欢腾的双面色', temperature: 'warm', subjects: ['physics'] },
  { id: 'naiyou', name: '奶油黄', hex: '#ffe08a', intro: '奶油打发的浅黄,高明度软色', temperature: 'warm', subjects: [] },
  { id: 'mangguo', name: '芒果黄', hex: '#ffc300', intro: '熟芒果的浓黄,热带气息', temperature: 'warm', subjects: [] },
  // ── 绿(中性/冷) ──
  { id: 'qingning', name: '青柠绿', hex: '#9ef01a', intro: '青柠皮的高亮黄绿,电子时代的酸爽', temperature: 'neutral', subjects: ['biology'] },
  { id: 'pingguo', name: '苹果绿', hex: '#70e000', intro: '青苹果的鲜绿,生长感强烈', temperature: 'neutral', subjects: ['science', 'biology'] },
  { id: 'lvzhou', name: '绿洲绿', hex: '#38b000', intro: '绿洲植被的正绿,健康明确', temperature: 'cool', subjects: ['biology'] },
  { id: 'bohe', name: '薄荷绿', hex: '#52b788', intro: '薄荷叶的清凉绿,呼吸感', temperature: 'cool', subjects: ['biology', 'chemistry'] },
  { id: 'feicui', name: '翡翠绿', hex: '#10b981', intro: '当代 UI 的成功绿,通透坚定', temperature: 'cool', subjects: ['chemistry', 'biology'] },
  { id: 'songshi', name: '松石绿', hex: '#06d6a0', intro: '绿松石的亮青绿,清爽跳脱', temperature: 'cool', subjects: ['geography'] },
  { id: 'jiguang', name: '极光绿', hex: '#2ec4b6', intro: '极光带的青绿,冷冽发光感', temperature: 'cool', subjects: ['science'] },
  // ── 青/蓝(冷) ──
  { id: 'hushui', name: '湖水青', hex: '#00b4d8', intro: '高原湖面的亮青,澄澈开阔', temperature: 'cool', subjects: ['geography'] },
  { id: 'dianguang', name: '电光青', hex: '#22d3ee', intro: '屏幕发光体的青,科技感直给', temperature: 'cool', subjects: ['physics', 'chemistry'] },
  { id: 'tianqing', name: '天青蓝', hex: '#38bdf8', intro: '晴日正空的亮蓝,轻盈无压', temperature: 'cool', subjects: ['physics', 'geography'] },
  { id: 'qingkong', name: '晴空蓝', hex: '#0ea5e9', intro: '标准晴空蓝,当代界面第一蓝', temperature: 'cool', subjects: ['physics', 'math'] },
  { id: 'haiyang', name: '海洋蓝', hex: '#0077b6', intro: '深海面层的正蓝,可靠沉稳', temperature: 'cool', subjects: ['math', 'physics'] },
  { id: 'kelan', name: '钴蓝', hex: '#2563eb', intro: '钴颜料的浓蓝,数字品牌主力色', temperature: 'cool', subjects: ['math'] },
  { id: 'qunqinglan', name: '群青蓝', hex: '#4f46e5', intro: '偏紫的群青,深邃而通电', temperature: 'cool', subjects: ['math', 'chemistry'] },
  // ── 深红(粉紫禁令后保留的红端:读作"红",不读作"粉") ──
  { id: 'meiguohong', name: '莓果红', hex: '#c9184a', intro: '莓果汁液的深亮红,浓烈利落', temperature: 'warm', subjects: ['chinese', 'history'] },
  // ── 高级灰调(低彩度 ≤0.09,高中池主力——克制但不复古) ──
  { id: 'wuyu', name: '雾屿蓝', hex: '#8ecae6', intro: '晨雾中的岛屿浅蓝,清冷安静', temperature: 'cool', subjects: [] },
  { id: 'changshi', name: '长石蓝', hex: '#7d9bb8', intro: '长石矿面的灰蓝,理性低语', temperature: 'cool', subjects: [] },
  { id: 'shiban', name: '石板灰蓝', hex: '#64748b', intro: '石板路面的冷灰蓝,当代界面中性色', temperature: 'cool', subjects: [] },
  { id: 'qingci2', name: '青瓷灰', hex: '#83c5be', intro: '青瓷釉面的灰青,素而有光', temperature: 'cool', subjects: [] },
  { id: 'taiyuan', name: '苔原绿', hex: '#6b9080', intro: '苔原植被的灰绿,冷静自然', temperature: 'cool', subjects: ['biology', 'geography'] },
  { id: 'gandoulv', name: '灰豆绿', hex: '#a3b18a', intro: '豆荚晒后的灰绿,舒缓耐看', temperature: 'neutral', subjects: [] },
  { id: 'yanmai', name: '燕麦米', hex: '#d8c3a5', intro: '燕麦麸皮的浅米,温和地色系', temperature: 'warm', subjects: [] },
  { id: 'shayan', name: '砂岩', hex: '#c8a887', intro: '砂岩剖面的暖灰,地质感', temperature: 'warm', subjects: ['history', 'geography'] },
  { id: 'qinghuiyan', name: '青灰岩', hex: '#94a3b8', intro: '青灰岩壁的中性冷灰,退位衬色', temperature: 'cool', subjects: [] },
  { id: 'ganlanhui', name: '橄榄灰', hex: '#b0a990', intro: '橄榄核的暖灰,不张扬的暖底', temperature: 'neutral', subjects: [] },
  { id: 'haiwu', name: '海雾青', hex: '#a8dadc', intro: '海面晨雾的浅青,通风感', temperature: 'cool', subjects: [] },
] as const

/**
 * 默认锚池(生成档/认证注册表消费)——明亮令(2026-07-22)后指向现代锚。
 * 传统锚 CHINESE_COLOR_ANCHORS 仅归档,不再被默认路径引用。
 */
export const ACTIVE_COLOR_ANCHORS: readonly ColorAnchor[] = MODERN_COLOR_ANCHORS
