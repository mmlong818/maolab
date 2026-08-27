'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen,
  BookOpenCheck,
  ChevronLeft,
  ClipboardCheck,
  Pause,
  Play,
  Presentation,
  RotateCcw,
  SkipForward,
  UsersRound,
} from 'lucide-react'
import { courseDisplayTitle, type MainlineCourse } from '@/lib/mainline'
import type { MasteryEvidenceStatus } from '@/lib/mainline/mastery'
import type { RehearsalScenario } from '@/lib/mainline/rehearsal/classmates'
import type { RehearsalEvidence, RehearsalReport } from '@/lib/mainline/rehearsal/types'
import { PreviewStage } from '@/components/mainline/workbench/PreviewStage'
import { RehearsalReportView } from './RehearsalReportView'
import {
  rehearsalMasteryEvidenceText,
  statusKpIds,
  type RehearsalMasteryCoverage,
} from './mastery-evidence'

type Mode = 'observe' | 'teach'
type Status = 'idle' | 'running' | 'paused' | 'done'
type View = 'room' | 'report'

interface RehearsalRoomProps {
  course: MainlineCourse
  report: RehearsalReport
  scenario: RehearsalScenario
  masteryCoverage: RehearsalMasteryCoverage
  misconceptionsByKp: Readonly<Record<string, readonly string[]>>
}

const reactionLabels = {
  error: '误概念复现',
  question: '没跟上',
  distracted: '掉队',
  'ai-native-challenge': 'AI 质疑',
} as const

