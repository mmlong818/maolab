import { ARTIFACT_MAX_BYTES, artifactIdFor, sha256Hex, validateArtifactInput, type ArtifactMeta, type CourseArtifactStore, type OwnerArtifacts, type StoredArtifact } from '@maolab/domain'

export function createMemoryArtifacts(now: () => number = Date.now): CourseArtifactStore & { all(): StoredArtifact[] } {
  const rows = new Map<string, StoredArtifact>()
  const live = (row: StoredArtifact | undefined, owner: string) => (row && row.owner === owner && (row.expiresAt === null || row.expiresAt > now()) ? row : undefined)
  const meta = ({ bytes: _bytes, ...rest }: StoredArtifact): ArtifactMeta => rest
  const forOwner = (owner: string): OwnerArtifacts => ({
    async put(input) {
      validateArtifactInput(input, ARTIFACT_MAX_BYTES)
      const sha256 = sha256Hex(input.bytes)
      const id = artifactIdFor(owner, input.kind, sha256)
      const existing = rows.get(id)
      const expiresAt = existing
        ? (existing.expiresAt === null || input.expiresAt === undefined ? null : Math.max(existing.expiresAt, input.expiresAt))
        : (input.expiresAt ?? null)
      const row: StoredArtifact = existing
        ? { ...existing, expiresAt }
        : { id, owner, sha256, kind: input.kind, contentType: input.contentType, byteSize: input.bytes.byteLength, courseId: input.courseId ?? null, createdAt: now(), expiresAt, bytes: Buffer.from(input.bytes) }
      rows.set(id, row)
      return meta(row)
    },
    async get(id) { return live(rows.get(id), owner) },
    async head(id) { const row = live(rows.get(id), owner); return row ? meta(row) : undefined },
    async delete(id) { return live(rows.get(id), owner) ? rows.delete(id) : false },
  })
  return {
    forOwner,
    async purgeExpired() {
      let n = 0
      for (const [id, row] of rows) if (row.expiresAt !== null && row.expiresAt <= now()) { rows.delete(id); n += 1 }
      return n
    },
    all: () => [...rows.values()],
  }
}
