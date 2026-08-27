import { eq, desc } from 'drizzle-orm'
import type { DbClient } from '../client.js'
import type { TeachingPlanRepository } from './types.js'
import type { TeachingPlan } from '@maolab/shared-types'
import { teachingPlans } from '../schema.js'
import { parseJsonColumn } from './parse-column.js'

export function createTeachingPlanRepository(db: DbClient): TeachingPlanRepository {
  return {
    async find(id: string): Promise<TeachingPlan | undefined> {
      const row = db.select().from(teachingPlans).where(eq(teachingPlans.id, id)).get()
      if (!row) return undefined
      return deserializePlan(row)
    },

    async save(plan: TeachingPlan): Promise<void> {
      db.insert(teachingPlans)
        .values({
          id: plan.id,
          topic: plan.topic,
          teachingMethod: plan.teachingMethod,
          style: plan.style,
          language: plan.language,
          difficulty: plan.difficulty,
          outline: JSON.stringify(plan.outline),
          agents: JSON.stringify(plan.agents),
          emphasizedConcepts: JSON.stringify(plan.emphasizedConcepts),
          sourceDocuments: JSON.stringify(plan.sourceDocuments),
          gradeLevel: plan.gradeLevel ?? null,
          createdAt: plan.createdAt,
        })
        .onConflictDoUpdate({
          target: teachingPlans.id,
          set: {
            topic: plan.topic,
            outline: JSON.stringify(plan.outline),
            agents: JSON.stringify(plan.agents),
            emphasizedConcepts: JSON.stringify(plan.emphasizedConcepts),
          },
        })
        .run()
    },

    async list(): Promise<Pick<TeachingPlan, 'id' | 'topic' | 'createdAt' | 'gradeLevel' | 'outline'>[]> {
      const rows = db
        .select({
          id: teachingPlans.id,
          topic: teachingPlans.topic,
          createdAt: teachingPlans.createdAt,
          gradeLevel: teachingPlans.gradeLevel,
          outline: teachingPlans.outline,
        })
        .from(teachingPlans)
        .orderBy(desc(teachingPlans.createdAt))
        .all()
      return rows.map(r => ({
        id: r.id,
        topic: r.topic,
        createdAt: r.createdAt,
        outline: parseJsonColumn<TeachingPlan['outline']>(r.outline, { table: 'teaching_plans', id: r.id, column: 'outline' }),
        ...(r.gradeLevel != null ? { gradeLevel: r.gradeLevel } : {}),
      }))
    },
  }
}

const at = (id: string, column: string) => ({ table: 'teaching_plans', id, column })

function deserializePlan(row: typeof teachingPlans.$inferSelect): TeachingPlan {
  return {
    id: row.id,
    topic: row.topic,
    teachingMethod: row.teachingMethod as TeachingPlan['teachingMethod'],
    style: row.style as TeachingPlan['style'],
    language: row.language,
    difficulty: row.difficulty as TeachingPlan['difficulty'],
    outline: parseJsonColumn<TeachingPlan['outline']>(row.outline, at(row.id, 'outline')),
    agents: parseJsonColumn<TeachingPlan['agents']>(row.agents, at(row.id, 'agents')),
    emphasizedConcepts: parseJsonColumn<string[]>(row.emphasizedConcepts, at(row.id, 'emphasizedConcepts')),
    sourceDocuments: parseJsonColumn<TeachingPlan['sourceDocuments']>(row.sourceDocuments, at(row.id, 'sourceDocuments')),
    ...(row.gradeLevel != null ? { gradeLevel: row.gradeLevel } : {}),
    createdAt: row.createdAt,
  }
}
