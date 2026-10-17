// S4：课程包导出记录（拆分 spec 4.1、4.4）。包 = 老师的一个修订族，package_id 跨版本不变；撤回后同族再导出得到新包。
// 版本号写进包的 manifest，所以要在打包前定下：先无锁读最新版本（签名相同直接 unchanged，不打包），按"最新 + 1"打包，
// 写入时锁住包行复查——期间别人已写入同签名则判 unchanged，写入了别的版本则按新的"最新 + 1"重打。不在事务里渲染（一次要几十秒）。
// 隔离：所有读写带 owner 条件；别人的包与不存在的包一样是 NOT_FOUND。
import { randomBytes } from 'node:crypto'
import type pg from 'pg'

const SCHEMA_RE = /^[a-z_][a-z0-9_]*$/
const check = (schema: string): string => { if (!SCHEMA_RE.test(schema)) throw new Error(`invalid schema name: ${schema}`); return schema }
const MAX_BUILD_ATTEMPTS = 3

export type ExportPackageStatus = 'active' | 'recalled'

export interface ExportPackage {
  packageId: string
  owner: string
  familyId: string
  status: ExportPackageStatus
  createdAt: number
  recalledAt?: number
  recallReason?: string
  recallArtifactId?: string
}

export interface ExportVersion {
  packageId: string
  version: number
  sourceCourseId: string
  signature: string
  artifactId: string
  sha256: string
  bytes: number
  pageCount: number
  createdAt: number
}

/** 打包回调的产出：包已存成产物 */
export interface ExportBuild { artifactId: string; sha256: string; bytes: number; pageCount: number }

export interface AppendVersionInput {
  sourceCourseId: string
  /** 课程的最终验收签名：同签名 = 同内容 */
  signature: string
  build: (version: number) => Promise<ExportBuild>
}

export class ExportError extends Error {
  readonly code: 'NOT_FOUND' | 'RECALLED' | 'CONFLICT'
  constructor(code: ExportError['code'], message: string) {
    super(message)
    this.name = 'ExportError'
    this.code = code
  }
}

export interface OwnerExports {
  activePackageFor(familyId: string): Promise<ExportPackage | undefined>
  ensureActivePackage(familyId: string): Promise<ExportPackage>
  get(packageId: string): Promise<ExportPackage | undefined>
  appendVersion(packageId: string, input: AppendVersionInput): Promise<{ kind: 'created' | 'unchanged'; version: ExportVersion }>
  list(filter?: { familyId?: string }): Promise<Array<ExportPackage & { versions: ExportVersion[] }>>
  /** 已撤回则原样返回（保留第一次的撤回单） */
  recall(packageId: string, input: { reason?: string; artifactId: string }): Promise<ExportPackage>
}

interface PackageRow { package_id: string; owner: string; family_id: string; status: ExportPackageStatus; created_at: string; recalled_at: string | null; recall_reason: string | null; recall_artifact_id: string | null }
interface VersionRow { package_id: string; version: number; source_course_id: string; signature: string; artifact_id: string; sha256: string; bytes: number; page_count: number; created_at: string }

const toPackage = (r: PackageRow): ExportPackage => ({
  packageId: r.package_id, owner: r.owner, familyId: r.family_id, status: r.status, createdAt: Number(r.created_at),
  ...(r.recalled_at !== null ? { recalledAt: Number(r.recalled_at) } : {}),
  ...(r.recall_reason !== null ? { recallReason: r.recall_reason } : {}),
  ...(r.recall_artifact_id !== null ? { recallArtifactId: r.recall_artifact_id } : {}),
})
const toVersion = (r: VersionRow): ExportVersion => ({
  packageId: r.package_id, version: r.version, sourceCourseId: r.source_course_id, signature: r.signature, artifactId: r.artifact_id,
  sha256: r.sha256, bytes: r.bytes, pageCount: r.page_count, createdAt: Number(r.created_at),
})

const PACKAGE_COLUMNS = 'package_id, owner, family_id, status, created_at, recalled_at, recall_reason, recall_artifact_id'
const VERSION_COLUMNS = 'package_id, version, source_course_id, signature, artifact_id, sha256, bytes, page_count, created_at'

/** pk_ + 16 字节 base64url：满足课程包 id 规则 /^[A-Za-z0-9_-]{8,64}$/ */
export const newPackageId = (): string => `pk_${randomBytes(16).toString('base64url')}`

export class PgExports {
  private readonly pool: pg.Pool
  private readonly schema: string
  private readonly now: () => number
  private readonly newId: () => string

  constructor(pool: pg.Pool, options: { schema?: string; now?: () => number; newId?: () => string } = {}) {
    this.pool = pool
    this.schema = check(options.schema ?? 'course')
    this.now = options.now ?? Date.now
    this.newId = options.newId ?? newPackageId
  }

