'use client'

import type { ReactNode } from 'react'
import type { LessonScene, MainlineCourse, ScenePresentation, VisiblePageContent } from '@/lib/mainline'
import { pageContentFromScene, pairedPromptContentFromScene, presentationFor } from '@/lib/mainline'
import { toRgba } from '@/lib/mainline/presentation/color'
import { pagePromptLayout } from '@/lib/mainline/presentation/content-aware-layout'
import { projectionFontSize, TYPE_SCALE } from '@/lib/mainline/presentation/tokens'
import { MathText } from './shared'

interface PageContentSlideViewProps {
  course: MainlineCourse
  scene: LessonScene
  sceneNumber: number
}

export function PageContentSlideView({ course, scene, sceneNumber }: PageContentSlideViewProps) {
  const content = pageContentFromScene(scene)
  const prompt = pairedPromptContentFromScene(scene)
  const pres = presentationFor(scene, course)

  if (!content) {
    return (
      <section className="flex h-full items-center justify-center px-[10%] text-center" style={{ color: pres.palette.ink }}>
        <p style={{ ...TYPE_SCALE.body }}>本页内容暂不可用</p>
      </section>
    )
  }

  return (
    <section
      data-page-content-kind={content.kind}
      className="scene-safe-bottom flex h-full w-full flex-col px-[7.5%] pt-[5%]"
      style={{ color: pres.palette.ink }}
    >
      <header className="flex shrink-0 items-start gap-6 border-b pb-6" style={{ borderColor: toRgba(pres.palette.ink, 0.16) }}>
        <span
          className="mt-2 min-w-[64px] font-semibold"
          style={{ color: pres.palette.accent, fontSize: projectionFontSize('auxiliary'), lineHeight: 1.3 }}
        >
          {String(sceneNumber).padStart(2, '0')}
        </span>
        <h1 className="max-w-[1500px]" style={{ ...TYPE_SCALE.heading }}>
          <MathText>{content.title}</MathText>
        </h1>
      </header>

      <div className="min-h-0 flex-1 pt-8">
        <PageBody content={content} prompt={prompt} imageUrl={scene.imageUrl} pres={pres} />
      </div>
    </section>
  )
}

function PageBody({ content, prompt, imageUrl, pres }: {
  content: VisiblePageContent
  prompt: VisiblePageContent | undefined
  imageUrl: string | undefined
  pres: ScenePresentation
}) {
  switch (content.kind) {
    case 'course-orientation':
      return (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex min-h-0 flex-1 items-center border-l-4 pl-10" style={{ borderColor: pres.palette.accent }}>
            <p className="max-w-[1500px]" style={{ fontSize: projectionFontSize('display', 64), lineHeight: 1.24, fontWeight: 700 }}>
              <MathText>{content.learningQuestion}</MathText>
            </p>
          </div>
          <div className="shrink-0 border-t pt-7" style={{ borderColor: toRgba(pres.palette.ink, 0.16) }}>
            <NumberedList items={content.goals} pres={pres} start={1} />
          </div>
        </div>
      )
    case 'course-structure':
      return <StructureItems items={content.items} pres={pres} />
    case 'source-material':
      return <SourceMaterial body={content.body} citation={content.citation} pres={pres} />
    case 'observation':
      return <ObservationPage content={content} imageUrl={imageUrl} pres={pres} />
    case 'explanation':
      return <ExplanationPage content={content} imageUrl={imageUrl} pres={pres} />
    case 'question':
    case 'practice':
    case 'transfer':
      return <PromptResponseLayout prompt={content} response={undefined} imageUrl={imageUrl} pres={pres} />
    case 'answer':
    case 'worked-step':
    case 'feedback':
      return <PromptResponseLayout prompt={asPrompt(prompt)} response={content} imageUrl={imageUrl} pres={pres} />
    case 'recap':
      return <RecapPage content={content} pres={pres} />
  }
}

type PromptContent = Extract<VisiblePageContent, { kind: 'question' | 'practice' | 'transfer' }>
type ResponseContent = Extract<VisiblePageContent, { kind: 'answer' | 'worked-step' | 'feedback' }>

