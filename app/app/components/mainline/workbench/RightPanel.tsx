'use client'

/**
 * RightPanel · 右栏 tab 切换:检查(QualityPanel 接线)/ 教研简报(PrepBrief 渲染)
 * (v5 M1 WP2)
 *
 * QualityPanel/PrepBriefView 都不认识"选中幕"这个概念——过滤逻辑在外部做好
 * 再传入(不改组件内部逻辑)。「仅看选中幕」默认关闭:结构树的红黄点已经给出
 * 全课概览,右栏默认展示全部 issue 才能撑住"5 分钟判断这节课能不能上"的验收项;
 * 老师点开某一幕想深挖时,勾选开关即过滤。
 */
import { useMemo, useState } from 'react'
import type { MainlineCourse, QualityIssue, QualitySummary } from '@/lib/mainline'
import type { PrepBrief } from '@/lib/mainline/prep-brief'
import {
  QualityPanel,
  qualityPanelCanRefreshCast,
  qualityPanelCanRefreshKpGoals,
  qualityPanelCanRefreshMisconceptionClaims,
  qualityPanelCanRefreshRuntimeContracts,
  qualityPanelCanRefreshSourceGrounding,
  qualityPanelLearningActivityTargets,
  qualityPanelProblemPracticeTargets,
} from '../QualityPanel'
import { PrepBriefView } from './PrepBriefView'
import { TemplatePicker } from './TemplatePicker'
import { TryoutPanel } from './TryoutPanel'

interface RightPanelProps {
  course: MainlineCourse
  issues: QualityIssue[]
  summary: QualitySummary
  factAuditFatalCount: number
  factAuditWarningCount: number
  factAuditInfoCount: number
  prepBrief: PrepBrief | undefined
  prepBriefError: boolean
  selectedSceneId: string | undefined
  onSelectScene: (sceneId: string) => void
  styleBusy: boolean
  onSetStylePack: (stylePackId: string | null) => void
  castRefreshBusy: boolean
  onRefreshCast: () => void
  runtimeContractRefreshBusy: boolean
  onRefreshRuntimeContracts: () => void
  sourceGroundingRefreshBusy: boolean
  onRefreshSourceGrounding: () => void
  kpGoalRefreshBusy: boolean
  onRefreshKpGoals: () => void
  misconceptionRefreshBusy: boolean
  onRefreshMisconceptionClaims: () => void
  learningActivityRefreshBusy: boolean
  onRefreshLearningActivities: () => void
  practiceRefreshBusy: boolean
  onRefreshProblemPractices: () => void
}

type Tab = 'quality' | 'brief' | 'template'

