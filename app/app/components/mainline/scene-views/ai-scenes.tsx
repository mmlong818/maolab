'use client'

import { Fragment } from 'react'
import { aiVerifyPairs, spriteSideOf, type LessonScene, type MainlineCourse, type ScenePresentation } from '@/lib/mainline'
import { hexToOklch, mixOklch, toRgba } from '@/lib/mainline/presentation/color'
import { fitType, TYPE_SCALE } from '@/lib/mainline/presentation/tokens'
import { SCENE_TYPE_LABEL } from '../workbench/labels'
import { pickAiInquiryMaster, pickAiVerifyMaster } from './ai-master-select'
import { cardSurface, MathText, SceneBadge, spritePad } from './shared'

/**
 * ai-scenes · ai-verify(AI 找茬)/ ai-inquiry(AI 提问链)专属母版
 * (拆分自 legacy-techniques.tsx,2026-07-21 母版扩容:4+3)
 *
 * 这是全库最高频幕型(46 页课里 19 页同款左右对照),扩容前只有 1 个骨架。
 * 铁律不变(拆分前就有,扩容后每个新母版都要守):错误断言禁止权威版式——
 * 任何母版里 aiClaim 的视觉语气必须弱于/异于 reveal(虚线/倾斜/警示徽章
 * 至少占其二);立绘避让沿用 spriteSideOf/spritePad 惯例;颜色/表面/字体
 * 全走 pack 三轴 token,不新造硬编码色板。
 *
 * 母版选择委托给 ai-master-select.ts 的 pickAiVerifyMaster/pickAiInquiryMaster
 * (纯函数,可单测)——本文件只负责按选择结果渲染。
 */

function slot(scene: LessonScene, key: string, fallback: string): string {
  return scene.contentSlots[key] ?? fallback
}