function asPrompt(content: VisiblePageContent | undefined): PromptContent | undefined {
  return content?.kind === 'question' || content?.kind === 'practice' || content?.kind === 'transfer'
    ? content
    : undefined
}

function PromptResponseLayout({ prompt, response, imageUrl, pres }: {
  prompt: PromptContent | undefined
  response: ResponseContent | undefined
  imageUrl: string | undefined
  pres: ScenePresentation
}) {
  if (!prompt) return response ? <ResponseBody response={response} pres={pres} /> : null
  const layout = pagePromptLayout(Boolean(imageUrl), Boolean(response))
  return (
    <div
      data-content-balance={layout.mode}
      className="grid h-full gap-10"
      style={{ gridTemplateColumns: layout.columns }}
    >
      <div className="flex min-h-0 flex-col gap-6">
        {imageUrl ? (
          <div
            data-prompt-image-layout="side-by-side"
            className="grid min-h-0 flex-1 grid-cols-[1.05fr_0.95fr] gap-7"
          >
            <TeachingImage src={imageUrl} alt={prompt.title} />
            <div className="flex min-h-0 flex-col justify-center gap-5">
              <p style={{ fontSize: projectionFontSize('heading', 36), lineHeight: 1.34, fontWeight: 700 }}>
                <MathText>{prompt.prompt}</MathText>
              </p>
              {prompt.materials.length > 0 ? <MaterialList items={prompt.materials} pres={pres} /> : null}
            </div>
          </div>
        ) : (
          <>
            <p style={{ fontSize: projectionFontSize('heading', 42), lineHeight: 1.34, fontWeight: 700 }}>
              <MathText>{prompt.prompt}</MathText>
            </p>
            {prompt.materials.length > 0 ? <MaterialList items={prompt.materials} pres={pres} /> : null}
          </>
        )}
        <p className={`${imageUrl ? 'shrink-0' : 'mt-auto'} border-l-4 pl-5`} style={{ borderColor: pres.palette.accent, ...TYPE_SCALE.body }}>
          <MathText>{prompt.responseInstruction}</MathText>
        </p>
      </div>
      {response ? (
        <div className="min-h-0 border-l pl-10" style={{ borderColor: toRgba(pres.palette.ink, 0.18) }}>
          <ResponseBody response={response} pres={pres} />
        </div>
      ) : (
        <WritingSpace pres={pres} />
      )}
    </div>
  )
}

function ResponseBody({ response, pres }: { response: ResponseContent; pres: ScenePresentation }) {
  if (response.kind === 'worked-step') {
    return (
      <div className={`grid h-full gap-5 ${response.steps.length > 3 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {response.steps.map((item, index) => (
          <div key={`${index}-${item.step}`} className="flex min-h-0 gap-5 border-b pb-4" style={{ borderColor: toRgba(pres.palette.ink, 0.14) }}>
            <span className="shrink-0 font-bold" style={{ color: pres.palette.accent, fontSize: projectionFontSize('diagram', 24) }}>{index + 1}</span>
            <div className="min-w-0">
              <p style={{ ...TYPE_SCALE.body }}><MathText>{item.step}</MathText></p>
              <p className="mt-2" style={{ color: toRgba(pres.palette.ink, 0.76), fontSize: projectionFontSize('body'), lineHeight: 1.45 }}><MathText>{item.reason}</MathText></p>
              <p className="mt-2 font-semibold" style={{ color: pres.palette.accent, fontSize: projectionFontSize('body'), lineHeight: 1.45 }}><MathText>{item.result}</MathText></p>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (response.kind === 'answer') {
    return (
      <div className="flex h-full flex-col gap-7">
        <StatementPanel title="结论" pres={pres} compact><MathText>{response.conclusion}</MathText></StatementPanel>
        <EvidenceList evidence={response.evidence} pres={pres} />
        <StatementPanel title="修正" pres={pres} compact><MathText>{response.correction}</MathText></StatementPanel>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <NumberedList items={response.successCriteria} pres={pres} start={1} />
      <StatementPanel title="核对结论" pres={pres} compact><MathText>{response.conclusion}</MathText></StatementPanel>
      <EvidenceList evidence={response.evidence} pres={pres} compact />
      <StatementPanel title="修正" pres={pres} compact><MathText>{response.revisionAction}</MathText></StatementPanel>
    </div>
  )
}

function StructureItems({ items, pres }: { items: string[]; pres: ScenePresentation }) {
  return (
    <ol className={`grid h-full gap-6 ${items.length > 3 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="flex items-center gap-7 border-b px-3 py-5" style={{ borderColor: toRgba(pres.palette.ink, 0.16) }}>
          <span className="font-bold" style={{ color: pres.palette.accent, fontSize: projectionFontSize('display', 52), lineHeight: 1 }}>{String(index + 1).padStart(2, '0')}</span>
          <p style={{ ...TYPE_SCALE.body }}><MathText>{item}</MathText></p>
        </li>
      ))}
    </ol>
  )
}

