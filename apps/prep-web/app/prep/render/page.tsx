'use client'

// 3b：课件渲染页，只给 workers/render 的无头浏览器用（spec 4.1 截图门禁与 PPTX 导出）。
// 课程数据只从渲染约定地址取：worker 在浏览器里拦截它、按任务的 owner 供数；生产 Nginx 与 api 上没有这个接口，
// 直接打开本页只会显示错误。StageCanvas 与 maolab 431d507 相同：?export=1&page=N 时进入导出渲染态，
// 目标页的字体与图片就绪后设 body[data-export-ready=N]，worker 等到它才量度、截图。
import { useEffect, useState } from 'react'
import { StageCanvas } from '@/components/mainline/StageCanvas'
import type { MainlineCourse } from '@/lib/mainline/domain'
import { PROJECTION_RENDER_CONTRACT, projectionRenderDataPath, type ProjectionRenderData } from '@maolab/course/render-contract'

type State =
  | { status: 'loading' }
  | { status: 'ready'; course: MainlineCourse }
  | { status: 'error'; message: string }

export default function PrepRenderPage() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const courseId = params.get('course')
    if (params.get('export') !== '1' || !courseId) {
      setState({ status: 'error', message: '缺少渲染参数' })
      return
    }
    let active = true
    fetch(projectionRenderDataPath(courseId), { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`渲染数据不可用（HTTP ${response.status}）`)
        const body = (await response.json()) as ProjectionRenderData
        if (body.contract !== PROJECTION_RENDER_CONTRACT || !body.course) throw new Error('渲染数据版本不符')
        if (active) setState({ status: 'ready', course: body.course as MainlineCourse })
      })
      .catch((error: unknown) => {
        if (active) setState({ status: 'error', message: error instanceof Error ? error.message : String(error) })
      })
    return () => {
      active = false
    }
  }, [])

  if (state.status === 'error') return <main data-render-error={state.message} style={{ padding: 24 }}>{state.message}</main>
  if (state.status === 'loading') return null
  return <StageCanvas courses={[state.course]} />
}
