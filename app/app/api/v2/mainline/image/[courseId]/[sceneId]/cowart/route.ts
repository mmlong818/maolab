import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateOpenAIImageEdit } from '@maolab/generator'
import { type NextRequest, NextResponse } from 'next/server'
import {
  buildCowartEditPrompt,
  imageSizeFromAspect,
  normalizeCowartInstruction,
  parseCowartAnnotationDataUrl,
} from '../../../../../../../lib/mainline/image-edit/cowart.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../../../lib/mainline/store.js'
import { auditGeneratedPageFacts } from '../../../../../../../lib/mainline/planning/page-content-page-audit.js'
import { applyGeneratedPageImageRevision } from '../../../../../../../lib/mainline/page-image-revision.js'
import { courseImageTarget } from '../../../../../../../lib/mainline/page-image-target.js'

export const runtime = 'nodejs'
export const maxDuration = 180

export async function POST(req: NextRequest, ctx: { params: Promise<{ courseId: string; sceneId: string }> }) {
  const { courseId, sceneId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: '课程不存在。' }, { status: 404 })

  const target = courseImageTarget(course, sceneId)
  const scene = target?.scene
  if (!target || !scene?.imageUrl) return NextResponse.json({ error: '这一页没有可修改的图片。' }, { status: 404 })

  const apiKey = process.env.OPENAI_IMAGE_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({ error: '尚未配置图片编辑服务，无法生成修改版。' }, { status: 503 })
  }

  let annotation
  let instruction
  try {
    const body = await req.json() as { annotationDataUrl?: unknown; instruction?: unknown }
    annotation = parseCowartAnnotationDataUrl(body.annotationDataUrl)
    instruction = normalizeCowartInstruction(body.instruction)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '请求格式无效。' }, { status: 400 })
  }

  const tempDirectory = await mkdtemp(join(tmpdir(), 'maolab-cowart-'))
  const annotationPath = join(tempDirectory, `annotation.${annotation.extension}`)
  try {
    await writeFile(annotationPath, annotation.buffer)
    const generated = await generateOpenAIImageEdit(
      buildCowartEditPrompt(scene, instruction),
      [annotationPath],
      {
        apiKey,
        model: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2',
        size: imageSizeFromAspect(scene.imageAspect),
        quality: (process.env.OPENAI_IMAGE_QUALITY as 'low' | 'medium' | 'high' | 'auto' | undefined) ?? 'medium',
        outputDir: join(process.cwd(), 'public', 'generated-images'),
        publicPrefix: '/generated-images',
      },
    )

    const nextScene = { ...scene, imageUrl: generated.url }
    const nextCourse = target.kind === 'page'
      ? await applyGeneratedPageImageRevision(course, target.page.pageId, {
          imageUrl: generated.url,
          ...(target.page.imagePrompt ? { imagePrompt: target.page.imagePrompt } : {}),
          ...(target.page.imageAspect ? { imageAspect: target.page.imageAspect } : {}),
        }, { audit: auditGeneratedPageFacts })
      : {
          ...course,
          scenes: course.scenes.map(item => item.id === sceneId ? nextScene : item),
        }
    await saveMainlineCourse(nextCourse)
    return NextResponse.json({ ok: true, sceneId, targetKind: target.kind, imageUrl: generated.url })
  } catch (error) {
    console.error('[mainline-cowart-edit]', error)
    return NextResponse.json({ error: '修改版图片生成失败，请检查图片服务后重试。' }, { status: 500 })
  } finally {
    await rm(tempDirectory, { recursive: true, force: true })
  }
}