export function RightPanel({
  course, issues, summary, factAuditFatalCount, factAuditWarningCount, factAuditInfoCount,
  prepBrief, prepBriefError, selectedSceneId, onSelectScene, styleBusy, onSetStylePack,
  castRefreshBusy, onRefreshCast,
  runtimeContractRefreshBusy, onRefreshRuntimeContracts,
  sourceGroundingRefreshBusy, onRefreshSourceGrounding,
  kpGoalRefreshBusy, onRefreshKpGoals,
  misconceptionRefreshBusy, onRefreshMisconceptionClaims,
  learningActivityRefreshBusy, onRefreshLearningActivities,
  practiceRefreshBusy, onRefreshProblemPractices,
}: RightPanelProps) {
  const [tab, setTab] = useState<Tab>('quality')
  const [onlySelected, setOnlySelected] = useState(false)

  const filteredIssues = useMemo(
    () => (onlySelected && selectedSceneId ? issues.filter(i => i.targetId === selectedSceneId) : issues),
    [issues, onlySelected, selectedSceneId],
  )
  const canRefreshCast = qualityPanelCanRefreshCast(issues)
  const canRefreshRuntimeContracts = qualityPanelCanRefreshRuntimeContracts(issues)
  const canRefreshSourceGrounding = qualityPanelCanRefreshSourceGrounding(issues)
  const canRefreshKpGoals = qualityPanelCanRefreshKpGoals(issues)
  const canRefreshMisconceptionClaims = qualityPanelCanRefreshMisconceptionClaims(issues)
  const learningActivityCount = qualityPanelLearningActivityTargets(issues)
    .filter(sceneId => !course.scenes.find(scene => scene.id === sceneId)?.editedByTeacher)
    .length
  const problemPracticeCount = qualityPanelProblemPracticeTargets(issues).length

  return (
    <aside style={{ width: 340, flex: 'none', overflowY: 'auto', background: '#fafaf7', borderLeft: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
        <TabButton active={tab === 'quality'} onClick={() => setTab('quality')}>检查</TabButton>
        <TabButton active={tab === 'brief'} onClick={() => setTab('brief')}>教研简报</TabButton>
        <TabButton active={tab === 'template'} onClick={() => setTab('template')}>模板</TabButton>
      </div>

      {tab === 'quality' && (
        <div>
          <TryoutPanel course={course} onSelectScene={onSelectScene} />
          {factAuditFatalCount > 0 && (
            <div style={{ margin: 12, padding: '10px 12px', borderRadius: 8, background: '#fef2f2', color: '#991b1b', fontSize: 13 }}>
              事实核查另有 {factAuditFatalCount} 处严重问题(FATAL),不计入下方质量闸门统计——详见「教研简报」tab。
            </div>
          )}
          {(factAuditWarningCount > 0 || factAuditInfoCount > 0) && (
            <div style={{ margin: 12, padding: '10px 12px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: 13 }}>
              事实核查另有 {factAuditWarningCount} 处提醒(MISLEADING/IMPRECISE){factAuditInfoCount > 0 ? `、${factAuditInfoCount} 处未验证` : ''},
              不计入下方质量闸门统计——详见「教研简报」tab「事实核查」。
            </div>
          )}
          {prepBrief && prepBrief.presentationReview.findings.length > 0 && (
            <div style={{ margin: 12, padding: '10px 12px', borderRadius: 8, border: '1px solid #d0d5dd', background: '#f8fafc', color: '#344054', fontSize: 13 }}>
              <div>
                真检判例命中 {prepBrief.presentationReview.findings.length} 条呈现建议。它们不阻断上课，但建议在备课时逐页确认。
              </div>
              <button
                type="button"
                onClick={() => setTab('brief')}
                style={{ marginTop: 7, border: 'none', background: 'transparent', color: '#175cd3', fontSize: 12, fontWeight: 700, padding: 0, cursor: 'pointer' }}
              >
                查看呈现诊断 →
              </button>
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '0 16px 8px', fontSize: 13, color: '#6b7280' }}>
            <input type="checkbox" checked={onlySelected} onChange={e => setOnlySelected(e.target.checked)} />
            仅看选中幕的问题
          </label>
          <QualityPanel
            summary={summary}
            issues={filteredIssues}
            canRefreshCast={canRefreshCast}
            castRefreshBusy={castRefreshBusy}
            onRefreshCast={onRefreshCast}
            canRefreshRuntimeContracts={canRefreshRuntimeContracts}
            runtimeContractRefreshBusy={runtimeContractRefreshBusy}
            onRefreshRuntimeContracts={onRefreshRuntimeContracts}
            canRefreshSourceGrounding={canRefreshSourceGrounding}
            sourceGroundingRefreshBusy={sourceGroundingRefreshBusy}
            onRefreshSourceGrounding={onRefreshSourceGrounding}
            canRefreshKpGoals={canRefreshKpGoals}
            kpGoalRefreshBusy={kpGoalRefreshBusy}
            onRefreshKpGoals={onRefreshKpGoals}
            canRefreshMisconceptionClaims={canRefreshMisconceptionClaims}
            misconceptionRefreshBusy={misconceptionRefreshBusy}
            onRefreshMisconceptionClaims={onRefreshMisconceptionClaims}
            learningActivityRefreshCount={learningActivityCount}
            learningActivityRefreshBusy={learningActivityRefreshBusy}
            onRefreshLearningActivities={onRefreshLearningActivities}
            practiceRefreshCount={problemPracticeCount}
            practiceRefreshBusy={practiceRefreshBusy}
            onRefreshProblemPractices={onRefreshProblemPractices}
            onSelectScene={onSelectScene}
          />
        </div>
      )}

      {tab === 'brief' && (
        <div style={{ padding: 16 }}>
          {prepBriefError || !prepBrief ? (
            <div style={{ color: '#9ca3af', fontSize: 14 }}>教研简报加载失败,刷新页面重试。</div>
          ) : (
            <PrepBriefView brief={prepBrief} onSelectScene={onSelectScene} />
          )}
        </div>
      )}

      {tab === 'template' && (
        <TemplatePicker course={course} busy={styleBusy} onSelect={onSetStylePack} />
      )}
    </aside>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1, padding: '12px 0', border: 'none', background: 'transparent', cursor: 'pointer',
        fontSize: 14, fontWeight: 700, color: active ? '#111827' : '#9ca3af',
        borderBottom: active ? '2px solid #111827' : '2px solid transparent',
      }}
    >
      {children}
    </button>
  )
}
