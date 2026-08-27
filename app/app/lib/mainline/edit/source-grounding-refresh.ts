/**
 * 存量课程教材依据刷新。
 *
 * 只把当前知识点索引中已经存在的来源定位、摘录状态和候选教材素材回填到课程；
 * 不改讲稿、板书、题目、图片或教师修订。历史占位 excerpt 会被移除，避免被模型
 * 或事实核查误当成教材原文。已有非占位摘录不降级、不覆盖。
 */

import type { MainlineCourse, SourceMaterialGrounding, SourceMaterialRef } from '../domain.js'
import { auditCourseReleaseReadiness } from '../readiness.js'
import type { QualityIssue } from '../quality-gates.js'

const SOURCE_PLACEHOLDER_PATTERN = /待\s*(?:LLM\s*)?填充|待补(?:充|录入)|TODO|TBD/i

export interface RefreshCourseSourceGroundingsResult {
  course: MainlineCourse
  issues: QualityIssue[]
  refreshedKpIds: string[]
  clearedPlaceholderKpIds: string[]
}

export function sourceMaterialNeedsGroundingRefresh(source: SourceMaterialRef): boolean {
  if (!source.kpId) return false
  if (SOURCE_PLACEHOLDER_PATTERN.test(source.excerpt ?? '')) return true
  return !source.citation?.trim() && !source.provenance
}

export function refreshCourseSourceGroundings(
  course: MainlineCourse,
  groundingByKp: Readonly<Record<string, SourceMaterialGrounding>>,
): RefreshCourseSourceGroundingsResult {
  const refreshedKpIds: string[] = []
  const clearedPlaceholderKpIds: string[] = []
  const sourceMaterial = course.sourceMaterial.map(source => {
    const kpId = source.kpId
    const grounding = kpId ? groundingByKp[kpId] : undefined
    if (!kpId || !grounding || !hasTraceableGrounding(grounding) || !sourceMaterialNeedsGroundingRefresh(source)) {
      return source
    }

    const placeholder = SOURCE_PLACEHOLDER_PATTERN.test(source.excerpt ?? '')
    const refreshed = mergeSourceGrounding(source, grounding, placeholder)
    if (sameSource(source, refreshed)) return source

    refreshedKpIds.push(kpId)
    if (placeholder && !refreshed.excerpt) clearedPlaceholderKpIds.push(kpId)
    return refreshed
  })

  const candidate: MainlineCourse = { ...course, sourceMaterial }
  const readiness = auditCourseReleaseReadiness(candidate)
  return {
    course: {
      ...candidate,
      qualityStatus: course.qualityStatus === 'draft'
        ? 'draft'
        : readiness.ready ? 'passed' : 'blocked',
    },
    issues: readiness.deterministicIssues,
    refreshedKpIds: [...new Set(refreshedKpIds)],
    clearedPlaceholderKpIds: [...new Set(clearedPlaceholderKpIds)],
  }
}

function hasTraceableGrounding(grounding: SourceMaterialGrounding): boolean {
  return Boolean(grounding.citation?.trim() || grounding.provenance)
}

function mergeSourceGrounding(
  source: SourceMaterialRef,
  grounding: SourceMaterialGrounding,
  removeExistingExcerpt: boolean,
): SourceMaterialRef {
  const { excerpt: _excerpt, citation: _citation, provenance: _provenance, candidateResources: _resources, ...identity } = source
  const existingExcerpt = !removeExistingExcerpt && source.excerpt?.trim() ? source.excerpt : undefined
  const candidateResources = grounding.candidateResources ?? source.candidateResources
  return {
    ...identity,
    ...(existingExcerpt ? { excerpt: existingExcerpt } : grounding.excerpt ? { excerpt: grounding.excerpt } : {}),
    ...(grounding.citation ? { citation: grounding.citation } : source.citation ? { citation: source.citation } : {}),
    ...(grounding.provenance ? { provenance: grounding.provenance } : source.provenance ? { provenance: source.provenance } : {}),
    ...(candidateResources ? { candidateResources } : {}),
  }
}

function sameSource(left: SourceMaterialRef, right: SourceMaterialRef): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