  forOwner(owner: string): OwnerExports {
    const { pool, schema, now, newId } = this
    const packages = `${schema}.package_exports`
    const versions = `${schema}.package_export_versions`

    const get = async (packageId: string): Promise<ExportPackage | undefined> => {
      const r = await pool.query<PackageRow>(`select ${PACKAGE_COLUMNS} from ${packages} where package_id = $1 and owner = $2`, [packageId, owner])
      return r.rows[0] ? toPackage(r.rows[0]) : undefined
    }
    const latest = async (client: pg.Pool | pg.PoolClient, packageId: string): Promise<ExportVersion | undefined> => {
      const r = await client.query<VersionRow>(`select ${VERSION_COLUMNS} from ${versions} where package_id = $1 order by version desc limit 1`, [packageId])
      return r.rows[0] ? toVersion(r.rows[0]) : undefined
    }
    const activePackageFor = async (familyId: string): Promise<ExportPackage | undefined> => {
      const r = await pool.query<PackageRow>(`select ${PACKAGE_COLUMNS} from ${packages} where owner = $1 and family_id = $2 and status = 'active'`, [owner, familyId])
      return r.rows[0] ? toPackage(r.rows[0]) : undefined
    }

    return {
      activePackageFor,
      get,
      async ensureActivePackage(familyId) {
        await pool.query(
          `insert into ${packages} (package_id, owner, family_id, status, created_at) values ($1, $2, $3, 'active', $4)
           on conflict (owner, family_id) where status = 'active' do nothing`,
          [newId(), owner, familyId, now()],
        )
        const found = await activePackageFor(familyId)
        if (!found) throw new ExportError('CONFLICT', `could not create a package for family ${familyId}`)
        return found
      },
      async appendVersion(packageId, input) {
        for (let attempt = 0; attempt < MAX_BUILD_ATTEMPTS; attempt += 1) {
          const pkg = await get(packageId)
          if (!pkg) throw new ExportError('NOT_FOUND', `package ${packageId} not found for this owner`)
          if (pkg.status === 'recalled') throw new ExportError('RECALLED', `package ${packageId} has been recalled`)
          const before = await latest(pool, packageId)
          if (before?.signature === input.signature) return { kind: 'unchanged', version: before }
          const version = (before?.version ?? 0) + 1
          const built = await input.build(version)
          const client = await pool.connect()
          try {
            await client.query('begin')
            const locked = await client.query<PackageRow>(`select ${PACKAGE_COLUMNS} from ${packages} where package_id = $1 and owner = $2 for update`, [packageId, owner])
            if (!locked.rows[0]) throw new ExportError('NOT_FOUND', `package ${packageId} not found for this owner`)
            if (locked.rows[0].status === 'recalled') throw new ExportError('RECALLED', `package ${packageId} has been recalled`)
            const now_ = await latest(client, packageId)
            if (now_?.signature === input.signature) {
              await client.query('commit')
              return { kind: 'unchanged', version: now_ }
            }
            if ((now_?.version ?? 0) + 1 !== version) {
              await client.query('rollback')
              continue
            }
            const r = await client.query<VersionRow>(
              `insert into ${versions} (${VERSION_COLUMNS}) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning ${VERSION_COLUMNS}`,
              [packageId, version, input.sourceCourseId, input.signature, built.artifactId, built.sha256, built.bytes, built.pageCount, now()],
            )
            await client.query('commit')
            return { kind: 'created', version: toVersion(r.rows[0]!) }
          } catch (error) {
            await client.query('rollback').catch(() => undefined)
            throw error
          } finally {
            client.release()
          }
        }
        throw new ExportError('CONFLICT', `package ${packageId} kept changing while exporting; try again`)
      },
      async list(filter = {}) {
        const r = await pool.query<PackageRow>(
          `select ${PACKAGE_COLUMNS} from ${packages} where owner = $1 and ($2::text is null or family_id = $2) order by created_at desc, package_id`,
          [owner, filter.familyId ?? null],
        )
        if (r.rows.length === 0) return []
        const v = await pool.query<VersionRow>(`select ${VERSION_COLUMNS} from ${versions} where package_id = any($1) order by version`, [r.rows.map((p) => p.package_id)])
        return r.rows.map((p) => ({ ...toPackage(p), versions: v.rows.filter((x) => x.package_id === p.package_id).map(toVersion) }))
      },
      async recall(packageId, input) {
        const r = await pool.query<PackageRow>(
          `update ${packages} set status = 'recalled', recalled_at = $3, recall_reason = $4, recall_artifact_id = $5
           where package_id = $1 and owner = $2 and status = 'active' returning ${PACKAGE_COLUMNS}`,
          [packageId, owner, now(), input.reason?.trim() || null, input.artifactId],
        )
        if (r.rows[0]) return toPackage(r.rows[0])
        const existing = await get(packageId)
        if (!existing) throw new ExportError('NOT_FOUND', `package ${packageId} not found for this owner`)
        return existing
      },
    }
  }
}

/** api 启动检查：0003 没生效就让 api 启动失败 */
export async function checkExportSchema(pool: pg.Pool, schema = 'course'): Promise<void> {
  const r = await pool.query<{ p: string | null; v: string | null }>(`select to_regclass($1) as p, to_regclass($2) as v`, [`${check(schema)}.package_exports`, `${schema}.package_export_versions`])
  if (!r.rows[0]?.p || !r.rows[0]?.v) throw new Error(`迁移 0003 未生效（schema ${schema}）：先确认 api 启动时的 runMigrations 已执行，必要时手工执行 packages/domain/migrations/0003_export.sql`)
}