/** 课程槽位可保留生成时的说话人前缀；画面只呈现待判断的命题本身。 */
function plainAiClaim(value: string): string {
  const withoutSpeaker = value.trim()
    .replace(/^(?:AI\s*)?(?:助教\s*)?[「『“"][^」』”"]+[」』”"]\s*(?:说|表示|认为)?\s*[：:]?\s*/, '')
    .replace(/^AI\s*(?:说|表示|认为)?\s*[：:]?\s*/, '')
  return withoutSpeaker.replace(/^[“"]/u, '').replace(/[”"]$/u, '').trim() || value.trim()
}

/* ── ai-verify:AI 找茬 ────────────────────────────────────────── */

export function AiVerifyView({
  scene,
  course,
  pres,
  sceneNumber,
  feedbackRevealed = true,
}: {
  scene: LessonScene
  course: MainlineCourse
  pres: ScenePresentation
  sceneNumber: number
  /** false 时保留提问母版，仅把结论槽置为等待状态；揭晓后在同槽位补入结论。 */
  feedbackRevealed?: boolean
}) {
  // 放映层已经把多条说法拆成逐条投影片。单条判断必须使用同一渐进母版，
  // 不能再让哈希随机母版导致提问页和核查页像两套不相干的课程。
  if (aiVerifyPairs(scene).length === 1) {
    return <AiVerifySequenceMaster scene={scene} pres={pres} sceneNumber={sceneNumber} feedbackRevealed={feedbackRevealed} />
  }
  const master = pickAiVerifyMaster(course, scene)
  if (master === 'interrogation') return <AiVerifyInterrogationMaster scene={scene} pres={pres} sceneNumber={sceneNumber} feedbackRevealed={feedbackRevealed} />
  if (master === 'checklist') return <AiVerifyChecklistMaster scene={scene} pres={pres} sceneNumber={sceneNumber} feedbackRevealed={feedbackRevealed} />
  if (master === 'sticky-note') return <AiVerifyStickyNoteMaster scene={scene} pres={pres} sceneNumber={sceneNumber} feedbackRevealed={feedbackRevealed} />
  return <AiVerifyComparisonMaster scene={scene} pres={pres} feedbackRevealed={feedbackRevealed} />
}

/**
 * ai-verify 的待核查说法按构造恒为错误说法(生成契约:aiClaim 逐条锚定教材误区
 * 原文,「每条误区都要出现、不得替换或编造」;skeleton 只把误区送进本幕型)——
 * 核查结论因此确定为「不成立」。此前用 reveal 开头词正则猜测,遇到
 * 「对照本课定义,这个说法是错误的…」会因 ^对 误判「成立」把错误答案高亮上屏,
 * 措辞不合拍时还会双雄皆不亮(2026-08-26 code-review CONFIRMED)。
 */
function verifyVerdict(_reveal: string): '成立' | '不成立' {
  return '不成立'
}

function verifyReason(reveal: string): string {
  return reveal.trim().replace(/^(?:错误|不成立|不正确|不平衡|正确|成立|平衡|错|对)[。！：:\s]*/u, '') || reveal.trim()
}

function verifyRailClass(scene: LessonScene): string {
  const sprite = spriteSideOf(scene)
  if (sprite === 'left') return 'ml-[23%]'
  if (sprite === 'right') return 'mr-[23%]'
  return ''
}

/**
 * 单条说法的固定渐进母版。提问页和核查页保持同一条说法、同一位置、同一字号，
 * 核查页仅选中判断并在下方补充依据，避免左右半屏和随机母版造成的视觉跳变。
 */
function AiVerifySequenceMaster({
  scene,
  pres,
  sceneNumber,
  feedbackRevealed,
}: {
  scene: LessonScene
  pres: ScenePresentation
  sceneNumber: number
  feedbackRevealed: boolean
}) {
  const theme = pres.palette
  const statement = plainAiClaim(slot(scene, 'aiClaim', '(待核查说法)'))
  const reveal = slot(scene, 'reveal', '(核查结论待生成)')
  const verdict = verifyVerdict(reveal)
  const reason = verifyReason(reveal)
  const choices = ['成立', '不成立'] as const

  return (
    <section
      data-testid="ai-verify-sequence-slide"
      data-response-hidden={feedbackRevealed ? 'false' : 'true'}
      className="relative flex h-full flex-col overflow-hidden px-[7%] pb-[6%] pt-[6%]"
      style={{ background: theme.paper, color: theme.ink }}
    >
      <div aria-hidden className="absolute inset-x-0 top-0 h-2" style={{ background: theme.accent }} />
      <header className="flex items-center justify-between gap-8">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['ai-verify']} theme={theme} />
        <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>
          {feedbackRevealed ? '核对结论' : '先判断'}
        </span>
      </header>

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_300px] gap-7 pt-7">
        <div data-testid="ai-verify-statement" className="grid min-h-0 grid-cols-[132px_minmax(0,1fr)] items-center gap-10 border-y py-8" style={{ borderColor: toRgba(theme.ink, 0.16) }}>
          <div
            aria-hidden
            className="flex h-[112px] w-[112px] items-center justify-center rounded-full border-2"
            style={{ ...fitType('display', 1), borderColor: toRgba(theme.accent, 0.45), color: theme.accent, background: toRgba(theme.accent, 0.06) }}
          >
            {feedbackRevealed ? '✓' : '?'}
          </div>
          <div className="max-w-[1360px]" style={{ ...fitType('heading', statement.length), fontWeight: 750, color: theme.ink }}>
            <MathText>{statement}</MathText>
          </div>
        </div>

        <div
          data-testid="ai-verify-response"
          className={`grid grid-cols-[240px_minmax(0,1fr)] content-center gap-x-9 gap-y-7 border-l-4 px-8 py-7 ${verifyRailClass(scene)}`}
          style={{ borderColor: theme.accent, background: toRgba(theme.accent, feedbackRevealed ? 0.09 : 0.045) }}
        >
          <div style={{ ...TYPE_SCALE.body, color: theme.accent }}>判断</div>
          <div className="grid grid-cols-2 gap-4">
            {choices.map(choice => {
              const selected = feedbackRevealed && choice === verdict
              return (
                <div
                  key={choice}
                  className="flex min-h-[70px] items-center justify-center border-2 px-6"
                  style={{
                    ...TYPE_SCALE.body,
                    borderColor: selected ? theme.accent : toRgba(theme.ink, 0.22),
                    background: selected ? theme.accent : 'transparent',
                    color: selected ? theme.paper : theme.ink,
                    fontWeight: selected ? 800 : 600,
                  }}
                >
                  {choice}
                </div>
              )
            })}
          </div>

          <div style={{ ...TYPE_SCALE.body, color: theme.accent }}>依据</div>
          {feedbackRevealed ? (
            <div style={{ ...fitType('body', reason.length), color: theme.ink }}>
              <MathText>{reason}</MathText>
            </div>
          ) : (
            <div className="self-center border-b-2 border-dashed" style={{ borderColor: toRgba(theme.ink, 0.25) }} />
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * 母版①对照式：左卡是待核查说法，右卡是核查结论。左卡虚线边框+警示色+
 * 轻微倾斜制造"可疑感";右卡板书感实边框+
 * 对勾,视觉确定性明显更高。
 */
function AiVerifyComparisonMaster({ scene, pres, feedbackRevealed }: { scene: LessonScene; pres: ScenePresentation; feedbackRevealed: boolean }) {
  const claim = slot(scene, 'aiClaim', '(待核查说法)')
  const statement = plainAiClaim(claim)
  const reveal = slot(scene, 'reveal', '(核查结论待生成)')
  // 立绘固定贴底、约占该侧 27% 宽 64% 高(DialogueLayer 定档,此处不可改立绘)——
  // 哪张卡与立绘同侧,内容改上置 + 封顶 58% 高度,腾出立绘的安全区(真检:立绘压字)。
  const sprite = spriteSideOf(scene)
  const claimBlocked = sprite === 'left'
  const revealBlocked = sprite === 'right'

  return (
    <section className="relative grid h-full grid-cols-2 gap-6 p-10" style={{ color: pres.palette.ink }}>
      <div className="relative flex h-full -rotate-1 flex-col overflow-hidden rounded-[8px] border-2 border-dashed border-[#b23b2e]/75 bg-[#3a2420] p-8 text-[#ffe3d4]">
        <div className={`flex flex-col gap-4 ${claimBlocked ? 'max-h-[58%]' : 'h-full justify-between'}`}>
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#e0a08a]/60 bg-[#5c2b22] px-3 py-1" style={TYPE_SCALE.caption}>
            <span aria-hidden>⚠</span> 待核查
          </div>
          <div className="relative z-10" style={claimBlocked ? { ...fitType('body', statement.length), fontWeight: 700 } : fitType('heading', statement.length)}><MathText>{statement}</MathText></div>
          <div className="text-[#e0a08a]" style={TYPE_SCALE.caption}>找茬:这句话对吗?</div>
        </div>
      </div>
      <div className="relative flex h-full flex-col overflow-hidden rounded-[8px] border-2 border-[#5c7a5f] bg-[#eef3ee] p-8 text-[#233a2b]">
        <div className={`flex flex-col gap-4 ${revealBlocked ? 'max-h-[58%]' : 'h-full justify-between'}`}>
          {feedbackRevealed ? (
            <>
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-[#33604f] px-3 py-1 text-[#eafbee]" style={TYPE_SCALE.caption}>
                <span aria-hidden>✓</span> 核查结论
              </div>
              <div className="relative z-10" style={revealBlocked ? { ...fitType('body', reveal.length), fontWeight: 700 } : { ...fitType('heading', reveal.length), fontWeight: 800 }}><MathText>{reveal}</MathText></div>
              <div className="h-[2px] w-24 bg-[#33604f]" />
            </>
          ) : (
            <div className="h-full" aria-label="核查结论待显示" />
          )}
        </div>
      </div>
    </section>
  )
}

/**
 * 母版②审讯式:待核查说法满幅大字置中,延续①的可疑视觉语气(虚线边框+倾斜+
 * ⚠徽章),揭底做底部横条——渲染为静态已展开态(不做真交互折叠),但保留
 * "▾ 可展开"的视觉暗示。单条误概念时优先命中候选之一。
 */
function AiVerifyInterrogationMaster({ scene, pres, sceneNumber, feedbackRevealed }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number; feedbackRevealed: boolean }) {
  const theme = pres.palette
  const claim = slot(scene, 'aiClaim', '(待核查说法)')
  const statement = plainAiClaim(claim)
  const reveal = slot(scene, 'reveal', '(核查结论待生成)')
  const sprite = spriteSideOf(scene)

  return (
    <section className="relative flex h-full flex-col" style={{ background: theme.backdrop[2], color: theme.ink }}>
      <div className={`flex flex-1 flex-col items-center justify-center gap-6 px-[9%] text-center ${spritePad(sprite)}`}>
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['ai-verify']} theme={theme} />
        <div className="inline-flex w-fit items-center gap-2 rounded-full border px-4 py-1.5" style={{ ...TYPE_SCALE.caption, borderColor: toRgba(theme.ink, 0.4), borderStyle: 'dashed' }}>
          <span aria-hidden>⚠</span> 待核查
        </div>
        <div className="max-w-[78%] -rotate-1 rounded-[4px] border border-dashed px-8 py-6" style={{ ...fitType('display', statement.length), borderColor: toRgba(theme.ink, 0.35) }}>
          <MathText>{statement}</MathText>
        </div>
      </div>
      {feedbackRevealed ? (
        <div className={`relative z-10 mb-[16%] flex items-center gap-4 border-t px-[6%] py-6 ${spritePad(sprite)}`} style={{ borderColor: toRgba(theme.accent, 0.4), background: theme.paper }}>
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5" style={{ ...TYPE_SCALE.caption, background: theme.accent, color: theme.paper }}>
            <span aria-hidden>✓</span> 核查结论 <span aria-hidden>▾</span>
          </span>
          <div style={{ ...fitType('heading', reveal.length), fontWeight: 700, color: theme.accent }}><MathText>{reveal}</MathText></div>
        </div>
      ) : <div className="mb-[16%]" aria-label="核查结论待显示" />}
    </section>
  )
}

/**
 * 揭底卡中性面:accentSoft 在部分色系(如 Catppuccin 这类紫系深包)下和淡紫
 * 文字同族难辨——揭底卡与找茬卡的区分该靠 ✓/⚠ 徽章 + 边框语言,不该靠底色
 * 撞色(真检 induction-05/09)。改成从 paper 派生的中性面(深包提亮一档、浅包
 * 压深一档),并断言与文字色的 ΔL≥0.35,达不到就沿同方向再拉一档。
 */
function neutralRevealFace(theme: ScenePresentation['palette']): string {
  const isDarkPack = hexToOklch(theme.paper).l < hexToOklch(theme.ink).l
  const toward = isDarkPack ? '#ffffff' : '#000000'
  const textL = hexToOklch(theme.ink).l
  let t = 0.06
  let face = mixOklch(theme.paper, toward, t)
  while (Math.abs(hexToOklch(face).l - textL) < 0.35 && t < 0.5) {
    t += 0.04
    face = mixOklch(theme.paper, toward, t)
  }
  return face
}

/**
 * 母版③找茬清单式:合并幕(一个片段收编 ≥2 条误概念)的原生形态——编号找茬卡
 * 列表,每条一张小卡带⚠(虚线边框+微旋转延续可疑语气),revealN 逐条以同行
 * 对位的揭底条呈现(grid 双列,claim/reveal 交替入列天然对齐同一行)。
 *
 * round(真检 induction-05/09):①条目 ≤2 时字号偏小——升到 heading 音阶
 * (≥3 条内容更密,维持 body 不挤爆);②整组贴顶留大片下半真空——网格改
 * content-center 垂直居中;③揭底卡底色沿用 accentSoft 与文字同族难辨——
 * 改用 neutralRevealFace 派生的中性面。
 */
function AiVerifyChecklistMaster({ scene, pres, sceneNumber, feedbackRevealed = true }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number; feedbackRevealed?: boolean }) {
  const theme = pres.palette
  const pairs = aiVerifyPairs(scene).map(pair => ({
    ...pair,
    claim: plainAiClaim(pair.claim || '(待核查说法)'),
    reveal: pair.reveal || '(核查结论待生成)',
  }))
  const sprite = spriteSideOf(scene)
  const tier = pairs.length <= 2 ? 'heading' : 'body'
  const revealFace = neutralRevealFace(theme)

  return (
    <section className={`flex h-full flex-col gap-5 px-[7%] pb-[7%] pt-[6%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={`${SCENE_TYPE_LABEL['ai-verify']}清单`} theme={theme} />
      <div className="grid flex-1 auto-rows-min content-center grid-cols-2 gap-x-5 gap-y-6 overflow-hidden">
        {pairs.map(pair => (
          <Fragment key={pair.index}>
            <div className="flex -rotate-[0.6deg] flex-col gap-2 rounded-[6px] border border-dashed px-5 py-4" style={{ borderColor: toRgba(theme.ink, 0.35), background: theme.paper }}>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5" style={{ ...TYPE_SCALE.caption, color: theme.ink, background: toRgba(theme.ink, 0.08) }}>
                <span aria-hidden>⚠</span> {pair.index}
              </span>
              <div style={fitType(tier, pair.claim.length)}><MathText>{pair.claim}</MathText></div>
            </div>
            {feedbackRevealed ? (
              <div className="flex flex-col gap-2 rounded-[6px] px-5 py-4" style={{ background: revealFace }}>
                <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>✓ 核查结论</span>
                <div style={{ ...fitType(tier, pair.reveal.length), fontWeight: 700 }}><MathText>{pair.reveal}</MathText></div>
              </div>
            ) : <div aria-label="核查结论待显示" />}
          </Fragment>
        ))}
      </div>
    </section>
  )
}

/**
 * 揭底长文本(>40 字且能按句读切出 ≥2 段)拆成判别列表,每条一行主张;
 * 找不到多句分隔或够短时整段单条渲染——避免长揭底硬套 display 档变成
 * 六行巨字墙(真检 language-04),权威感靠字重+色彩+列表结构表达,不靠尺寸。
 */
function splitRevealPoints(text: string): string[] {
  if (text.length <= 40) return [text]
  const parts = text.split(/(?<=[。；;])/).map(item => item.trim()).filter(Boolean)
  return parts.length >= 2 ? parts.slice(0, 4) : [text]
}

/**
 * 母版④便签钉板式:待核查说法写成歪贴的便签卡(paper-sticker 表面语言:圆角+硬投影
 * +微旋转,钉头小圆点强化"钉在板上"的隐喻),钉在大板书面背景上;揭底降级为
 * 板书正文——裸排大字、无卡片包裹,与便签的虚边框+倾斜+徽章形成明显语气落差。
 * 揭底字号按内容长度走 fitType(heading, len)而非死 display 档,长文本按句读
 * 拆成判别列表(真检 round15 修复:六行 display 巨字墙)。
 */
function AiVerifyStickyNoteMaster({ scene, pres, sceneNumber, feedbackRevealed }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number; feedbackRevealed: boolean }) {
  const theme = pres.palette
  const surface = cardSurface(theme, 'paper-sticker')
  const claim = slot(scene, 'aiClaim', '(待核查说法)')
  const statement = plainAiClaim(claim)
  const reveal = slot(scene, 'reveal', '(核查结论待生成)')
  const sprite = spriteSideOf(scene)
  const revealPoints = splitRevealPoints(reveal)

  return (
    <section className={`relative flex h-full flex-col justify-center gap-10 px-[9%] pb-[10%] ${spritePad(sprite)}`} style={{ background: theme.backdrop[1], color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['ai-verify']} theme={theme} />
      <div
        className="relative w-fit max-w-[62%] self-start px-7 py-6"
        style={{ background: theme.paper, border: surface.border, boxShadow: surface.boxShadow, borderRadius: surface.borderRadius, transform: surface.transform, color: theme.ink }}
      >
        <span aria-hidden className="absolute -top-2 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full" style={{ background: theme.accent }} />
        <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full border border-dashed px-3 py-1" style={{ ...TYPE_SCALE.caption, borderColor: toRgba(theme.ink, 0.4) }}>
          <span aria-hidden>⚠</span> 待核查
        </div>
        <div style={fitType('heading', statement.length)}><MathText>{statement}</MathText></div>
      </div>
      {feedbackRevealed && (revealPoints.length > 1
        ? (
          <div className="flex max-w-[82%] flex-col gap-3">
            {revealPoints.map((point, index) => (
              <div key={index} className="flex items-start gap-3">
                <span aria-hidden className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ ...TYPE_SCALE.caption, background: theme.accent, color: theme.paper }}>
                  ✓
                </span>
                <span style={{ ...fitType('heading', point.length), fontWeight: 800, color: theme.accent }}><MathText>{point}</MathText></span>
              </div>
            ))}
          </div>
        )
        : (
          <div className="max-w-[80%]" style={{ ...fitType('heading', reveal.length), fontWeight: 800, color: theme.accent }}><MathText>{reveal}</MathText></div>
        ))}
    </section>
  )
}

/* ── ai-inquiry:AI 提问链 ─────────────────────────────────────── */

/** 样本文本按「问：… AI答/AI 答：…」切开;找不到分隔时整段退化为答案,不崩。 */
function splitQA(sample: string): { question: string; answer: string } {
  const match = sample.match(/AI\s*答[：:]?/)
  if (!match || match.index === undefined) return { question: '', answer: sample }
  const question = sample.slice(0, match.index).replace(/^问[：:]?/, '').trim()
  const answer = sample.slice(match.index + match[0].length).trim()
  return { question, answer }
}

export function AiInquiryView({ scene, course, pres, sceneNumber }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation; sceneNumber: number }) {
  const master = pickAiInquiryMaster(course, scene)
  if (master === 'waterfall') return <AiInquiryWaterfallMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  if (master === 'chat') return <AiInquiryChatMaster scene={scene} pres={pres} sceneNumber={sceneNumber} />
  return <AiInquiryComparisonMaster scene={scene} pres={pres} />
}

/**
 * 母版①对照式(既有骨架,原样保留):左右都是真实、合法的 AI 回答样本(浅问 vs
 * 追问),没有对错之分,但教学意图是「浅问只换来套话,追问才逼出真话」——
 * 两栏必须有视觉权重差。浅问栏降权(灰底、次级墨色);追问栏升权(accent 边框/
 * 亮底/问句强调)。
 */
function AiInquiryComparisonMaster({ scene, pres }: { scene: LessonScene; pres: ScenePresentation }) {
  const theme = pres.palette
  const shallow = splitQA(slot(scene, 'shallowSample', '(浅问样本待生成)'))
  const probing = splitQA(slot(scene, 'probingSample', '(追问样本待生成)'))

  return (
    <section className="relative grid h-full grid-cols-2 gap-6 p-10" style={{ color: theme.ink }}>
      <div className="relative flex h-full flex-col justify-center gap-5 overflow-hidden pack-surface border px-9 py-10" style={{ borderColor: `${theme.ink}22`, background: `${theme.backdrop[1]}b3` }}>
        <span className="inline-flex w-fit items-center rounded-full px-3 py-1" style={{ ...TYPE_SCALE.caption, background: `${theme.ink}14`, color: `${theme.ink}80` }}>
          浅问
        </span>
        <div className="flex flex-col gap-3 opacity-75">
          {shallow.question && <div style={{ ...fitType('body', shallow.question.length), fontWeight: 500, color: `${theme.ink}99` }}>问:<MathText>{shallow.question}</MathText></div>}
          <div style={fitType('heading', shallow.answer.length)}>AI 答:<MathText>{shallow.answer}</MathText></div>
        </div>
      </div>
      <div className="relative flex h-full flex-col justify-center gap-5 overflow-hidden pack-surface border-2 px-9 py-10" style={{ borderColor: theme.accent, background: theme.accentSoft }}>
        <span className="inline-flex w-fit items-center rounded-full px-3 py-1" style={{ ...TYPE_SCALE.caption, background: theme.accent, color: theme.paper }}>
          追问
        </span>
        <div className="flex flex-col gap-3">
          {probing.question && <div style={{ ...fitType('body', probing.question.length), color: theme.accent }}>问:<MathText>{probing.question}</MathText></div>}
          <div style={{ ...fitType('heading', probing.answer.length), fontWeight: 800 }}>AI 答:<MathText>{probing.answer}</MathText></div>
        </div>
      </div>
    </section>
  )
}

/**
 * 母版②上下瀑布式:浅问段在上(降权灰底+次级墨色)、追问段在下(升权 accent
 * 实底),中间「↓ 换个问法」转场条把两段接成一次追问过程——与①的左右并列
 * 骨架完全不同。
 */
function AiInquiryWaterfallMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const shallow = splitQA(slot(scene, 'shallowSample', '(浅问样本待生成)'))
  const probing = splitQA(slot(scene, 'probingSample', '(追问样本待生成)'))
  const sprite = spriteSideOf(scene)

  return (
    <section className="relative flex h-full flex-col" style={{ color: theme.ink }}>
      <div className="pointer-events-none absolute left-6 top-6 z-20">
        <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['ai-inquiry']} theme={theme} />
      </div>
      <div className={`flex flex-1 flex-col justify-center gap-3 px-[9%] opacity-75 ${spritePad(sprite)}`} style={{ background: toRgba(theme.ink, 0.05) }}>
        <span style={{ ...TYPE_SCALE.caption, color: toRgba(theme.ink, 0.6) }}>浅问</span>
        {shallow.question && <div style={{ ...fitType('body', shallow.question.length), color: toRgba(theme.ink, 0.7) }}>问:<MathText>{shallow.question}</MathText></div>}
        <div style={fitType('heading', shallow.answer.length)}>AI 答:<MathText>{shallow.answer}</MathText></div>
      </div>
      <div className="relative z-10 flex items-center justify-center gap-2 py-3" style={{ background: theme.accent, color: theme.paper }}>
        <span aria-hidden>↓</span>
        <span style={TYPE_SCALE.caption}>换个问法</span>
      </div>
      <div className={`flex flex-1 flex-col justify-center gap-3 px-[9%] ${spritePad(sprite)}`} style={{ background: theme.accentSoft }}>
        <span style={{ ...TYPE_SCALE.caption, color: theme.accent }}>追问</span>
        {probing.question && <div style={{ ...fitType('body', probing.question.length), color: theme.accent }}>问:<MathText>{probing.question}</MathText></div>}
        <div style={{ ...fitType('heading', probing.answer.length), fontWeight: 800 }}>AI 答:<MathText>{probing.answer}</MathText></div>
      </div>
    </section>
  )
}

function ChatBubble({ text, align, tone, theme }: { text: string; align: 'left' | 'right'; tone: 'muted' | 'accent'; theme: ScenePresentation['palette'] }) {
  const isAccent = tone === 'accent'
  return (
    <div className={`flex ${align === 'right' ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[72%] rounded-[18px] px-5 py-3"
        style={{
          ...fitType('body', text.length),
          background: isAccent ? theme.accent : toRgba(theme.ink, 0.08),
          color: isAccent ? theme.paper : theme.ink,
          borderBottomRightRadius: align === 'right' ? '4px' : '18px',
          borderBottomLeftRadius: align === 'left' ? '4px' : '18px',
        }}
      >
        <MathText>{text}</MathText>
      </div>
    </div>
  )
}

/**
 * 母版③对话流式:问答渲染成 IM 对话气泡流(浅问一组灰气泡靠左,追问一组 accent
 * 气泡靠右),galgame 世界观贴脸——与①②都不同的"聊天记录"骨架。
 */
function AiInquiryChatMaster({ scene, pres, sceneNumber }: { scene: LessonScene; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const shallow = splitQA(slot(scene, 'shallowSample', '(浅问样本待生成)'))
  const probing = splitQA(slot(scene, 'probingSample', '(追问样本待生成)'))
  const sprite = spriteSideOf(scene)

  return (
    <section className={`flex h-full flex-col justify-center gap-4 px-[9%] pb-[9%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL['ai-inquiry']} theme={theme} />
      <div className="flex flex-col gap-3">
        {shallow.question && <ChatBubble text={`问:${shallow.question}`} align="left" tone="muted" theme={theme} />}
        <ChatBubble text={`AI 答:${shallow.answer}`} align="left" tone="muted" theme={theme} />
        {probing.question && <ChatBubble text={`问:${probing.question}`} align="right" tone="accent" theme={theme} />}
        <ChatBubble text={`AI 答:${probing.answer}`} align="right" tone="accent" theme={theme} />
      </div>
    </section>
  )
}
