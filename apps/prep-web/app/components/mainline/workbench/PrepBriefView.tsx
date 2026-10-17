'use client'

/**
 * PrepBriefView · 右栏「教研简报」渲染(v5 M1 WP2,数据来自 lib/mainline/prep-brief.ts)
 *
 * 每一节都带来源徽章(教材标注/事实核查/学情档案/骨架库/质量闸门/默认兜底)——
 * 这是"教研背书可溯源"的产品语义,渲染层原样透出,不做二次加工。
 * 误区/事实核查条目点击可定位到对应幕(onSelectScene 提升到 PrepWorkbench,
 * 同步左栏高亮 + 中栏预览)。
 */
import type { CSSProperties, ReactNode } from 'react'
import type { PrepBrief, PrepBriefExecutorBreakdown, PrepBriefFactAuditSceneEntry, PrepBriefKpEntry, PrepBriefPresentationReview, PrepBriefSkeletonRationale } from '@/lib/mainline/prep-brief'
import type { PracticeEvidenceSnapshot } from '@/lib/mainline/mastery'
import { EXECUTOR_LABEL, KNOWLEDGE_TYPE_LABEL, SCENE_TYPE_LABEL, SOURCE_TAG_STYLE, type SourceTagKind } from './labels'

interface PrepBriefViewProps {
  brief: PrepBrief
  onSelectScene: (sceneId: string) => void
}

export function PrepBriefView({ brief, onSelectScene }: PrepBriefViewProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ fontSize: 12, color: '#9ca3af' }}>
        简报生成于 {formatTime(brief.generatedAt)}
      </div>

      <Section title="人机分工">
        <ExecutorBreakdownCard breakdown={brief.executorBreakdown} />
      </Section>

      <Section title="知识点">
        {brief.kps.length === 0 ? (
          <Empty>本课没有关联任何知识点。</Empty>
        ) : (
          brief.kps.map(kp => <KpCard key={kp.kpId} kp={kp} onSelectScene={onSelectScene} />)
        )}
      </Section>

      <Section title="事实核查">
        <FactAuditSection brief={brief} onSelectScene={onSelectScene} />
      </Section>

      <Section title="呈现诊断">
        <PresentationReviewSection review={brief.presentationReview} onSelectScene={onSelectScene} />
      </Section>

      <Section title="骨架依据">
        {brief.skeletonRationale.length === 0 ? (
          <Empty>本课没有可展示的骨架片段。</Empty>
        ) : (
          brief.skeletonRationale.map(r => <SkeletonCard key={r.fragmentId} rationale={r} />)
        )}
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 13, color: '#9ca3af' }}>{children}</div>
}

function SourceTag({ source }: { source: SourceTagKind }) {
  const style = SOURCE_TAG_STYLE[source]
  return (
    <span
      style={{
        fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
        background: style.bg, color: style.fg, whiteSpace: 'nowrap',
      }}
    >
      {source}
    </span>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px' }}>{children}</div>
  )
}

