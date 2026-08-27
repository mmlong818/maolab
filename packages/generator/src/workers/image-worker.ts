import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { validatedGenerate } from '../llm/validated-generate.js'
import { generateOpenAIImage, type ImageProviderConfig } from '../llm/openai-image.js'
import { buildReferenceMaterial } from '../pipeline/find-chapter.js'
import type { ContentWorker } from './types.js'
import type { Scene, OutlineItem, KnowledgeProfile, TeachingPlan } from '@maolab/shared-types'
import type { RetryOptions } from '../llm/validated-generate.js'

const ImageOutputSchema = z.object({
  title: z.string().min(1).max(80),
  caption: z.string().min(1).max(200),
  speakerNote: z.string().min(1),
  prompt: z.string().min(10),
  altText: z.string().min(1).max(200),
})

/**
 * "Universal Education Visual Engine" — the LLM is treated as an educational visual
 * generation system whose only job is to pick the BEST instructional visualization
 * for a teaching scene, then emit it as a Chinese prompt suitable for gpt-image-2.
 *
 * Source spec: 通用教学配图生成引擎 / Universal Education Visual Engine.
 */
const SYSTEM_PROMPT = `你是一个专业的"教育配图生成引擎",不是普通的 AI 艺术生成器。

你的任务：为给定的教学要点挑选**唯一最合适**的可视化方式，然后输出一份 JSON 规格。
最终图片应当看起来像一流的现代教材插图、科学纪录片配图，或 Apple/Google Education 风格的课件插图，
而**不是**通用 AI 艺术。

核心原则："图像服务于理解，而非视觉奇观。"

输出 —— 合法 JSON，**禁止**使用 markdown 代码围栏：
{
  "title": "场景短标题（中文）",
  "caption": "显示在图片下方的一句说明（中文）",
  "speakerNote": "展示这张图时教师的旁白，2-3 句（中文）",
  "prompt": "中文图像生成 prompt，60-150 字，按下方结构组织",
  "altText": "屏幕阅读器替代文本（中文）"
}

## 如何构造 prompt

第 1 步 —— 根据主题 / 学科 / 教学目标自动归类：
  数学 / 公式       → 示意图、坐标系、几何证明、函数曲线、分层信息、极简风
  物理              → 力矢量、运动轨迹、电路、能量流、带标注的实验装置、工程线稿
  化学              → 分子结构、反应步骤布局、原子模型、实验装置、反应前后对比
  生物              → 横截面、细胞器、解剖准确、分类层级、生命周期、教材生物图谱风
  历史              → 时代准确的场景、服饰 / 建筑 / 时代复原、教育插画基调（避免电影化英雄主义）
  地理              → 截面图、气候循环、板块构造、洋流、分层地球图
  语文 / 文学       → 柔和场景插画、人物互动、注重氛围而非奇观
  工程 / 信息技术    → 系统架构、模块图、数据流、节点关系、蓝图感

第 2 步 —— 自动决定可视化方式（选 1 种主方式，最多再加 1 种次方式）：
  俯视图 · 横截面 · 爆炸图 · 流程图 · 分步序列 ·
  前后对比 · 时间轴 · 信息图 · 微观视图 · 宏观视图 ·
  半透明分层结构 · 引线标注 · 运动轨迹箭头 ·
  局部放大插图 · 多层堆叠

第 3 步 —— 按以下顺序撰写中文 prompt：
  (1) 主体 + 视角           例如："叶绿体的带标注横截面示意图，"
  (2) 可视化方式            例如："爆炸图展示类囊体堆叠与基质，"
  (3) 教育风格关键词         "专业教育插画、现代教材视觉设计、科学准确、构图干净、层次清晰、教学可视化"
  (4) 构图规则              "水平 16:9 比例，主体居中，为幻灯片标题留出大量留白，视觉噪点最少"
  (5) 负面提示（避免出现）   "避免电影感打光、避免 AI 艺术光晕、避免装饰性杂物、避免赛博朋克 / 奇幻 / 游戏原画风格、避免出现无法识别的乱码文字"

## 硬性规则
- **输出语言**：prompt 字段必须为**中文**；title / caption / speakerNote / altText 也使用中文。
- **多对象 / 多面板场景禁止图内标签**（防止标签错位）：
  如果画面包含 2 个或以上分隔的子对象（并排、对比、九宫格、三联画等），
  **不要**在 prompt 中要求图像模型在图内绘制每个子对象的文字标签 —
  图像模型经常把标签贴错位置（例如把"减速"贴到"踢球"那一格）。
  这种情况下：prompt 只描述视觉内容，文字解读放到 caption / speakerNote / altText 里，
  或在前端用引线 / 数字角标外置叠加。
- **单对象图允许图内文字**：仅当画面只有 1 个主体且必须标注（如细胞结构图标注"细胞核""线粒体"），
  才在 prompt 中要求**简体中文**标签，禁止英文 / 拼音。
- **禁止风格**：电影 / 赛博朋克 / 奇幻 / 电影海报 / 游戏原画，拒绝视觉奇观。
- 教学准确性优先于美感。解剖错、时代错、科学结构错 = 无效输出。
- 默认 16:9 横向，便于演示时叠加幻灯片标题。
- 默认追加质量关键词："4K、高细节、现代教学材料美学、精确的信息设计、适合演示"。
- 按学段调整复杂度：小学 → 更简洁、更少标签；大学 → 更丰富的细节。`

