'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react'
import { courseDisplayTitle, type MainlineCourse } from '@/lib/mainline'
import { repairTargetForWeakness } from '@/lib/mainline/rehearsal/repair-target'
import type { RehearsalEvidence, RehearsalReport, RehearsalWeaknessKind } from '@/lib/mainline/rehearsal/types'
import { rehearsalMasteryEvidenceText, type RehearsalMasteryCoverage } from './mastery-evidence'

interface RehearsalReportViewProps {
  course: MainlineCourse
  report: RehearsalReport
  masteryCoverage: RehearsalMasteryCoverage
  misconceptionsByKp: Readonly<Record<string, readonly string[]>>
  onRerun: () => void
}

const weaknessLabels: Record<RehearsalWeaknessKind, string> = {
  'pace-collapse': '节奏可能过快',
  'unanswered-question': '误区未处理',
  'misconception-wording-drift': '误区措辞待核对',
  'fragile-analogy': '比喻不稳',
}

export function RehearsalReportView({ course, report, masteryCoverage, misconceptionsByKp, onRerun }: RehearsalReportViewProps) {
  const statuses = Object.entries(masteryCoverage.statusByKp)
  const seededKps = new Set(statuses.flatMap(([kpId, status]) => status === 'seeded-demo' ? [kpId] : []))
  const provisionalKps = new Set(statuses.flatMap(([kpId, status]) => status === 'provisional-self-assessment' ? [kpId] : []))
  const verifiedKps = new Set(statuses.flatMap(([kpId, status]) => status === 'verified' ? [kpId] : []))
  const legacyKps = new Set(statuses.flatMap(([kpId, status]) => status === 'legacy-unattributed' ? [kpId] : []))
  const verifiedCoverage = masteryCoverage.total === 0 ? 0 : Math.round((verifiedKps.size / masteryCoverage.total) * 100)

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-7 md:px-6 md:py-9">
      <div className="flex flex-wrap items-end gap-4 border-b border-[#d8d8d2] pb-5">
        <div className="min-w-[220px] flex-1">
          <p className="text-[12px] font-semibold text-[#6f727a]">课前排练报告</p>
          <h1 className="mt-1 text-[24px] font-semibold">{courseDisplayTitle(course)}</h1>
          <p className="mt-2 text-[13px] leading-6 text-[#696c74]">
            只展示能追溯到教材误区或学情记录的问题，不用随机模拟填充。
          </p>
        </div>
        <button type="button" onClick={onRerun} className="flex h-9 items-center gap-2 rounded-[6px] border border-[#cfcfc8] bg-white px-3 text-[13px] font-semibold">
          <RotateCcw size={15} />
          重新排练
        </button>
      </div>

      {seededKps.size > 0 && (
        <section role="status" className="border-b border-[#e4d5b7] bg-[#fff8ea] px-4 py-4 text-[#5e461f]">
          <p className="text-[13px] font-semibold">演示种子（教材误区推导，非真实作答）</p>
          <p className="mt-1 text-[12px] leading-5 text-[#74603a]">
            {seededKps.size} / {masteryCoverage.total} 个知识点的掌握度由教材误区数量推导，只用于检查排练流程；不得作为学生评价、班级诊断或教学成效依据。
          </p>
        </section>
      )}

      {provisionalKps.size > 0 && (
        <section role="status" className="border-b border-[#c9d9e7] bg-[#f0f6fb] px-4 py-4 text-[#294761]">
          <p className="text-[13px] font-semibold">暂定自评学情</p>
          <p className="mt-1 text-[12px] leading-5 text-[#50677b]">
            {provisionalKps.size} / {masteryCoverage.total} 个知识点来自学生反馈后自评，可用于低风险加练线索，不得当作正式成绩或已验证诊断。
          </p>
        </section>
      )}

      {legacyKps.size > 0 && (
        <section role="status" className="border-b border-[#d8d8d2] bg-[#f5f5f3] px-4 py-4 text-[#4e5056]">
          <p className="text-[13px] font-semibold">历史学情来源未确认</p>
          <p className="mt-1 text-[12px] leading-5 text-[#696b71]">
            {legacyKps.size} 个历史分数缺少对应作答证据，已从反应生成和覆盖率中排除。
          </p>
        </section>
      )}

      <section className="grid border-b border-[#d8d8d2] sm:grid-cols-4">
        <Metric label="证据反应" value={String(report.reactions.length)} note="课堂中有来源的反应" />
        <Metric label="待修弱点" value={String(report.weaknesses.length)} note="引擎判定的课程问题" />
        <Metric label="已验证学情" value={String(verifiedCoverage) + '%'} note={String(verifiedKps.size) + ' / ' + String(masteryCoverage.total) + ' 个知识点有客观验证'} />
        <Metric label="暂定自评" value={String(provisionalKps.size)} note="只作低风险排练线索" />
      </section>

      <section className="py-7">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold text-[#73767e]">优先处理</p>
            <h2 className="mt-1 text-[18px] font-semibold">按幕回改</h2>
          </div>
          <span className="text-[12px] text-[#7b7e86]">{report.scenesToFix.length} 幕</span>
        </div>

        {report.weaknesses.length === 0 ? (
          <div className="mt-4 flex gap-3 border-l-2 border-[#3f7b65] bg-white px-4 py-4">
            <CheckCircle2 size={19} className="mt-0.5 flex-none text-[#2f7259]" />
            <div>
              <p className="text-[14px] font-semibold">本次没有发现可溯源弱点</p>
              <p className="mt-1 text-[13px] leading-6 text-[#6d7078]">
                这不等于课程完美。若学情覆盖不足，报告会主动少报，而不会编造问题。
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4 divide-y divide-[#deded8] border-y border-[#deded8] bg-white">
            {report.weaknesses.map((weakness, index) => {
              const scene = course.scenes.find(item => item.id === weakness.sceneId)
              const repair = repairTargetForWeakness(course, weakness, misconceptionsByKp)
              const query = new URLSearchParams({ scene: repair.sceneId })
              if (repair.misconception) query.set('misconception', repair.misconception)
              return (
                <article key={weakness.sceneId + '-' + weakness.kind + '-' + String(index)} className="grid gap-4 px-4 py-4 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-start">
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#f8e8e3] px-2 py-1 text-[11px] font-semibold text-[#8b3427]">
                      <AlertTriangle size={12} />
                      {weaknessLabels[weakness.kind]}
                    </span>
                    <p className="mt-2 text-[12px] text-[#777a82]">{scene?.sceneType ?? weakness.sceneId}</p>
                  </div>
                  <div>
                    <p className="text-[14px] leading-6 text-[#2d3037]">{weakness.detail}</p>
                    <Evidence evidence={weakness.evidence} status={weakness.evidence.from === 'mastery' ? masteryCoverage.statusByKp[weakness.evidence.kpId] : undefined} />
                  </div>
                  <Link
                    href={'/mainline/' + course.id + '/prep?' + query.toString()}
                    className="flex h-9 items-center justify-center gap-2 rounded-[6px] bg-[#1c1f24] px-3 text-[12px] font-semibold text-white no-underline"
                  >
                    {!repair.misconception ? '回到此幕' : weakness.kind === 'misconception-wording-drift' ? '核对辨析页' : '修正误区处理'}
                    <ArrowRight size={14} />
                  </Link>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="border-t border-[#d8d8d2] py-7">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold text-[#73767e]">完整留痕</p>
            <h2 className="mt-1 text-[18px] font-semibold">课堂反应证据</h2>
          </div>
          <span className="text-[12px] text-[#7b7e86]">{report.reactions.length} 条</span>
        </div>
        {report.reactions.length === 0 ? (
          <p className="mt-4 border-l-2 border-[#b9bbb4] pl-3 text-[13px] leading-6 text-[#696c74]">
            当前学情或教材误区不足以支持模拟反应，系统未生成虚构学生对话。
          </p>
        ) : (
          <div className="mt-4 divide-y divide-[#deded8] border-y border-[#deded8] bg-white">
            {report.reactions.map((reaction, index) => {
              const scene = course.scenes.find(item => item.id === reaction.sceneId)
              return (
                <article key={reaction.sceneId + '-' + reaction.studentId + '-' + String(index)} className="grid gap-2 px-4 py-3 md:grid-cols-[150px_minmax(0,1fr)]">
                  <div>
                    <p className="text-[13px] font-semibold">{reaction.studentName}</p>
                    <p className="mt-1 text-[11px] text-[#7c7f87]">{scene?.sceneType ?? reaction.sceneId}</p>
                  </div>
                  <div>
                    <p className="text-[13px] leading-6 text-[#33363d]">{reaction.utterance}</p>
                    <Evidence evidence={reaction.evidence} status={reaction.evidence.from === 'mastery' ? masteryCoverage.statusByKp[reaction.evidence.kpId] : undefined} />
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="border-[#d8d8d2] py-5 sm:border-r sm:px-5 sm:first:pl-0 sm:last:border-r-0">
      <p className="text-[12px] font-semibold text-[#767981]">{label}</p>
      <p className="mt-1 text-[26px] font-semibold">{value}</p>
      <p className="mt-1 text-[11px] leading-5 text-[#81848b]">{note}</p>
    </div>
  )
}

function Evidence({ evidence, status }: { evidence: RehearsalEvidence; status?: RehearsalMasteryCoverage['statusByKp'][string] | undefined }) {
  const value = evidence.from === 'misconception'
    ? '教材误区 · ' + evidence.text
    : rehearsalMasteryEvidenceText(evidence.score, status)
  return <p className="mt-2 text-[11px] leading-5 text-[#777a82]">依据：{value}（{evidence.kpId}）</p>
}