function ExecutorBreakdownCard({ breakdown }: { breakdown: PrepBriefExecutorBreakdown }) {
  if (breakdown.byExecutor.every(entry => entry.sceneCount === 0)) {
    return <Empty>这门课还没有任何幕,暂时无法统计人机分工。</Empty>
  }

  const teacherEntry = breakdown.byExecutor.find(e => e.executor === 'teacher')
  const aiEntry = breakdown.byExecutor.find(e => e.executor === 'ai')

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <SourceTag source={breakdown.source} />
        <span style={{ fontSize: 13, color: '#374151' }}>
          明天你要亲自讲约 {formatMinutes(teacherEntry?.estimatedDurationSec ?? 0)},AI 承担约 {formatMinutes(aiEntry?.estimatedDurationSec ?? 0)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {breakdown.byExecutor.map(entry => (
          <div key={entry.executor}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>{EXECUTOR_LABEL[entry.executor]}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{entry.sceneCount} 幕 · 约 {formatMinutes(entry.estimatedDurationSec)}</div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function formatMinutes(sec: number): string {
  if (sec <= 0) return '0 分钟'
  if (sec < 60) return `${sec} 秒`
  return `${Math.round((sec / 60) * 10) / 10} 分钟`
}

function KpCard({ kp, onSelectScene }: { kp: PrepBriefKpEntry; onSelectScene: (sceneId: string) => void }) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{kp.canonicalName}</span>
        <span style={{ fontSize: 12, color: '#6b7280' }}>{KNOWLEDGE_TYPE_LABEL[kp.knowledgeType]}</span>
        <SourceTag source={kp.knowledgeTypeSource} />
      </div>

      {kp.learningObjectives.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
          {kp.learningObjectives.map((o, i) => <li key={i}>{o}</li>)}
        </ul>
      )}

      {kp.misconceptions.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#b45309', marginBottom: 4 }}>常见误区</div>
          {kp.misconceptions.map((m, i) => (
            <div key={i} style={{ fontSize: 13, color: '#374151', marginBottom: 4, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <SourceTag source={m.source} />
              <span style={{ flex: 1 }}>{m.text}</span>
              {m.addressed && m.addressedInSceneId ? (
                <button type="button" onClick={() => onSelectScene(m.addressedInSceneId!)} style={linkButtonStyle}>
                  ✓ 已处理 →
                </button>
              ) : m.wordingDrift && m.reviewSceneId ? (
                <button
                  type="button"
                  onClick={() => onSelectScene(m.reviewSceneId!)}
                  style={{ ...linkButtonStyle, color: '#b45309' }}
                  title="有辨析幕在处理本知识点的误区，但措辞与当前教材标注不一致——核对是否同一误区"
                >
                  ⚠ 措辞待核对 →
                </button>
              ) : (
                <span style={{ fontSize: 12, color: '#dc2626', whiteSpace: 'nowrap' }}>⚠ 暂无幕处理</span>
              )}
            </div>
          ))}
        </div>
      )}

      <ContingencyPlan plan={kp.contingencyPlan} onSelectScene={onSelectScene} />

      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
        <SourceTag source={kp.mastery.source} />
        {kp.mastery.score !== undefined ? (
          <span>{masteryLabel(kp.mastery)}{kp.mastery.isWeakNow ? ' · 当前判定薄弱' : ''}</span>
        ) : (
          <span>暂无作答记录</span>
        )}
        {kp.mastery.reinforcedInSkeleton && <span style={{ color: '#9a3412' }}>· 骨架已因薄弱加固</span>}
      </div>
      {kp.mastery.latestEvidence && <MasteryEvidenceDetails evidence={kp.mastery.latestEvidence} />}
    </Card>
  )
}

function ContingencyPlan({
  plan,
  onSelectScene,
}: {
  plan: PrepBriefKpEntry['contingencyPlan']
  onSelectScene: (sceneId: string) => void
}) {
  if (!plan.available) {
    return (
      <div style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#991b1b' }}>课堂应变暂不可用</span>
          <SourceTag source={plan.source} />
        </div>
        <div style={{ marginTop: 4, fontSize: 12, color: '#7f1d1d', lineHeight: 1.6 }}>
          {plan.missingReason}
        </div>
      </div>
    )
  }

  return (
    <details style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid #e5e7eb' }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#374151' }}>
        课堂应变 · {plan.moves.length} 条分支
      </summary>
      <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.6 }}>
          判断标准：{plan.successSignal}
        </div>
        {plan.moves.map((move, index) => (
          <div
            key={`${move.kind}-${move.targetSceneId ?? index}`}
            style={{ borderLeft: '2px solid #d1d5db', paddingLeft: 9, overflowWrap: 'anywhere' }}
          >
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                {contingencyKindLabel(move.kind)}
              </span>
              <SourceTag source={move.source} />
            </div>
            <div style={{ marginTop: 3, fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
              <strong>如果：</strong>{move.trigger}
            </div>
            <div style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.6 }}>
              <strong>就：</strong>{move.action}
            </div>
            {(move.targetSceneId || move.resumeSceneId) && (
              <div style={{ marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {move.targetSceneId && (
                  <button type="button" onClick={() => onSelectScene(move.targetSceneId!)} style={linkButtonStyle}>
                    定位处理页 →
                  </button>
                )}
                {move.resumeSceneId && move.resumeSceneId !== move.targetSceneId && (
                  <button type="button" onClick={() => onSelectScene(move.resumeSceneId!)} style={linkButtonStyle}>
                    返回独立练习 →
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
  )
}

function contingencyKindLabel(kind: PrepBriefKpEntry['contingencyPlan']['moves'][number]['kind']): string {
  if (kind === 'advance') return '达到标准'
  if (kind === 'repair') return '证据不足'
  return '命中误区'
}

export function MasteryEvidenceDetails({ evidence }: { evidence: PracticeEvidenceSnapshot }) {
  return (
    <details style={{ marginTop: 10, paddingTop: 9, borderTop: '1px solid #e5e7eb' }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#374151' }}>
        查看最近一次作答证据
      </summary>
      <div style={{ marginTop: 9, display: 'grid', gap: 9, fontSize: 12, color: '#374151', lineHeight: 1.6 }}>
        <EvidenceField label="作答时题目">{evidence.practiceSnapshot.task}</EvidenceField>
        <EvidenceField label="揭晓前原答">{evidence.attemptText}</EvidenceField>
        <EvidenceField label="反馈内容">{evidence.practiceSnapshot.feedback}</EvidenceField>
        <EvidenceField label="反馈后依据或订正">{evidence.reflectionText}</EvidenceField>
        <EvidenceField label="成功标准">
          <ul style={{ margin: 0, paddingLeft: 17 }}>
            {evidence.objectiveCriteria.map(criterion => (
              <li key={criterion.objectiveId}>
                {criterion.successSignal}
                {criterion.alignment === 'course-level-legacy' ? '（历史课程总目标）' : ''}
              </li>
            ))}
          </ul>
        </EvidenceField>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: '#6b7280' }}>
          <span>反馈后自评：{evidence.outcome === 'correct' ? '答对' : '还不稳'}</span>
          <span>揭晓前把握度：{confidenceLabel(evidence.confidence)}</span>
          <span>校准：{calibrationLabel(evidence.calibration)}</span>
          <span>记录时间：{formatTime(new Date(evidence.submittedAt).toISOString())}</span>
        </div>
      </div>
    </details>
  )
}

function EvidenceField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 2 }}>{label}</div>
      <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{children}</div>
    </div>
  )
}

function confidenceLabel(confidence: PracticeEvidenceSnapshot['confidence']): string {
  if (confidence === 'high') return '高'
  if (confidence === 'medium') return '中'
  return '低'
}

function calibrationLabel(calibration: PracticeEvidenceSnapshot['calibration']): string {
  if (calibration === 'calibrated') return '判断校准'
  if (calibration === 'underconfident') return '低估自己'
  if (calibration === 'overconfident') return '高把握误答'
  return '已觉察不确定'
}

function FactAuditSection({ brief, onSelectScene }: { brief: PrepBrief; onSelectScene: (sceneId: string) => void }) {
  const { factAudit } = brief
  if (!factAudit.available) {
    return <Empty>尚未跑事实核查(内容填充完成后才有)。</Empty>
  }
  const trace = factAudit.repairTrace
  const repairedScenes = trace?.attempts.reduce((sum, attempt) => sum + attempt.repairedSceneIds.length, 0) ?? 0
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#374151' }}>
        <SourceTag source={factAudit.source} />
        <span>
          已核查 {factAudit.auditedSceneCount} 幕，待重新核查 {factAudit.pendingSceneCount} 幕，
          未验证阻断 {factAudit.unverifiedSceneCount} 幕，
          {factAudit.fatalCount} 处严重问题；
          {factAudit.consistencyAvailable
            ? `跨页一致性已检查 ${factAudit.consistencyAuditedSceneCount} 幕，${factAudit.consistencyConflictCount} 处冲突`
            : '跨页一致性尚未运行'}
        </span>
      </div>
      {trace && trace.stoppedReason !== 'no-actionable-issues' && (
        <details style={{ marginTop: 8, border: '1px solid #e5e7eb', padding: '8px 10px', background: '#fafafa' }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#374151' }}>
            自动修正 {trace.attempts.length}/{trace.maxAttempts} 轮，完成 {repairedScenes} 页
            {factAudit.fatalCount > 0 ? `，仍有 ${factAudit.fatalCount} 处严重问题` : '，严重问题已清除'}
          </summary>
          <div style={{ marginTop: 8, display: 'grid', gap: 6, fontSize: 12, color: '#4b5563', lineHeight: 1.6 }}>
            {trace.attempts.map(attempt => {
              const protectedCount = attempt.skipped.filter(item => item.reason === 'teacher-edit-protected').length
              const missingCount = attempt.skipped.filter(item => item.reason === 'scene-missing').length
              return (
                <div key={attempt.attempt}>
                  第 {attempt.attempt} 轮：尝试 {attempt.attemptedSceneIds.length} 页，完成 {attempt.repairedSceneIds.length} 页，
                  失败 {attempt.failed.length} 页
                  {protectedCount > 0 ? `，保护教师手改 ${protectedCount} 页` : ''}
                  {missingCount > 0 ? `，页面已不存在 ${missingCount} 页` : ''}
                  ；剩余严重 {attempt.remainingBlockingCount}、提醒 {attempt.remainingWarningCount}。
                </div>
              )
            })}
            {trace.attempts.length === 0 && <div>自动修正上限为 0 轮，本次未改动课程内容。</div>}
            <div>{factRepairStopMessage(trace.stoppedReason, factAudit.fatalCount)}</div>
          </div>
        </details>
      )}
      {factAudit.byScene.length === 0 ? (
        <Empty>已核查内容没有发现事实问题。</Empty>
      ) : (
        factAudit.byScene.map(entry => <FactAuditCard key={entry.sceneId} entry={entry} onSelectScene={onSelectScene} />)
      )}
    </>
  )
}

function FactAuditCard({ entry, onSelectScene }: { entry: PrepBriefFactAuditSceneEntry; onSelectScene: (sceneId: string) => void }) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => onSelectScene(entry.sceneId)} style={linkButtonStyle}>
          {entry.sceneType ? SCENE_TYPE_LABEL[entry.sceneType] : entry.sceneId} →
        </button>
        {entry.fatalCount > 0 && <Badge tone="bad">{entry.fatalCount} 严重</Badge>}
        {entry.misleadingCount > 0 && <Badge tone="bad">{entry.misleadingCount} 误导阻断</Badge>}
        {entry.impreciseCount > 0 && <Badge tone="warn">{entry.impreciseCount} 不精确</Badge>}
        {entry.pendingReview && <Badge tone="warn">待重新核查</Badge>}
        {entry.unverified && <Badge tone="bad">未验证阻断</Badge>}
      </div>
      <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
        {entry.details.map((d, i) => (
          <li key={i}>
            {d.message}
            <div style={{ color: '#6b7280', fontSize: 12 }}>{d.fix}</div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function masteryLabel(mastery: PrepBriefKpEntry['mastery']): string {
  const percent = `${Math.round((mastery.score ?? 0) * 100)}%`
  if (mastery.evidenceStatus === 'verified') return `已验证掌握度 ${percent}`
  if (mastery.evidenceStatus === 'provisional-self-assessment') return `暂定自评掌握度 ${percent}`
  if (mastery.evidenceStatus === 'seeded-demo') return `演示种子 ${percent}（非学生作答）`
  return `历史掌握度 ${percent}（来源未确认）`
}

function PresentationReviewSection({
  review,
  onSelectScene,
}: {
  review: PrepBriefPresentationReview
  onSelectScene: (sceneId: string) => void
}) {
  if (review.findings.length === 0) {
    return (
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <SourceTag source={review.source} />
          <span style={{ fontSize: 13, color: '#475467' }}>当前可执行判例未命中。</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: '#667085', lineHeight: 1.5 }}>
          这不等于画面已通过人工审美检查，正式上课前仍需在真实舞台逐页复看。
        </div>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
          <SourceTag source={review.source} />
          {review.high > 0 && <Badge tone="bad">{review.high} 高优先</Badge>}
          {review.medium > 0 && <Badge tone="warn">{review.medium} 中优先</Badge>}
          {review.low > 0 && <Badge tone="neutral">{review.low} 可打磨</Badge>}
        </div>
        <div style={{ marginTop: 7, fontSize: 12, color: '#667085', lineHeight: 1.5 }}>
          以下建议来自真实课程走查，只用于备课排序，不改变课程通过状态，也不会自动改写页面。
        </div>
      </Card>
      {review.findings.map((finding, index) => (
        <Card key={`${finding.ruleId}-${finding.sceneId}-${index}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => onSelectScene(finding.sceneId)} style={linkButtonStyle}>
              {finding.sceneNumber ? `第 ${finding.sceneNumber} 页` : finding.sceneId}
              {finding.sceneType ? ` · ${SCENE_TYPE_LABEL[finding.sceneType]}` : ''} →
            </button>
            <Badge tone={finding.severity === 'high' ? 'bad' : finding.severity === 'medium' ? 'warn' : 'neutral'}>
              {finding.severity === 'high' ? '高优先' : finding.severity === 'medium' ? '中优先' : '可打磨'}
            </Badge>
          </div>
          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: '#1d2939', lineHeight: 1.5 }}>
            {finding.message}
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#475467', lineHeight: 1.55 }}>
            <strong>教学影响：</strong>{finding.consequence}
          </div>
          <div style={{ marginTop: 5, fontSize: 12, color: '#475467', lineHeight: 1.55 }}>
            <strong>备课建议：</strong>{finding.suggestion}
          </div>
          <details style={{ marginTop: 8, fontSize: 12, color: '#667085' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>查看真检依据</summary>
            {finding.evidence.map(evidence => (
              <div key={`${evidence.reportPath}-${evidence.caseSummary}`} style={{ marginTop: 6, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
                <div style={{ fontWeight: 700 }}>{reportLabel(evidence.reportPath)}</div>
                <div>{evidence.caseSummary}</div>
              </div>
            ))}
          </details>
        </Card>
      ))}
    </>
  )
}

function factRepairStopMessage(
  reason: NonNullable<PrepBrief['factAudit']['repairTrace']>['stoppedReason'],
  fatalCount: number,
): string {
  if (reason === 'no-blocking-issues') return '停止原因：已没有会阻断授课的事实问题。'
  if (reason === 'no-progress') return fatalCount > 0
    ? '停止原因：本轮没有可安全完成的修正，课程继续阻断并等待教师处理。'
    : '停止原因：本轮没有可安全完成的修正，剩余提醒留给教师复核。'
  if (reason === 'max-attempts') return fatalCount > 0
    ? '停止原因：已达到自动修正上限，课程继续阻断并等待教师处理。'
    : '停止原因：已达到自动修正上限，剩余提醒留给教师复核。'
  return '停止原因：没有需要自动修正的事实问题。'
}

function SkeletonCard({ rationale }: { rationale: PrepBriefSkeletonRationale }) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{rationale.teachingType}</span>
        <SourceTag source={rationale.source} />
        {rationale.reinforced && <Badge tone="warn">薄弱加固</Badge>}
      </div>
      <ol style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
        {rationale.steps.map((s, i) => (
          <li key={i}>
            {SCENE_TYPE_LABEL[s.sceneType]} · {s.role}
          </li>
        ))}
      </ol>
      <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>成功信号:{rationale.successSignal}</div>
    </Card>
  )
}

function Badge({ tone, children }: { tone: 'bad' | 'warn' | 'neutral'; children: ReactNode }) {
  const style = tone === 'bad'
    ? { bg: '#fef2f2', fg: '#991b1b' }
    : tone === 'warn'
      ? { bg: '#fff7ed', fg: '#9a3412' }
      : { bg: '#f3f4f6', fg: '#4b5563' }
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: style.bg, color: style.fg }}>
      {children}
    </span>
  )
}

const linkButtonStyle: CSSProperties = {
  border: 'none', background: 'transparent', color: '#2563eb', fontSize: 13, fontWeight: 600,
  cursor: 'pointer', padding: 0, whiteSpace: 'nowrap',
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function reportLabel(path: string): string {
  const parent = path.split('/').at(-2) ?? path
  return `原始报告 · ${parent}`
}