function SourceMaterial({ body, citation, pres }: { body: string; citation: string | undefined; pres: ScenePresentation }) {
  const poetic = body.split(/\r?\n/).filter(line => line.trim()).length >= 4
  const twoColumns = !poetic && body.replace(/\s/g, '').length > 320
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={`min-h-0 flex-1 ${poetic ? 'text-center' : 'text-left'}`}
        style={{
          whiteSpace: 'pre-wrap',
          fontSize: projectionFontSize('body'),
          lineHeight: poetic ? 1.8 : 1.65,
          fontWeight: 500,
          ...(twoColumns ? { columnCount: 2, columnGap: '72px', columnRule: `1px solid ${toRgba(pres.palette.ink, 0.14)}` } : {}),
        }}
      >
        <MathText>{body}</MathText>
      </div>
      {citation ? <p className="mt-5 text-right" style={{ color: toRgba(pres.palette.ink, 0.68), fontSize: projectionFontSize('auxiliary'), lineHeight: 1.45 }}>{citation}</p> : null}
    </div>
  )
}

function ObservationPage({ content, imageUrl, pres }: {
  content: Extract<VisiblePageContent, { kind: 'observation' }>
  imageUrl: string | undefined
  pres: ScenePresentation
}) {
  return (
    <div className={`grid h-full gap-10 ${imageUrl ? 'grid-cols-[1.18fr_0.82fr]' : 'grid-cols-[0.9fr_1.1fr]'}`}>
      {imageUrl ? <TeachingImage src={imageUrl} alt={content.materialCaption ?? content.title} /> : (
        <StatementPanel title="观察问题" pres={pres}><MathText>{content.prompt}</MathText></StatementPanel>
      )}
      <div className="flex min-h-0 flex-col gap-7">
        {imageUrl ? <p style={{ fontSize: projectionFontSize('heading', 42), lineHeight: 1.35, fontWeight: 700 }}><MathText>{content.prompt}</MathText></p> : null}
        {!imageUrl && content.materialCaption ? <p style={{ ...TYPE_SCALE.body }}><MathText>{content.materialCaption}</MathText></p> : null}
        <NumberedList items={content.evidenceLabels} pres={pres} start={1} />
      </div>
    </div>
  )
}

function ExplanationPage({ content, imageUrl, pres }: {
  content: Extract<VisiblePageContent, { kind: 'explanation' }>
  imageUrl: string | undefined
  pres: ScenePresentation
}) {
  if (!imageUrl) {
    return (
      <div className="grid h-full grid-cols-[0.94fr_1.06fr] gap-12">
        <StatementPanel title="核心表述" pres={pres}><MathText>{content.coreStatement}</MathText></StatementPanel>
        <div className="flex min-h-0 flex-col gap-7">
          <EvidenceList evidence={content.evidence} pres={pres} />
          <StatementPanel title="适用边界" pres={pres} compact><MathText>{content.boundary}</MathText></StatementPanel>
        </div>
      </div>
    )
  }

  return (
    <div data-explanation-image-layout="side-by-side" className="grid h-full grid-cols-[0.88fr_1.12fr] gap-10">
      <TeachingImage src={imageUrl} alt={content.title} />
      <div className="flex min-h-0 flex-col justify-center gap-5">
        <StatementPanel title="核心表述" pres={pres} compact><MathText>{content.coreStatement}</MathText></StatementPanel>
        <EvidenceList evidence={content.evidence} pres={pres} compact />
        <StatementPanel title="适用边界" pres={pres} compact><MathText>{content.boundary}</MathText></StatementPanel>
      </div>
    </div>
  )
}

