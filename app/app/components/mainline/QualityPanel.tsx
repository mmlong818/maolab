'use client'

import { useState } from 'react'
import { CheckCircle2, CircleAlert, CircleX, LocateFixed, RefreshCw, Sparkles } from 'lucide-react'
import type { QualityIssue, QualitySummary } from '@/lib/mainline'
import {
  EXAM_PREP_OPENING_PROGRESSION_ISSUE_MESSAGE,
  KP_GOAL_TRACE_ISSUE_MESSAGE,
  MISSING_PRACTICE_ISSUE_MESSAGE,
  OPENING_PROGRESSION_ISSUE_MESSAGE,
  PRACTICE_REGEN_ISSUE_MESSAGES,
  RECAP_REREAD_ISSUE_MESSAGE,
  REVIEW_OPENING_PROGRESSION_ISSUE_MESSAGE,
  SOURCE_LOCATION_ISSUE_MESSAGE,
  SOURCE_PLACEHOLDER_ISSUE_PREFIX,
  STUDENT_ACTION_EVIDENCE_ISSUE_MESSAGE,
  WORKED_EXAMPLE_SELF_EXPLANATION_ISSUE_MESSAGE,
} from '../../lib/mainline/quality-gates.js'

const STALE_RUNTIME_CONTRACT_ISSUE_MESSAGE = '课堂交互描述承诺了当前页面未实现的能力。'

interface QualityPanelProps {
  summary: QualitySummary
  issues: QualityIssue[]
  canRefreshCast?: boolean
  castRefreshBusy?: boolean
  onRefreshCast?: () => void
  canRefreshRuntimeContracts?: boolean
  runtimeContractRefreshBusy?: boolean
  onRefreshRuntimeContracts?: () => void
  canRefreshSourceGrounding?: boolean
  sourceGroundingRefreshBusy?: boolean
  onRefreshSourceGrounding?: () => void
  canRefreshKpGoals?: boolean
  kpGoalRefreshBusy?: boolean
  onRefreshKpGoals?: () => void
  canRefreshMisconceptionClaims?: boolean
  misconceptionRefreshBusy?: boolean
  onRefreshMisconceptionClaims?: () => void
  learningActivityRefreshCount?: number
  learningActivityRefreshBusy?: boolean
  onRefreshLearningActivities?: () => void
  practiceRefreshCount?: number
  practiceRefreshBusy?: boolean
  onRefreshProblemPractices?: () => void
  onSelectScene?: (sceneId: string) => void
}

const SEVERITY_ORDER: Record<QualityIssue['severity'], number> = {
  blocking: 0,
  warning: 1,
  info: 2,
}

