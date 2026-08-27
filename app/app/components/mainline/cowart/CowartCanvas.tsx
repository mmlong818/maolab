'use client'

import { getAssetUrlsByMetaUrl } from '@tldraw/assets/urls'
import { ArrowLeft, CheckCircle2, LoaderCircle, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useState } from 'react'
import { Tldraw, type Editor } from 'tldraw'
import type { CowartImageEditorProps } from './CowartImageEditor'
import styles from './CowartImageEditor.module.css'

const assetUrls = getAssetUrlsByMetaUrl()

interface EditResponse {
  error?: string
  imageUrl?: string
}

export function CowartCanvas({ courseId, sceneId, imageUrl, visualFocus }: CowartImageEditorProps) {
  const [editor, setEditor] = useState<Editor | null>(null)
  const [instruction, setInstruction] = useState('')
  const [canvasStatus, setCanvasStatus] = useState('正在载入原图…')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const sourceUrl = `/api/v2/mainline/image/${courseId}/${sceneId}/source`
  const backHref = `/mainline/${courseId}/prep?scene=${encodeURIComponent(sceneId)}`

  const handleMount = useCallback((mountedEditor: Editor) => {
    setEditor(mountedEditor)
    if (mountedEditor.getCurrentPageShapes().length > 0) {
      setCanvasStatus('画布已就绪')
      window.setTimeout(() => mountedEditor.zoomToFit({ animation: { duration: 180 } }), 0)
      return
    }

    void importSourceImage(mountedEditor, sourceUrl, sceneId)
      .then(() => setCanvasStatus('画布已就绪'))
      .catch(reason => {
        setCanvasStatus('原图载入失败')
        setError(reason instanceof Error ? reason.message : String(reason))
      })
  }, [sceneId, sourceUrl])

  async function createRevision() {
    if (!editor) return
    const shapeIds = [...editor.getCurrentPageShapeIds()]
    if (shapeIds.length === 0) {
      setError('画布里没有可提交的图片或标注。')
      return
    }

    setSubmitting(true)
    setError(null)
    setResultUrl(null)
    try {
      const exported = await editor.toImageDataUrl(shapeIds, {
        background: true,
        darkMode: false,
        format: 'png',
        padding: 32,
        pixelRatio: 1.5,
      })
      const response = await fetch(`/api/v2/mainline/image/${courseId}/${sceneId}/cowart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotationDataUrl: exported.url, instruction }),
      })
      const body = await readEditResponse(response)
      if (!response.ok || !body.imageUrl) throw new Error(body.error ?? `HTTP ${response.status}`)
      setResultUrl(body.imageUrl)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link href={backHref} className={styles.backLink}>
          <ArrowLeft size={18} aria-hidden="true" />
          返回备课
        </Link>
        <div className={styles.headingGroup}>
          <strong>Cowart 修改</strong>
          <span>{visualFocus}</span>
        </div>
        <span className={styles.status}>{canvasStatus}</span>
      </header>

      <div className={styles.workspace}>
        <section className={styles.canvasRegion} aria-label="Cowart 无限画布">
          <Tldraw
            assetUrls={assetUrls}
            persistenceKey={`maolab-cowart:${courseId}:${sceneId}:${imageUrl}`}
            onMount={handleMount}
            {...(process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY
              ? { licenseKey: process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY }
              : {})}
          />
        </section>

        <aside className={styles.inspector}>
          <div className={styles.inspectorHeader}>
            <span>修改稿</span>
              <small>原图与标注将发送至已配置的图像模型</small>
          </div>

          <label className={styles.fieldLabel} htmlFor="cowart-instruction">补充修改要求</label>
          <textarea
            id="cowart-instruction"
            className={styles.textarea}
            value={instruction}
            onChange={event => setInstruction(event.target.value)}
            maxLength={1000}
            placeholder="例如：保留构图，把右侧标题改得更清晰"
          />

          {error ? <div className={styles.error} role="alert">{error}</div> : null}

          <button
            type="button"
            className={styles.generateButton}
            onClick={() => void createRevision()}
            disabled={!editor || submitting}
          >
            {submitting ? <LoaderCircle className={styles.spin} size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
            {submitting ? '正在生成修改版…' : '生成修改版'}
          </button>

          {resultUrl ? (
            <div className={styles.result}>
              <div className={styles.resultTitle}>
                <CheckCircle2 size={18} aria-hidden="true" />
                修改版已替换本幕图片
              </div>
              <img src={resultUrl} alt="Cowart 生成的修改版教学图片" />
              <Link href={backHref} className={styles.doneLink}>返回备课查看</Link>
            </div>
          ) : null}
        </aside>
      </div>
    </main>
  )
}

async function importSourceImage(editor: Editor, sourceUrl: string, sceneId: string): Promise<void> {
  const response = await fetch(sourceUrl)
  if (!response.ok) {
    const body = await readEditResponse(response)
    throw new Error(body.error ?? '原图读取失败。')
  }

  const blob = await response.blob()
  const extension = blob.type === 'image/jpeg' ? 'jpg' : 'png'
  const file = new File([blob], `${sceneId}.${extension}`, { type: blob.type || 'image/png' })
  await editor.putExternalContent({
    type: 'files',
    files: [file],
    point: editor.getViewportPageBounds().center,
  })
  editor.zoomToFit({ animation: { duration: 180 } })
}

async function readEditResponse(response: Response): Promise<EditResponse> {
  try {
    return await response.json() as EditResponse
  } catch {
    return {}
  }
}
