import type { SourceMaterialRef } from '../domain.js'

export function sourceReferenceFor(source: SourceMaterialRef, index: number): string {
  return `source:${index + 1}:${source.kpId ?? 'course'}`
}

export function sourceMaterialByReference(
  sources: readonly SourceMaterialRef[],
  reference: string,
): SourceMaterialRef | undefined {
  return sources.find((source, index) => sourceReferenceFor(source, index) === reference)
}

export function sourceReferencesForKnowledgePoint(
  sources: readonly SourceMaterialRef[],
  knowledgePointId: string,
): string[] {
  return sources.flatMap((source, index) => (
    source.kpId === knowledgePointId && source.excerpt?.trim()
      ? [sourceReferenceFor(source, index)]
      : []
  ))
}