export function qualityPanelPreviewIssues(issues: readonly QualityIssue[]): {
  prioritized: QualityIssue[]
  preview: QualityIssue[]
  hiddenCount: number
} {
  const prioritized = [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  const blocking = prioritized.filter(issue => issue.severity === 'blocking')
  const advisory = prioritized.filter(issue => issue.severity !== 'blocking')
  const preview = blocking.length > 0
    ? [...blocking, ...advisory.slice(0, 5)]
    : advisory.slice(0, 5)
  return { prioritized, preview, hiddenCount: prioritized.length - preview.length }
}

export function qualityPanelCanRefreshCast(issues: readonly QualityIssue[]): boolean {
  return issues.some(issue => issue.gate === 'cast-voice-grade' && issue.severity === 'blocking')
}

export function qualityPanelCanRefreshRuntimeContracts(issues: readonly QualityIssue[]): boolean {
  return issues.some(issue => (
    issue.gate === 'technique'
    && issue.severity === 'warning'
    && issue.targetType === 'scene'
    && issue.message === STALE_RUNTIME_CONTRACT_ISSUE_MESSAGE
  ))
}

export function qualityPanelCanRefreshSourceGrounding(issues: readonly QualityIssue[]): boolean {
  return issues.some(issue => (
    issue.gate === 'pedagogy'
    && issue.severity === 'warning'
    && issue.targetType === 'course'
    && (issue.message === SOURCE_LOCATION_ISSUE_MESSAGE
      || issue.message.startsWith(SOURCE_PLACEHOLDER_ISSUE_PREFIX))
  ))
}

export function qualityPanelCanRefreshKpGoals(issues: readonly QualityIssue[]): boolean {
  return issues.some(issue => (
    issue.gate === 'pedagogy'
    && issue.severity === 'warning'
    && issue.targetType === 'course'
    && issue.message === KP_GOAL_TRACE_ISSUE_MESSAGE
  ))
}

export function qualityPanelCanRefreshMisconceptionClaims(issues: readonly QualityIssue[]): boolean {
  return issues.some(issue => (
    issue.gate === 'pedagogy'
    && issue.severity === 'blocking'
    && issue.targetType === 'scene'
    && issue.message.startsWith('AI 找茬幕')
    && issue.message.includes('重合度过低')
  ))
}

export function qualityPanelMisconceptionReviewTarget(issues: readonly QualityIssue[]): string | undefined {
  return issues.find(issue => (
    issue.gate === 'pedagogy'
    && issue.severity === 'blocking'
    && issue.targetType === 'scene'
    && issue.message === '辨析幕缺少误区溯源(misconceptionSource)。'
  ))?.targetId
}

export function qualityPanelProblemPracticeTargets(issues: readonly QualityIssue[]): string[] {
  return [...new Set(issues.filter(issue => (
    issue.gate === 'pedagogy'
    && issue.severity === 'blocking'
    && ((issue.targetType === 'scene' && PRACTICE_REGEN_ISSUE_MESSAGES.has(issue.message))
      || (issue.targetType === 'fragment' && issue.message === MISSING_PRACTICE_ISSUE_MESSAGE))
  )).map(issue => issue.targetId))]
}

const LEARNING_ACTIVITY_ISSUE_MESSAGES = new Set([
  EXAM_PREP_OPENING_PROGRESSION_ISSUE_MESSAGE,
  OPENING_PROGRESSION_ISSUE_MESSAGE,
  RECAP_REREAD_ISSUE_MESSAGE,
  REVIEW_OPENING_PROGRESSION_ISSUE_MESSAGE,
  STUDENT_ACTION_EVIDENCE_ISSUE_MESSAGE,
  WORKED_EXAMPLE_SELF_EXPLANATION_ISSUE_MESSAGE,
])

export function qualityPanelLearningActivityTargets(issues: readonly QualityIssue[]): string[] {
  return [...new Set(issues.filter(issue => (
    issue.gate === 'pedagogy'
    && issue.severity === 'warning'
    && issue.targetType === 'scene'
    && LEARNING_ACTIVITY_ISSUE_MESSAGES.has(issue.message)
  )).map(issue => issue.targetId))]
}

export function qualityIssueCanNavigate(issue: QualityIssue): boolean {
  return issue.targetType === 'scene'
}

export function QualityPanel({
  summary,
  issues,
  canRefreshCast = false,
  castRefreshBusy = false,
  onRefreshCast,
  canRefreshRuntimeContracts = false,
  runtimeContractRefreshBusy = false,
  onRefreshRuntimeContracts,
  canRefreshSourceGrounding = false,
  sourceGroundingRefreshBusy = false,
  onRefreshSourceGrounding,
  canRefreshKpGoals = false,
  kpGoalRefreshBusy = false,
  onRefreshKpGoals,
  canRefreshMisconceptionClaims = false,
  misconceptionRefreshBusy = false,
  onRefreshMisconceptionClaims,
  learningActivityRefreshCount = 0,
  learningActivityRefreshBusy = false,
  onRefreshLearningActivities,
  practiceRefreshCount,
  practiceRefreshBusy = false,
  onRefreshProblemPractices,
  onSelectScene,
}: QualityPanelProps) {
  const [showAll, setShowAll] = useState(false)
  const issueGroups = qualityPanelPreviewIssues(issues)
  const visibleIssues = showAll ? issueGroups.prioritized : issueGroups.preview
  const misconceptionReviewTarget = qualityPanelMisconceptionReviewTarget(issues)
  const problemPracticeTargets = qualityPanelProblemPracticeTargets(issues)
  const problemPracticeTotal = practiceRefreshCount ?? problemPracticeTargets.length

  return (
    <aside className="border-t border-[#d6c8ae]/45 bg-[#f7f0e4] px-6 py-5 text-[#2d2417]">
      {/* v5 M1 WP2 首次接线发现:lg: 断点按浏览器视口宽度触发,与组件所在容器的实际宽度
          无关——嵌进 340px 备课工作台右栏时仍会触发两列布局,把内容挤没。改成始终单列堆叠,
          在原有全幅用法(未来若有)下退化为metrics 行 + issue 列表纵向排布,不算破坏对外 props。 */}
      <div className="mx-auto grid max-w-[1500px] gap-4">
        <div>
          <div className="flex items-center gap-2 text-[14px] font-semibold tracking-[0.08em] text-[#7a5630]">
            {summary.status === 'blocked' ? <CircleX size={18} /> : summary.warning > 0 ? <CircleAlert size={18} /> : <CheckCircle2 size={18} />}
            质量闸门
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <Metric label="阻断" value={summary.blocking} tone="bad" />
            <Metric label="警告" value={summary.warning} tone="warn" />
            <Metric label="信息" value={summary.info} tone="ok" />
          </div>
        </div>
        <div className="grid gap-2">
          {canRefreshCast && onRefreshCast && (
            <div className="rounded-[8px] border border-[#b9c9bd] bg-[#f4faf5] px-4 py-3">
              <div className="text-[14px] font-semibold text-[#31593c]">角色与本课不匹配</div>
              <div className="mt-1 text-[13px] leading-[1.55] text-[#536b59]">
                按本课学段和学科重建老师、同学与声线；讲稿、板书、配图和教师修订保持不变。
              </div>
              <button
                type="button"
                onClick={onRefreshCast}
                disabled={castRefreshBusy}
                className="mt-3 inline-flex items-center gap-2 rounded-[8px] border border-[#7d9c84] bg-[#e8f3ea] px-3 py-2 text-[13px] font-semibold text-[#31593c] hover:bg-[#dcecdf] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#52765a] disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw size={15} aria-hidden="true" className={castRefreshBusy ? 'animate-spin' : undefined} />
                {castRefreshBusy ? '正在刷新角色' : '刷新课程角色'}
              </button>
            </div>
          )}
          {canRefreshRuntimeContracts && onRefreshRuntimeContracts && (
            <div className="rounded-[8px] border border-[#c7b98f] bg-[#fff9e8] px-4 py-3">
              <div className="text-[14px] font-semibold text-[#76542f]">课堂交互说明已过时</div>
              <div className="mt-1 text-[13px] leading-[1.55] text-[#6b5a43]">
                同步为当前页面真实支持的操作；板书、讲稿、任务、配图和教师修订保持不变。
              </div>
              <button
                type="button"
                onClick={onRefreshRuntimeContracts}
                disabled={runtimeContractRefreshBusy}
                className="mt-3 inline-flex items-center gap-2 rounded-[8px] border border-[#b49b69] bg-[#f7ebca] px-3 py-2 text-[13px] font-semibold text-[#76542f] hover:bg-[#efdfb5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a6a3f] disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw size={15} aria-hidden="true" className={runtimeContractRefreshBusy ? 'animate-spin' : undefined} />
                {runtimeContractRefreshBusy ? '正在同步交互' : '同步课堂交互'}
              </button>
            </div>
          )}
          {canRefreshSourceGrounding && onRefreshSourceGrounding && (
            <div className="rounded-[8px] border border-[#b9c9bd] bg-[#f4faf5] px-4 py-3">
              <div className="text-[14px] font-semibold text-[#31593c]">教材依据只有名称或占位文字</div>
              <div className="mt-1 text-[13px] leading-[1.55] text-[#536b59]">
                从知识点索引回填可核查的教材节点，并移除会被误当原文的占位摘录；讲稿、板书、题目、配图和教师修订保持不变。
              </div>
              <button
                type="button"
                onClick={onRefreshSourceGrounding}
                disabled={sourceGroundingRefreshBusy}
                className="mt-3 inline-flex items-center gap-2 rounded-[8px] border border-[#7d9c84] bg-[#e8f3ea] px-3 py-2 text-[13px] font-semibold text-[#31593c] hover:bg-[#dcecdf] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#52765a] disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw size={15} aria-hidden="true" className={sourceGroundingRefreshBusy ? 'animate-spin' : undefined} />
                {sourceGroundingRefreshBusy ? '正在刷新依据' : '刷新教材依据'}
              </button>
            </div>
          )}
          {canRefreshKpGoals && onRefreshKpGoals && (
            <div className="rounded-[8px] border border-[#b8bfd0] bg-[#f5f7fb] px-4 py-3">
              <div className="text-[14px] font-semibold text-[#3f4c68]">学习目标还停留在整课层级</div>
              <div className="mt-1 text-[13px] leading-[1.55] text-[#5c6578]">
                按当前教材索引为每个知识点建立可检核目标，并重新绑定对应学习片段；原总目标、页面内容和教师修订保持不变。重建后会继续检查每页练习是否真正覆盖目标。
              </div>
              <button
                type="button"
                onClick={onRefreshKpGoals}
                disabled={kpGoalRefreshBusy}
                className="mt-3 inline-flex items-center gap-2 rounded-[8px] border border-[#8994ad] bg-[#e9edf6] px-3 py-2 text-[13px] font-semibold text-[#3f4c68] hover:bg-[#dfe5f1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#626f8c] disabled:cursor-wait disabled:opacity-60"
              >
                <RefreshCw size={15} aria-hidden="true" className={kpGoalRefreshBusy ? 'animate-spin' : undefined} />
                {kpGoalRefreshBusy ? '正在重建目标' : '重建知识点目标'}
              </button>
            </div>
          )}
          {(canRefreshMisconceptionClaims || misconceptionReviewTarget) && (
            <div className="rounded-[8px] border border-[#c7b98f] bg-[#fff9e8] px-4 py-3">
              <div className="text-[14px] font-semibold text-[#76542f]">教材误区与课堂说法没有对齐</div>
              <div className="mt-1 text-[13px] leading-[1.55] text-[#6b5a43]">
                已有教材依据的 AI 找茬可安全校准；没有依据的辨析页必须由教师逐页选择，系统不会猜测。
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {canRefreshMisconceptionClaims && onRefreshMisconceptionClaims && (
                  <button
                    type="button"
                    onClick={onRefreshMisconceptionClaims}
                    disabled={misconceptionRefreshBusy}
                    className="inline-flex items-center gap-2 rounded-[8px] border border-[#b49b69] bg-[#f7ebca] px-3 py-2 text-[13px] font-semibold text-[#76542f] hover:bg-[#efdfb5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a6a3f] disabled:cursor-wait disabled:opacity-60"
                  >
                    <RefreshCw size={15} aria-hidden="true" className={misconceptionRefreshBusy ? 'animate-spin' : undefined} />
                    {misconceptionRefreshBusy ? '正在校准说法' : '校准已绑定说法'}
                  </button>
                )}
                {misconceptionReviewTarget && onSelectScene && (
                  <button
                    type="button"
                    onClick={() => onSelectScene(misconceptionReviewTarget)}
                    className="inline-flex items-center gap-2 rounded-[8px] border border-[#b49b69] bg-white px-3 py-2 text-[13px] font-semibold text-[#76542f] hover:bg-[#fff4d5] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a6a3f]"
                  >
                    <LocateFixed size={15} aria-hidden="true" />
                    从第一处开始确认
                  </button>
                )}
              </div>
            </div>
          )}
          {learningActivityRefreshCount > 0 && onRefreshLearningActivities && (
            <div className="rounded-[8px] border border-[#b9c9bd] bg-[#f4faf5] px-4 py-3">
              <div className="text-[14px] font-semibold text-[#31593c]">学习动作仍停留在观看、跟做或照读</div>
              <div className="mt-1 text-[13px] leading-[1.55] text-[#536b59]">
                开场先留下预测或提取，例题解释关键步骤，收束完成迁移或想法修正；纯观看页补一条可检查回答。教师手改页不会自动覆盖。
              </div>
              <button
                type="button"
                onClick={onRefreshLearningActivities}
                disabled={learningActivityRefreshBusy}
                className="mt-3 inline-flex items-center gap-2 rounded-[8px] border border-[#7d9c84] bg-[#e8f3ea] px-3 py-2 text-[13px] font-semibold text-[#31593c] hover:bg-[#dcecdf] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#52765a] disabled:cursor-wait disabled:opacity-60"
              >
                <Sparkles size={15} aria-hidden="true" className={learningActivityRefreshBusy ? 'animate-pulse' : undefined} />
                {learningActivityRefreshBusy ? '正在深化学习活动' : `深化学习活动（${learningActivityRefreshCount} 页）`}
              </button>
            </div>
          )}
          {problemPracticeTotal > 0 && onRefreshProblemPractices && (
            <div className="rounded-[8px] border border-[#b8bfd0] bg-[#f5f7fb] px-4 py-3">
              <div className="text-[14px] font-semibold text-[#3f4c68]">知识点检核缺失或无法证明目标</div>
              <div className="mt-1 text-[13px] leading-[1.55] text-[#5c6578]">
                缺少练习的知识点会新增一页独立检核；已有问题页只重写命中页。教材目标、其他页面和教师修订保持不变，全部通过内容检查与事实核查后才保存。
              </div>
              <button
                type="button"
                onClick={onRefreshProblemPractices}
                disabled={practiceRefreshBusy}
                className="mt-3 inline-flex items-center gap-2 rounded-[8px] border border-[#8994ad] bg-[#e9edf6] px-3 py-2 text-[13px] font-semibold text-[#3f4c68] hover:bg-[#dfe5f1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#626f8c] disabled:cursor-wait disabled:opacity-60"
              >
                <Sparkles size={15} aria-hidden="true" className={practiceRefreshBusy ? 'animate-pulse' : undefined} />
                {practiceRefreshBusy ? '正在修复目标检核' : `AI 补齐或重写检核（${problemPracticeTotal} 项）`}
              </button>
            </div>
          )}
          {visibleIssues.length === 0 ? (
            <div className="rounded-[8px] border border-[#b8cdbd] bg-[#edf7ee] px-4 py-3 text-[15px] text-[#31593c]">
              样板课当前没有质量问题，允许进入正式舞台。
            </div>
          ) : visibleIssues.map(issue => (
            <div key={issue.id} className="rounded-[8px] border border-[#d9c5a4] bg-[#fffaf0] px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-[13px] font-semibold tracking-[0.06em] text-[#8a5a2b]">
                <span>{issue.gate}</span>
                <span>·</span>
                <span>{issue.severity}</span>
                <span>·</span>
                <span>{issue.targetId}</span>
              </div>
              <div className="mt-1 text-[16px] font-semibold">{issue.message}</div>
              <div className="mt-2 text-[14px] leading-[1.55] text-[#6b5a43]">
                <span className="font-semibold text-[#76542f]">影响：</span>
                {issue.impact}
              </div>
              <div className="mt-1 text-[14px] leading-[1.55] text-[#6b5a43]">
                <span className="font-semibold text-[#76542f]">建议：</span>
                {issue.fix}
              </div>
              {onSelectScene && qualityIssueCanNavigate(issue) && (
                <button
                  type="button"
                  onClick={() => onSelectScene(issue.targetId)}
                  className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#76542f] hover:text-[#4e351d] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a5a2b]"
                >
                  <LocateFixed size={14} aria-hidden="true" />
                  定位此页
                </button>
              )}
            </div>
          ))}
          {issueGroups.hiddenCount > 0 && (
            <button
              type="button"
              aria-expanded={showAll}
              onClick={() => setShowAll(value => !value)}
              className="rounded-[8px] border border-[#cbb68f] bg-[#fffaf0] px-4 py-2 text-[14px] font-medium text-[#76542f] hover:bg-[#f8ecd8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a5a2b]"
            >
              {showAll ? '收起次要提醒' : `展开其余 ${issueGroups.hiddenCount} 条提醒`}
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone: 'bad' | 'warn' | 'ok' }) {
  const color = tone === 'bad' ? '#9b2c2c' : tone === 'warn' ? '#946018' : '#2f6b3f'

  return (
    <div className="rounded-[8px] border border-[#d8c6a6] bg-[#fffaf0] px-3 py-3">
      <div className="text-[24px] font-semibold" style={{ color }}>{value}</div>
      <div className="mt-1 text-[12px] tracking-[0.08em] text-[#7a6a55]">{label}</div>
    </div>
  )
}
