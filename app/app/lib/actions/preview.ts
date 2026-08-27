'use server'

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { Scene, ImageContent } from '@maolab/shared-types'
import { createDb, createStageRepository } from '@maolab/db'
import { generateOpenAIImage, type ImageProviderConfig } from '@maolab/generator'

const DB_URL = process.env.DATABASE_URL ?? 'file:./data/maolab.db'

export async function saveScene(stageId: string, scene: Scene): Promise<void> {
  if (typeof stageId !== 'string' || stageId.length === 0) {
    throw new Error('stageId 不合法')
  }
  if (!scene || typeof scene !== 'object' || typeof scene.id !== 'string') {
    throw new Error('scene 不合法')
  }
  const db = createDb(DB_URL)
  const repo = createStageRepository(db)
  const existing = await repo.find(stageId)
  if (!existing) throw new Error('Stage 不存在')

  await repo.updateScene(stageId, scene)
  revalidatePath(`/preview/${stageId}`)
  revalidatePath(`/classroom/${stageId}`)
  revalidatePath(`/teach/${stageId}`)
}

function buildPollinationsUrl(prompt: string, width = 1024, height = 768): string {
  const encoded = encodeURIComponent(prompt.trim())
  const seed = Math.floor(Math.random() * 1_000_000)
  return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`
}

function getImageProviderConfig(): ImageProviderConfig | undefined {
  const apiKey = process.env['OPENAI_IMAGE_API_KEY']
  if (!apiKey) return undefined
  return {
    apiKey,
    ...(process.env['OPENAI_IMAGE_MODEL'] ? { model: process.env['OPENAI_IMAGE_MODEL'] } : {}),
    ...(process.env['OPENAI_IMAGE_BASE_URL'] ? { baseURL: process.env['OPENAI_IMAGE_BASE_URL'] } : {}),
    ...(process.env['OPENAI_IMAGE_SIZE'] ? { size: process.env['OPENAI_IMAGE_SIZE'] as NonNullable<ImageProviderConfig['size']> } : {}),
    ...(process.env['OPENAI_IMAGE_QUALITY'] ? { quality: process.env['OPENAI_IMAGE_QUALITY'] as NonNullable<ImageProviderConfig['quality']> } : {}),
    outputDir: join(process.cwd(), 'public', 'generated-images'),
    publicPrefix: '/generated-images',
  }
}

export async function addImageScene(
  stageId: string,
  options: { title: string; prompt: string; caption?: string; speakerNote?: string },
): Promise<Scene> {
  if (typeof stageId !== 'string' || stageId.length === 0) {
    throw new Error('stageId 不合法')
  }
  if (typeof options.title !== 'string' || options.title.trim().length === 0) {
    throw new Error('标题不能为空')
  }
  if (typeof options.prompt !== 'string' || options.prompt.trim().length < 5) {
    throw new Error('prompt 至少需要 5 个字符')
  }
  if (options.prompt.length > 1000) {
    throw new Error('prompt 不能超过 1000 字符')
  }

  const db = createDb(DB_URL)
  const repo = createStageRepository(db)
  const stage = await repo.find(stageId)
  if (!stage) throw new Error('Stage 不存在')

  const imageCfg = getImageProviderConfig()
  let url: string
  let width: number
  let height: number
  let provider: 'openai' | 'pollinations'

  if (imageCfg) {
    try {
      const result = await generateOpenAIImage(options.prompt.trim(), imageCfg)
      url = result.url
      width = result.width
      height = result.height
      provider = 'openai'
    } catch (err) {
      console.warn('[addImageScene] OpenAI image failed, falling back to Pollinations:', err)
      width = 1024
      height = 768
      url = buildPollinationsUrl(options.prompt.trim(), width, height)
      provider = 'pollinations'
    }
  } else {
    width = 1024
    height = 768
    url = buildPollinationsUrl(options.prompt.trim(), width, height)
    provider = 'pollinations'
  }

  const content: ImageContent = {
    type: 'image',
    title: options.title.trim(),
    caption: options.caption?.trim() ?? '',
    speakerNote: options.speakerNote?.trim() ?? '',
    prompt: options.prompt.trim(),
    url,
    width,
    height,
    altText: options.title.trim(),
    provider,
  }

  const newScene: Scene = {
    id: randomUUID(),
    outlineItemId: 'manual',
    type: 'image',
    title: options.title.trim(),
    content,
    actions: [],
    durationHint: 30,
    generationStatus: 'done',
  }

  await repo.updateScene(stageId, newScene)
  revalidatePath(`/preview/${stageId}`)
  revalidatePath(`/classroom/${stageId}`)
  revalidatePath(`/teach/${stageId}`)
  return newScene
}

export async function regenerateImageScene(
  stageId: string,
  sceneId: string,
  prompt: string,
): Promise<{ url: string; width: number; height: number; provider: 'openai' | 'pollinations' }> {
  if (typeof prompt !== 'string' || prompt.trim().length < 5) {
    throw new Error('prompt 至少需要 5 个字符')
  }
  if (prompt.length > 1000) throw new Error('prompt 不能超过 1000 字符')

  const db = createDb(DB_URL)
  const repo = createStageRepository(db)
  const stage = await repo.find(stageId)
  if (!stage) throw new Error('Stage 不存在')
  const scene = stage.scenes.find(s => s.id === sceneId)
  if (!scene || scene.content.type !== 'image') throw new Error('Scene 不是 image 类型')

  const imageCfg = getImageProviderConfig()
  let url: string
  let width: number
  let height: number
  let provider: 'openai' | 'pollinations'

  if (imageCfg) {
    try {
      const result = await generateOpenAIImage(prompt.trim(), imageCfg)
      url = result.url
      width = result.width
      height = result.height
      provider = 'openai'
    } catch (err) {
      console.warn('[regenerateImageScene] OpenAI failed, falling back to Pollinations:', err)
      width = 1024
      height = 768
      url = buildPollinationsUrl(prompt.trim(), width, height)
      provider = 'pollinations'
    }
  } else {
    width = 1024
    height = 768
    url = buildPollinationsUrl(prompt.trim(), width, height)
    provider = 'pollinations'
  }

  const updated: Scene = {
    ...scene,
    content: {
      ...scene.content,
      prompt: prompt.trim(),
      url,
      width,
      height,
      provider,
    },
  }

  await repo.updateScene(stageId, updated)
  revalidatePath(`/preview/${stageId}`)
  revalidatePath(`/classroom/${stageId}`)
  revalidatePath(`/teach/${stageId}`)
  return { url, width, height, provider }
}
