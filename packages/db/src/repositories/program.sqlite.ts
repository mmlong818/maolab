import { eq } from 'drizzle-orm'
import type { DbClient } from '../client.js'
import type { ProgramRepository } from './types.js'
import type { Program, ContentRef, AgentConfig } from '@maolab/shared-types'
import { programs } from '../schema.js'
import { parseJsonColumn } from './parse-column.js'

interface ProgramRow {
  id: string
  planId: string
  status: string
  ordered: string
  agents: string
  generatedAt: number | null
  errorMessage: string | null
}

function deserialize(row: ProgramRow): Program {
  const program: Program = {
    id: row.id,
    planId: row.planId,
    status: row.status as Program['status'],
    ordered: parseJsonColumn<ContentRef[]>(row.ordered, { table: 'programs', id: row.id, column: 'ordered' }),
    agents: parseJsonColumn<AgentConfig[]>(row.agents, { table: 'programs', id: row.id, column: 'agents' }),
  }
  if (row.generatedAt !== null) program.generatedAt = row.generatedAt
  if (row.errorMessage !== null) program.errorMessage = row.errorMessage
  return program
}

export function createProgramRepository(db: DbClient): ProgramRepository {
  return {
    async find(id: string): Promise<Program | undefined> {
      const row = db.select().from(programs).where(eq(programs.id, id)).get() as ProgramRow | undefined
      return row ? deserialize(row) : undefined
    },

    async save(program: Program): Promise<void> {
      const row = {
        id: program.id,
        planId: program.planId,
        status: program.status,
        ordered: JSON.stringify(program.ordered),
        agents: JSON.stringify(program.agents),
        generatedAt: program.generatedAt ?? null,
        errorMessage: program.errorMessage ?? null,
      }
      db.insert(programs)
        .values(row)
        .onConflictDoUpdate({ target: programs.id, set: row })
        .run()
    },

    async updateStatus(id: string, status: Program['status'], error?: string): Promise<void> {
      db.update(programs)
        .set({ status, errorMessage: error ?? null })
        .where(eq(programs.id, id))
        .run()
    },

    async updateOrdered(id: string, ordered: ContentRef[]): Promise<void> {
      db.update(programs)
        .set({ ordered: JSON.stringify(ordered) })
        .where(eq(programs.id, id))
        .run()
    },

    async listByPlan(planId: string): Promise<Pick<Program, 'id' | 'status' | 'generatedAt'>[]> {
      const rows = db.select({
        id: programs.id,
        status: programs.status,
        generatedAt: programs.generatedAt,
      }).from(programs).where(eq(programs.planId, planId)).all()
      return rows.map(r => {
        const out: Pick<Program, 'id' | 'status' | 'generatedAt'> = {
          id: r.id,
          status: r.status as Program['status'],
        }
        if (r.generatedAt !== null) out.generatedAt = r.generatedAt
        return out
      })
    },
  }
}
