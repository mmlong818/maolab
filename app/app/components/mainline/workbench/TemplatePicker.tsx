'use client'

/**
 * TemplatePicker · 模板替换选皮器(备课工作台右栏「模板」tab,2026-07-22)
 *
 * 目录来自 pack-catalog(三档明亮池:精修 6 + 引进浅色池 + 生成档抽样 24),
 * 选中即 PATCH /api/v2/mainline/style/[courseId] 并本地更新 course——中栏预览台
 * 吃的是同一份 course state,换皮立即可见,不整页刷新。「自动分配」恢复哈希分流。
 * 换皮只改呈现层;想让配图跟上新模板,配合「AI 补图」重生成(fill-images?force=1)。
 */
import { useMemo } from 'react'
import type { MainlineCourse } from '@/lib/mainline'
import { stylePackCatalogFor, type PackCatalogEntry } from '@/lib/mainline/presentation/pack-catalog'
import { stylePackFor } from '@/lib/mainline/presentation/style-packs'

interface TemplatePickerProps {
  course: MainlineCourse
  busy: boolean
  onSelect: (stylePackId: string | null) => void
}

const TIER_LABEL: Record<PackCatalogEntry['tier'], string> = {
  signature: '精修手笔',
  imported: '开源引进(浅色池)',
  generative: '生成方案(本课学段学科抽样)',
}

export function TemplatePicker({ course, busy, onSelect }: TemplatePickerProps) {
  const catalog = useMemo(() => stylePackCatalogFor(course), [course.subject, course.gradeBand])
  const autoPack = useMemo(
    () => stylePackFor({ id: course.id, subject: course.subject, gradeBand: course.gradeBand }),
    [course.id, course.subject, course.gradeBand],
  )
  const current = course.stylePackId ?? null

  const tiers: PackCatalogEntry['tier'][] = ['signature', 'imported', 'generative']

  return (
    <div style={{ padding: 16, opacity: busy ? 0.6 : 1, pointerEvents: busy ? 'none' : 'auto' }}>
      <button
        type="button"
        onClick={() => onSelect(null)}
        style={{
          width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
          border: current === null ? '2px solid #111827' : '1px solid #e5e7eb',
          background: '#fff', marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>自动分配</div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>按课程哈希三档分流 · 当前落点:{autoPack.label}</div>
      </button>

      {tiers.map(tier => {
        const entries = catalog.filter(e => e.tier === tier)
        if (entries.length === 0) return null
        return (
          <section key={tier} style={{ marginBottom: 18 }}>
            <h3 style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', margin: '0 0 8px' }}>
              {TIER_LABEL[tier]} · {entries.length}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {entries.map(entry => (
                <button
                  key={entry.id}
                  type="button"
                  title={entry.whenToUse}
                  onClick={() => onSelect(entry.id)}
                  style={{
                    textAlign: 'left', padding: 8, borderRadius: 8, cursor: 'pointer',
                    border: current === entry.id ? '2px solid #111827' : '1px solid #e5e7eb',
                    background: entry.swatch.paper,
                    minWidth: 0, // grid 子项默认 min-content,长标签会把 1fr 撑爆溢出面板
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 7, background: entry.swatch.accent, flex: 'none' }} />
                    <span style={{ width: 14, height: 14, borderRadius: 3, background: entry.swatch.backdropTop, border: '1px solid rgba(0,0,0,0.08)', flex: 'none' }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: entry.swatch.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.label}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )
      })}

      <p style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.6 }}>
        换模板只改呈现(版式/配色/字体/质感),不动内容。已有配图想匹配新模板,请在顶部横幅用「AI 补图」重新生成。
      </p>
    </div>
  )
}