function RecapPage({ content, pres }: { content: Extract<VisiblePageContent, { kind: 'recap' }>; pres: ScenePresentation }) {
  return (
    <div className="grid h-full grid-cols-3 gap-8">
      <RecapColumn title="概念" items={content.concepts} pres={pres} />
      <RecapColumn title="证据" items={content.evidence.map(item => item.text)} pres={pres} />
      <RecapColumn title="方法" items={content.methods} pres={pres} />
    </div>
  )
}

function RecapColumn({ title, items, pres }: { title: string; items: string[]; pres: ScenePresentation }) {
  return (
    <section className="border-t-4 px-2 pt-5" style={{ borderColor: pres.palette.accent }}>
      <h2 style={{ fontSize: projectionFontSize('heading', 38), lineHeight: 1.3, fontWeight: 700 }}>{title}</h2>
      <ul className="mt-6 space-y-5">
        {items.map((item, index) => <li key={`${index}-${item}`} className="border-b pb-4" style={{ borderColor: toRgba(pres.palette.ink, 0.14), ...TYPE_SCALE.body }}><MathText>{item}</MathText></li>)}
      </ul>
    </section>
  )
}

function StatementPanel({ title, pres, compact = false, children }: { title: string; pres: ScenePresentation; compact?: boolean; children: ReactNode }) {
  return (
    <section className={`border-l-4 ${compact ? 'py-2 pl-5' : 'flex h-full flex-col justify-center py-6 pl-7'}`} style={{ borderColor: pres.palette.accent }}>
      <h2 className="mb-3 font-semibold" style={{ color: pres.palette.accent, fontSize: projectionFontSize('auxiliary'), lineHeight: 1.4 }}>{title}</h2>
      <p style={{ ...TYPE_SCALE.body }}>{children}</p>
    </section>
  )
}

function EvidenceList({ evidence, pres, compact = false }: {
  evidence: Array<{ text: string }>
  pres: ScenePresentation
  compact?: boolean
}) {
  return (
    <section className="min-h-0">
      <h2 className="mb-3 font-semibold" style={{ color: pres.palette.accent, fontSize: projectionFontSize('auxiliary'), lineHeight: 1.4 }}>依据</h2>
      <ul className={compact ? 'space-y-2' : 'space-y-4'}>
        {evidence.map((item, index) => (
          <li key={`${index}-${item.text}`} className="flex gap-4" style={{ fontSize: projectionFontSize('body'), lineHeight: 1.45, fontWeight: 550 }}>
            <span style={{ color: pres.palette.accent }}>•</span>
            <MathText>{item.text}</MathText>
          </li>
        ))}
      </ul>
    </section>
  )
}

function NumberedList({ items, pres, start }: { items: string[]; pres: ScenePresentation; start: number }) {
  return (
    <ol className="flex min-h-0 flex-col justify-center gap-5">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="flex gap-5 border-b pb-4" style={{ borderColor: toRgba(pres.palette.ink, 0.14), ...TYPE_SCALE.body }}>
          <span className="shrink-0 font-bold" style={{ color: pres.palette.accent }}>{String(index + start).padStart(2, '0')}</span>
          <MathText>{item}</MathText>
        </li>
      ))}
    </ol>
  )
}

function MaterialList({ items, pres }: { items: string[]; pres: ScenePresentation }) {
  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="flex gap-4" style={{ color: toRgba(pres.palette.ink, 0.82), ...TYPE_SCALE.body }}>
          <span style={{ color: pres.palette.accent }}>•</span><MathText>{item}</MathText>
        </li>
      ))}
    </ul>
  )
}

function WritingSpace({ pres }: { pres: ScenePresentation }) {
  return (
    <div className="flex h-full flex-col justify-center gap-14 px-8" aria-label="学生作答空间">
      {[0, 1, 2, 3].map(index => <div key={index} className="h-px w-full" style={{ background: toRgba(pres.palette.ink, 0.18) }} />)}
    </div>
  )
}

function TeachingImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
      <img src={src} alt={alt} className="h-full w-full object-contain" />
    </div>
  )
}