const USER_TEMPLATE = `Topic: {{topic}}
Domain: {{domain}}
Scene title: {{title}}
Learning objective: {{objective}}
Grade level: {{gradeLevel}}
Output language: {{language}}

Generate ONE illustrative image specification for this scene.`

function buildPollinationsUrl(prompt: string, width = 1024, height = 768): string {
  const encoded = encodeURIComponent(prompt.trim())
  const seed = Math.floor(Math.random() * 1_000_000)
  return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`
}

export class ImageWorker implements ContentWorker {
  readonly type = 'image' as const

  constructor(
    private readonly callLLM: (userPrompt: string, systemPrompt?: string) => Promise<string>,
    private readonly retryOptions: RetryOptions = { maxRetries: 3, baseDelay: 0 },
    private readonly imageProvider?: ImageProviderConfig,
  ) {}

  async generate(item: OutlineItem, profile: KnowledgeProfile, plan: TeachingPlan): Promise<Scene> {
    const user = USER_TEMPLATE
      .replace('{{topic}}', profile.topic)
      .replace('{{domain}}', profile.domain)
      .replace('{{title}}', item.title)
      .replace('{{objective}}', item.objective)
      .replace('{{gradeLevel}}', plan.gradeLevel ?? 'not specified')
      .replace('{{language}}', plan.language)

    const reference = buildReferenceMaterial(item, plan)
    const finalUser = reference ? user + reference : user

    const boundCall = (prompt: string) => this.callLLM(prompt, SYSTEM_PROMPT)
    const output = await validatedGenerate(finalUser, ImageOutputSchema, boundCall, this.retryOptions)

    let url: string
    let width: number
    let height: number
    let provider: 'openai' | 'pollinations'

    if (this.imageProvider?.apiKey) {
      try {
        const result = await generateOpenAIImage(output.prompt, this.imageProvider)
        url = result.url
        width = result.width
        height = result.height
        provider = 'openai'
      } catch (err) {
        console.warn('[ImageWorker] OpenAI image generation failed, falling back to Pollinations:', err)
        width = 1024
        height = 768
        url = buildPollinationsUrl(output.prompt, width, height)
        provider = 'pollinations'
      }
    } else {
      width = 1024
      height = 768
      url = buildPollinationsUrl(output.prompt, width, height)
      provider = 'pollinations'
    }

    return {
      id: randomUUID(),
      outlineItemId: item.id,
      type: 'image',
      title: output.title,
      content: {
        type: 'image',
        title: output.title,
        caption: output.caption,
        speakerNote: output.speakerNote,
        prompt: output.prompt,
        url,
        width,
        height,
        altText: output.altText,
        provider,
      },
      actions: [],
      durationHint: item.durationHint,
      generationStatus: 'done',
    }
  }
}