export function RehearsalRoom({ course, report, scenario, masteryCoverage, misconceptionsByKp }: RehearsalRoomProps) {
  const [mode, setMode] = useState<Mode>('observe')
  const [status, setStatus] = useState<Status>('idle')
  const [view, setView] = useState<View>('room')
  const [sceneIndex, setSceneIndex] = useState(0)
  const hasMastery = masteryCoverage.used > 0
  const seededKps = useMemo(() => statusKpIds(masteryCoverage, 'seeded-demo'), [masteryCoverage])
  const provisionalKps = useMemo(() => statusKpIds(masteryCoverage, 'provisional-self-assessment'), [masteryCoverage])
  const legacyKps = useMemo(() => statusKpIds(masteryCoverage, 'legacy-unattributed'), [masteryCoverage])
  const hasSeededMastery = seededKps.size > 0
  const scene = course.scenes[sceneIndex] ?? course.scenes[0]
  const sceneReactions = useMemo(
    () => scene ? report.reactions.filter(reaction => reaction.sceneId === scene.id) : [],
    [report.reactions, scene],
  )

  useEffect(() => {
    if (mode !== 'observe' || status !== 'running') return
    const timer = window.setTimeout(() => {
      if (sceneIndex >= course.scenes.length - 1) {
        setStatus('done')
        if (hasMastery) setView('report')
      } else {
        setSceneIndex(current => current + 1)
      }
    }, 5200)
    return () => window.clearTimeout(timer)
  }, [course.scenes.length, hasMastery, mode, sceneIndex, status])

  function reset(nextMode = mode) {
    setMode(nextMode)
    setSceneIndex(0)
    setStatus('idle')
    setView('room')
  }

  function advance() {
    if (sceneIndex >= course.scenes.length - 1) {
      setStatus('done')
      if (hasMastery) setView('report')
      return
    }
    setSceneIndex(current => current + 1)
    setStatus('paused')
  }

  if (!scene) return null

  return (
    <main className="min-h-screen bg-[#f6f6f2] text-[#181a1f]">
      <header className="border-b border-[#deded8] bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3 md:px-6">
          <Link href={'/mainline/' + course.id + '/prep'} className="flex items-center gap-1.5 text-[13px] font-semibold text-[#64676f] no-underline">
            <ChevronLeft size={16} aria-hidden />
            备课
          </Link>
          <div className="min-w-[180px] flex-1">
            <p className="text-[15px] font-semibold leading-[1.4]">{courseDisplayTitle(course)}</p>
            <p className="text-[12px] text-[#858890]">{scenario === 'teacher' ? '课前排练' : '自学陪练'} · {course.scenes.length} 幕</p>
          </div>
          <div className="flex rounded-[7px] border border-[#d9d9d3] bg-[#f2f2ee] p-1" aria-label="使用场景">
            <ScenarioLink active={scenario === 'teacher'} href={'/mainline/' + course.id + '/rehearse'} icon={<Presentation size={14} />} label="教师排练" />
            <ScenarioLink active={scenario === 'self-study'} href={'/mainline/' + course.id + '/rehearse?scenario=self-study'} icon={<BookOpen size={14} />} label="学生自学" />
          </div>
          <div className="flex rounded-[7px] border border-[#d9d9d3] bg-[#f2f2ee] p-1" aria-label="排练模式">
            <ModeButton active={mode === 'observe'} onClick={() => reset('observe')} icon={<Play size={14} />} label={scenario === 'teacher' ? '观察 AI' : '自动播放'} />
            <ModeButton active={mode === 'teach'} onClick={() => reset('teach')} icon={<UsersRound size={14} />} label={scenario === 'teacher' ? '教师试讲' : '自主推进'} />
          </div>
          {hasMastery && (
            <button type="button" onClick={() => setView(view === 'room' ? 'report' : 'room')} className="flex h-9 items-center gap-2 rounded-[6px] border border-[#cfcfc8] bg-white px-3 text-[13px] font-semibold text-[#34373e]">
              {view === 'room' ? <ClipboardCheck size={16} /> : <BookOpenCheck size={16} />}
              {view === 'room' ? '排练报告' : '返回排练'}
            </button>
          )}
        </div>
      </header>

      {view === 'report' && hasMastery ? (
        <RehearsalReportView
          course={course}
          report={report}
          masteryCoverage={masteryCoverage}
          misconceptionsByKp={misconceptionsByKp}
          onRerun={() => reset()}
        />
      ) : (
        <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-6">
          <div className="mb-4 flex flex-wrap items-center gap-3 border-b border-[#d9d9d3] pb-4">
            <div className="min-w-[180px] flex-1">
              <div className="mb-1 flex justify-between text-[12px] font-semibold text-[#6d7078]">
                <span>第 {sceneIndex + 1} 幕 · {scene.sceneType}</span>
                <span>{Math.round(((sceneIndex + 1) / course.scenes.length) * 100)}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-[3px] bg-[#deded8]">
                <div className="h-full bg-[#2c6a56] transition-all" style={{ width: String(((sceneIndex + 1) / course.scenes.length) * 100) + '%' }} />
              </div>
            </div>
            <RehearsalControls mode={mode} status={status} scenario={scenario} atLast={sceneIndex >= course.scenes.length - 1} onStart={() => setStatus('running')} onPause={() => setStatus('paused')} onAdvance={advance} onReset={() => reset()} />
          </div>

          {hasSeededMastery && (
            <section role="status" className="mb-5 border-l-2 border-[#b8792c] bg-[#fff8ea] px-4 py-3 text-[#5e461f]">
              <p className="text-[13px] font-semibold">演示种子（教材误区推导，非真实作答）</p>
              <p className="mt-1 text-[12px] leading-5 text-[#74603a]">
                本轮有 {seededKps.size} 个知识点使用演示掌握度，只用于检查排练流程，不代表真实学生或班级诊断。
              </p>
            </section>
          )}

          {provisionalKps.size > 0 && (
            <section role="status" className="mb-5 border-l-2 border-[#5c7897] bg-[#f0f6fb] px-4 py-3 text-[#294761]">
              <p className="text-[13px] font-semibold">暂定自评学情</p>
              <p className="mt-1 text-[12px] leading-5 text-[#50677b]">
                本轮有 {provisionalKps.size} 个知识点来自学生看过反馈后的自评，只用于低风险排练线索，尚未经过教师或自动评分验证。
              </p>
            </section>
          )}

          {legacyKps.size > 0 && (
            <section role="status" className="mb-5 border-l-2 border-[#8a8d94] bg-[#f5f5f3] px-4 py-3 text-[#4e5056]">
              <p className="text-[13px] font-semibold">历史学情来源未确认</p>
              <p className="mt-1 text-[12px] leading-5 text-[#696b71]">
                {legacyKps.size} 个历史分数缺少与当前分数对应的作答证据，已从本次排练推断中排除。
              </p>
            </section>
          )}

          {!hasMastery && status === 'done' && (
            <section role="status" aria-live="polite" className="mb-5 border-y border-[#cfd6d0] bg-[#eef3ef] px-4 py-4">
              <h2 className="text-[15px] font-semibold text-[#234f40]">本轮演绎已完成</h2>
              <p className="mt-1 max-w-3xl text-[13px] leading-6 text-[#53605a]">
                当前还没有学生作答形成的学情记录，因此本次不生成诊断报告。积累作答记录后再次排练，才会展示可溯源的弱点与回改建议。
              </p>
            </section>
          )}

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <section className="min-w-0">
              <div className="aspect-[16/9] w-full overflow-hidden rounded-[6px] border border-[#292b31] bg-[#101115] shadow-[0_20px_55px_-35px_rgba(13,15,20,0.7)]">
                <PreviewStage course={course} scene={scene} />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-[#747780]">
                <span>幕 ID：{scene.id}</span>
                <span>知识点：{scene.kpId ?? '课级幕'}</span>
                <span>模式：{mode === 'observe' ? (scenario === 'teacher' ? 'AI 自动走完整课' : '自动播放整课') : (scenario === 'teacher' ? '教师掌控节奏' : '自主控制节奏')}</span>
              </div>
            </section>

            <aside className="border-t border-[#d6d6d0] pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
              <div className="mb-4">
                <p className="text-[12px] font-semibold text-[#747780]">本次学生</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {report.students.map(student => {
                    const cast = course.castProfiles.find(profile => profile.id === student.id)
                    const avatar = student.avatarSrc ?? cast?.assetRefs?.[0]?.src
                    return (
                      <div key={student.id} className="flex items-center gap-2 rounded-[6px] border border-[#d9d9d3] bg-white px-2 py-1.5">
                        {avatar ? <img src={avatar} alt="" className="h-7 w-7 rounded-[4px] object-cover" /> : <span className="flex h-7 w-7 items-center justify-center rounded-[4px] bg-[#ecece7] text-[12px] font-bold">{student.name.slice(0, 1)}</span>}
                        <span className="text-[12px] font-semibold">{student.name}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="flex items-baseline justify-between">
                <h2 className="text-[15px] font-semibold">课堂反应</h2>
                <span className="text-[12px] text-[#777a82]">{hasMastery ? String(sceneReactions.length) + ' 条证据' : '教材误区驱动'}</span>
              </div>
              <div className="mt-3 space-y-3">
                {sceneReactions.map((reaction, index) => (
                  <article key={reaction.studentId + '-' + String(index)} className="rounded-[6px] border border-[#d7d7d1] bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-[13px]">{reaction.studentName}</strong>
                      <span className="rounded-[4px] bg-[#f1e8dc] px-2 py-0.5 text-[11px] font-semibold text-[#7a4d1d]">{reactionLabels[reaction.kind]}</span>
                    </div>
                    <p className="mt-2 text-[14px] leading-6 text-[#292c33]">{reaction.utterance}</p>
                    <EvidenceLine evidence={reaction.evidence} status={reaction.evidence.from === 'mastery' ? masteryCoverage.statusByKp[reaction.evidence.kpId] : undefined} />
                  </article>
                ))}
                {sceneReactions.length === 0 && (
                  <div className="border-l-2 border-[#b8bab3] py-1 pl-3 text-[13px] leading-6 text-[#686b73]">
                    {hasMastery
                      ? '本幕没有可溯源反应。系统不会用随机学生闲聊补空白。'
                      : '当前没有学生作答学情；演绎只采用教材误区依据，不补造学生表现。'}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      )}
    </main>
  )
}

function ScenarioLink({ active, href, icon, label }: { active: boolean; href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={'flex h-7 items-center gap-1.5 rounded-[5px] px-3 text-[12px] font-semibold no-underline ' + (active ? 'bg-white text-[#1d2026] shadow-sm' : 'text-[#72757d]')}>
      {icon}{label}
    </Link>
  )
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className={'flex h-7 items-center gap-1.5 rounded-[5px] px-3 text-[12px] font-semibold ' + (active ? 'bg-white text-[#1d2026] shadow-sm' : 'text-[#72757d]')}>
      {icon}{label}
    </button>
  )
}

function RehearsalControls({ mode, status, scenario, atLast, onStart, onPause, onAdvance, onReset }: {
  mode: Mode
  status: Status
  scenario: RehearsalScenario
  atLast: boolean
  onStart: () => void
  onPause: () => void
  onAdvance: () => void
  onReset: () => void
}) {
  const active = status === 'running'
  return (
    <div className="flex gap-2">
      <button type="button" title="重新开始" aria-label="重新开始" onClick={onReset} className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-[#cfcfc8] bg-white text-[#454850]">
        <RotateCcw size={16} />
      </button>
      {status !== 'done' && (mode === 'observe' ? (
        <button type="button" onClick={active ? onPause : onStart} className="flex h-9 items-center gap-2 rounded-[6px] bg-[#1c1f24] px-4 text-[13px] font-semibold text-white">
          {active ? <Pause size={16} /> : <Play size={16} />}
          {active ? '暂停' : status === 'idle' ? '开始排练' : '继续'}
        </button>
      ) : (
        <>
          {status === 'idle' && <button type="button" onClick={onStart} className="flex h-9 items-center gap-2 rounded-[6px] bg-[#1c1f24] px-4 text-[13px] font-semibold text-white"><Play size={16} />{scenario === 'teacher' ? '开始试讲' : '开始自学'}</button>}
          {status !== 'idle' && <button type="button" onClick={onAdvance} className="flex h-9 items-center gap-2 rounded-[6px] bg-[#1c1f24] px-4 text-[13px] font-semibold text-white"><SkipForward size={16} />{atLast ? '完成排练' : '下一幕'}</button>}
        </>
      ))}
    </div>
  )
}

export function EvidenceLine({ evidence, status }: { evidence: RehearsalEvidence; status?: MasteryEvidenceStatus | undefined }) {
  const text = evidence.from === 'misconception'
    ? '教材误区 · ' + evidence.text
    : rehearsalMasteryEvidenceText(evidence.score, status)
  return <p className="mt-2 border-t border-[#ecece7] pt-2 text-[11px] leading-5 text-[#747780]">依据：{text}（{evidence.kpId}）</p>
}
