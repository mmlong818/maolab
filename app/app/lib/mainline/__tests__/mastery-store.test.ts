import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openSqliteRaw } from '@maolab/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __setMasteryDbForTest,
  masteryRecordOf,
  recentMistakesForKps,
  recordPracticeAttempt,
  savedPracticeSceneIds,
  seededMasteryKpIds,
} from '../mastery-store.js'
import { seedMastery } from '../rehearsal/seed-mastery.js'

let db: ReturnType<typeof openSqliteRaw>
const NO_LEDGER = join(tmpdir(), `maolab-no-seed-ledger-${process.pid}.json`)
const PRACTICE_SNAPSHOT = {
  task: '比较甲、乙两车的位置关系，判断乙车是否运动并说明依据。',
  feedback: '相对位置随时间发生变化，所以乙车相对甲车运动。请核对判断对象与依据。',
}
const CLASSROOM_SESSION_ID = 'session-mastery-test'

function createTables(scoreConstraint = '') {
  db.exec(`
    CREATE TABLE concept_mastery (
      id TEXT PRIMARY KEY,
      profile_id TEXT NOT NULL,
      concept_id TEXT NOT NULL,
      score REAL NOT NULL ${scoreConstraint},
      last_reviewed_at INTEGER NOT NULL,
      UNIQUE(profile_id, concept_id)
    );
    CREATE TABLE student_responses (
      id TEXT PRIMARY KEY NOT NULL,
      course_id TEXT NOT NULL,
      atom_id TEXT NOT NULL,
      student_id TEXT NOT NULL DEFAULT 'self',
      objective_ids TEXT NOT NULL DEFAULT '[]',
      atom_type TEXT NOT NULL,
      response TEXT NOT NULL,
      correct INTEGER,
      time_spent_ms INTEGER,
      difficulty_level TEXT NOT NULL DEFAULT 'standard',
      submitted_at INTEGER NOT NULL,
      knowledge_point_cluster_id TEXT,
      knowledge_point_id TEXT,
      atom_source_leaf_id TEXT
    );
  `)
}

beforeEach(() => {
  db = openSqliteRaw(':memory:')
  __setMasteryDbForTest(db)
})

afterEach(() => {
  __setMasteryDbForTest(null)
  db.close()
})

describe('recordPracticeAttempt', () => {
  it('只把与当前题目和反馈版本一致的完整服务端证据恢复为已保存', async () => {
    createTables()
    await recordPracticeAttempt({
      courseId: 'course-1',
      sessionId: CLASSROOM_SESSION_ID,
      sceneId: 'scene-practice',
      kpId: 'kp-1',
      practiceSnapshot: PRACTICE_SNAPSHOT,
      objectiveCriteria: [{
        objectiveId: 'goal-kp-1',
        successSignal: '能根据相对位置是否随时间变化判断机械运动。',
        alignment: 'kp-specific',
      }],
      outcome: 'correct',
      confidence: 'high',
      attemptText: '乙车相对甲车的位置持续变化，所以乙车运动。',
      reflectionText: '关键依据是相对位置随时间变化。',
    })

    await expect(savedPracticeSceneIds('course-1', CLASSROOM_SESSION_ID, [{
      sceneId: 'scene-practice',
      ...PRACTICE_SNAPSHOT,
    }])).resolves.toEqual(['scene-practice'])

    await expect(savedPracticeSceneIds('course-1', 'different-session', [{
      sceneId: 'scene-practice',
      task: PRACTICE_SNAPSHOT.task,
      feedback: '教师修改后的新反馈。',
    }])).resolves.toEqual([])
    await expect(savedPracticeSceneIds('other-course', CLASSROOM_SESSION_ID, [{
      sceneId: 'scene-practice',
      ...PRACTICE_SNAPSHOT,
    }])).resolves.toEqual([])
  })

  it('旧记录只有占位式订正时不恢复完成状态，也不向教师暴露详情', async () => {
    createTables()
    const now = Date.now()
    db.prepare(`INSERT INTO concept_mastery (id, profile_id, concept_id, score, last_reviewed_at)
      VALUES (?, ?, ?, ?, ?)`)
      .run('m-placeholder', 'default', 'kp-1', 0.32, now)
    db.prepare(`INSERT INTO student_responses
      (id, course_id, atom_id, student_id, objective_ids, atom_type, response, correct,
        time_spent_ms, difficulty_level, submitted_at, knowledge_point_cluster_id,
        knowledge_point_id, atom_source_leaf_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        'sr-placeholder', 'course-1', 'scene-practice', 'self', '["goal-kp-1"]', 'mainline-practice',
        JSON.stringify({
          sessionId: CLASSROOM_SESSION_ID,
          outcome: 'incorrect',
          confidence: 'medium',
          calibration: 'overconfident',
          selfReported: true,
          evidenceBasis: 'self-assessed-after-feedback',
          scoreStatus: 'provisional',
          verifiedCorrect: null,
          practiceSnapshot: PRACTICE_SNAPSHOT,
          objectiveCriteria: [{
            objectiveId: 'goal-kp-1',
            successSignal: '能根据相对位置是否随时间变化判断机械运动。',
            alignment: 'kp-specific',
          }],
          attemptText: '两车同向，所以相对静止。',
          reflectionText: '已订正。',
        }),
        null, null, 'standard', now, null, 'kp-1', null,
      )

    await expect(savedPracticeSceneIds('course-1', CLASSROOM_SESSION_ID, [{
      sceneId: 'scene-practice',
      ...PRACTICE_SNAPSHOT,
    }])).resolves.toEqual([])
    expect(await masteryRecordOf('kp-1', NO_LEDGER)).toEqual({
      kpId: 'kp-1',
      score: 0.32,
      lastReviewedAt: now,
      evidenceStatus: 'provisional-self-assessment',
    })
  })

  it('同一事务保存揭晓前把握度、作答结果与最新掌握度', async () => {
    createTables()

    const result = await recordPracticeAttempt({
      courseId: 'course-1',
      sessionId: CLASSROOM_SESSION_ID,
      sceneId: 'scene-practice',
      kpId: 'kp-1',
      practiceSnapshot: PRACTICE_SNAPSHOT,
      objectiveCriteria: [{
        objectiveId: 'goal-kp-1',
        successSignal: '能根据相对位置是否随时间变化判断机械运动。',
        alignment: 'kp-specific',
      }],
      outcome: 'correct',
      confidence: 'high',
      attemptText: '乙车相对甲车的位置持续落后，所以乙车运动。',
      reflectionText: '关键依据是两车速度不同，位置关系随时间变化。',
    })

    expect(result.score).toBe(0.68)
    expect(result.calibration.kind).toBe('calibrated')
    const response = db.prepare(`SELECT * FROM student_responses`).get() as {
      objective_ids: string
      response: string
      correct: number | null
      knowledge_point_id: string
    }
    expect(JSON.parse(response.objective_ids)).toEqual(['goal-kp-1'])
    expect(JSON.parse(response.response)).toMatchObject({
      sessionId: CLASSROOM_SESSION_ID,
      outcome: 'correct',
      confidence: 'high',
      calibration: 'calibrated',
      selfReported: true,
      evidenceBasis: 'self-assessed-after-feedback',
      scoreStatus: 'provisional',
      verifiedCorrect: null,
      practiceSnapshot: PRACTICE_SNAPSHOT,
      objectiveCriteria: [{
        objectiveId: 'goal-kp-1',
        successSignal: '能根据相对位置是否随时间变化判断机械运动。',
        alignment: 'kp-specific',
      }],
      attemptText: '乙车相对甲车的位置持续落后，所以乙车运动。',
      reflectionText: '关键依据是两车速度不同，位置关系随时间变化。',
    })
    expect(response.correct).toBeNull()
    expect(response.knowledge_point_id).toBe('kp-1')
    expect(db.prepare(`SELECT score FROM concept_mastery`).get()).toEqual({ score: 0.68 })
    expect(result).toMatchObject({
      followUp: {
        label: '把这条依据迁移出去',
        basis: 'student-reflection-and-success-criterion',
      },
      evidenceBasis: 'self-assessed-after-feedback',
      scoreStatus: 'provisional',
    })
    expect(await masteryRecordOf('kp-1', NO_LEDGER)).toMatchObject({
      score: 0.68,
      evidenceStatus: 'provisional-self-assessment',
      latestEvidence: {
        outcome: 'correct',
        confidence: 'high',
        calibration: 'calibrated',
        evidenceBasis: 'self-assessed-after-feedback',
        scoreStatus: 'provisional',
        practiceSnapshot: PRACTICE_SNAPSHOT,
        objectiveCriteria: [{
          objectiveId: 'goal-kp-1',
          successSignal: '能根据相对位置是否随时间变化判断机械运动。',
          alignment: 'kp-specific',
        }],
        attemptText: '乙车相对甲车的位置持续落后，所以乙车运动。',
        reflectionText: '关键依据是两车速度不同，位置关系随时间变化。',
      },
    })
  })

  it('旧版或畸形证据只保留来源等级，不向教师暴露不完整详情', async () => {
    createTables()
    const now = Date.now()
    db.prepare(`INSERT INTO concept_mastery (id, profile_id, concept_id, score, last_reviewed_at)
      VALUES (?, ?, ?, ?, ?)`)
      .run('m-old', 'default', 'kp-old', 0.44, now)
    db.prepare(`INSERT INTO student_responses
      (id, course_id, atom_id, student_id, objective_ids, atom_type, response, correct,
        time_spent_ms, difficulty_level, submitted_at, knowledge_point_cluster_id,
        knowledge_point_id, atom_source_leaf_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        'sr-old', 'course-1', 'scene-1', 'self', '[]', 'mainline-practice',
        JSON.stringify({
          outcome: 'correct',
          confidence: 'high',
          calibration: 'calibrated',
          selfReported: true,
          evidenceBasis: 'self-assessed-after-feedback',
          scoreStatus: 'provisional',
          attemptText: '只有原答，没有题目、反馈、成功标准与订正。',
        }),
        null, null, 'standard', now, null, 'kp-old', null,
      )

    expect(await masteryRecordOf('kp-old', NO_LEDGER)).toEqual({
      kpId: 'kp-old',
      score: 0.44,
      lastReviewedAt: now,
      evidenceStatus: 'provisional-self-assessment',
    })
  })

  it('只把与当前分数事件匹配的客观评分认作已验证，其余历史分数保持来源不明', async () => {
    createTables()
    const now = Date.now()
    db.prepare(`INSERT INTO concept_mastery (id, profile_id, concept_id, score, last_reviewed_at)
      VALUES (?, ?, ?, ?, ?)`)
      .run('m-verified', 'default', 'kp-verified', 0.82, now)
    db.prepare(`INSERT INTO student_responses
      (id, course_id, atom_id, student_id, objective_ids, atom_type, response, correct,
        time_spent_ms, difficulty_level, submitted_at, knowledge_point_cluster_id,
        knowledge_point_id, atom_source_leaf_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        'sr-verified', 'course-1', 'scene-1', 'self', '[]', 'mainline-practice',
        JSON.stringify({ scoreStatus: 'verified' }), 1, null, 'standard', now, null, 'kp-verified', null,
      )
    db.prepare(`INSERT INTO concept_mastery (id, profile_id, concept_id, score, last_reviewed_at)
      VALUES (?, ?, ?, ?, ?)`)
      .run('m-legacy', 'default', 'kp-legacy', 0.31, now - 1)

    expect(await masteryRecordOf('kp-verified', NO_LEDGER)).toMatchObject({ evidenceStatus: 'verified' })
    expect(await masteryRecordOf('kp-legacy', NO_LEDGER)).toMatchObject({ evidenceStatus: 'legacy-unattributed' })
  })

  it('掌握度写入失败时回滚已经插入的作答证据', async () => {
    createTables('CHECK(score >= 0.5)')

    await expect(recordPracticeAttempt({
      courseId: 'course-1',
      sessionId: CLASSROOM_SESSION_ID,
      sceneId: 'scene-practice',
      kpId: 'kp-1',
      practiceSnapshot: PRACTICE_SNAPSHOT,
      objectiveCriteria: [{ objectiveId: 'goal-kp-1', successSignal: '能完成本题。', alignment: 'kp-specific' }],
      outcome: 'incorrect',
      confidence: 'high',
      attemptText: '两车同向，所以相对静止。',
      reflectionText: '我忽略了速度不同；改正为相对位置会变化。',
    })).rejects.toThrow()

    expect(db.prepare(`SELECT COUNT(*) AS count FROM student_responses`).get()).toEqual({ count: 0 })
    expect(db.prepare(`SELECT COUNT(*) AS count FROM concept_mastery`).get()).toEqual({ count: 0 })
  })

  it('缺少原答或订正证据时不写作答，也不更新掌握度', async () => {
    createTables()

    await expect(recordPracticeAttempt({
      courseId: 'course-1',
      sessionId: CLASSROOM_SESSION_ID,
      sceneId: 'scene-practice',
      kpId: 'kp-1',
      practiceSnapshot: PRACTICE_SNAPSHOT,
      objectiveCriteria: [{ objectiveId: 'goal-kp-1', successSignal: '能完成本题。', alignment: 'kp-specific' }],
      outcome: 'correct',
      confidence: 'high',
      attemptText: '   ',
      reflectionText: '关键依据是相对位置变化。',
    })).rejects.toThrow('requires non-empty attempt and reflection evidence')

    expect(db.prepare(`SELECT COUNT(*) AS count FROM student_responses`).get()).toEqual({ count: 0 })
    expect(db.prepare(`SELECT COUNT(*) AS count FROM concept_mastery`).get()).toEqual({ count: 0 })
  })

  it('占位式订正不会写入作答，也不会更新掌握度', async () => {
    createTables()

    await expect(recordPracticeAttempt({
      courseId: 'course-1',
      sessionId: CLASSROOM_SESSION_ID,
      sceneId: 'scene-practice',
      kpId: 'kp-1',
      practiceSnapshot: PRACTICE_SNAPSHOT,
      objectiveCriteria: [{ objectiveId: 'goal-kp-1', successSignal: '能完成本题。', alignment: 'kp-specific' }],
      outcome: 'incorrect',
      confidence: 'medium',
      attemptText: '两车同向，所以相对静止。',
      reflectionText: '已订正。',
    })).rejects.toThrow('requires specific reflection evidence')

    expect(db.prepare(`SELECT COUNT(*) AS count FROM student_responses`).get()).toEqual({ count: 0 })
    expect(db.prepare(`SELECT COUNT(*) AS count FROM concept_mastery`).get()).toEqual({ count: 0 })
  })

  it.each([
    ['题目', { task: '   ', feedback: PRACTICE_SNAPSHOT.feedback }],
    ['反馈', { task: PRACTICE_SNAPSHOT.task, feedback: '   ' }],
  ])('缺少%s快照时不写作答，也不更新掌握度', async (_label, practiceSnapshot) => {
    createTables()

    await expect(recordPracticeAttempt({
      courseId: 'course-1',
      sessionId: CLASSROOM_SESSION_ID,
      sceneId: 'scene-practice',
      kpId: 'kp-1',
      practiceSnapshot,
      objectiveCriteria: [{ objectiveId: 'goal-kp-1', successSignal: '能完成本题。', alignment: 'kp-specific' }],
      outcome: 'correct',
      confidence: 'high',
      attemptText: '原答案。',
      reflectionText: '关键依据是相对位置随时间变化。',
    })).rejects.toThrow('requires a complete task and feedback snapshot')

    expect(db.prepare(`SELECT COUNT(*) AS count FROM student_responses`).get()).toEqual({ count: 0 })
    expect(db.prepare(`SELECT COUNT(*) AS count FROM concept_mastery`).get()).toEqual({ count: 0 })
  })

  it.each([
    ['没有目标', []],
    ['成功标准为空', [{ objectiveId: 'goal-kp-1', successSignal: '   ', alignment: 'kp-specific' }]],
    ['目标重复', [
      { objectiveId: 'goal-kp-1', successSignal: '标准一', alignment: 'kp-specific' },
      { objectiveId: 'goal-kp-1', successSignal: '标准二', alignment: 'kp-specific' },
    ]],
  ] as const)('%s时不写自评，也不更新掌握度', async (_label, objectiveCriteria) => {
    createTables()

    await expect(recordPracticeAttempt({
      courseId: 'course-1',
      sessionId: CLASSROOM_SESSION_ID,
      sceneId: 'scene-practice',
      kpId: 'kp-1',
      practiceSnapshot: PRACTICE_SNAPSHOT,
      objectiveCriteria: [...objectiveCriteria],
      outcome: 'correct',
      confidence: 'high',
      attemptText: '原答案。',
      reflectionText: '关键依据是相对位置随时间变化。',
    })).rejects.toThrow('requires unique aligned objectives with success criteria')

    expect(db.prepare(`SELECT COUNT(*) AS count FROM student_responses`).get()).toEqual({ count: 0 })
    expect(db.prepare(`SELECT COUNT(*) AS count FROM concept_mastery`).get()).toEqual({ count: 0 })
  })
})

describe('seededMasteryKpIds', () => {
  it('只把台账与当前掌握度仍一致的知识点披露为演示种子', async () => {
    createTables()
    const dir = mkdtempSync(join(tmpdir(), 'maolab-mastery-source-'))
    const ledgerPath = join(dir, 'seed-ledger.json')

    try {
      seedMastery(db, ledgerPath, 'course-1', new Map([['kp-1', 1]]))
      expect([...await seededMasteryKpIds('course-1', ledgerPath)]).toEqual(['kp-1'])
      expect(await masteryRecordOf('kp-1', ledgerPath)).toMatchObject({ evidenceStatus: 'seeded-demo' })

      await recordPracticeAttempt({
        courseId: 'course-1',
        sessionId: CLASSROOM_SESSION_ID,
        sceneId: 'scene-practice',
        kpId: 'kp-1',
        practiceSnapshot: PRACTICE_SNAPSHOT,
        objectiveCriteria: [{ objectiveId: 'goal-kp-1', successSignal: '能完成本题。', alignment: 'kp-specific' }],
        outcome: 'incorrect',
        confidence: 'high',
        attemptText: '原答案。',
        reflectionText: '原答忽略了速度差；应比较相对位置是否变化。',
      })
      expect([...await seededMasteryKpIds('course-1', ledgerPath)]).toEqual([])
      expect(await masteryRecordOf('kp-1', ledgerPath)).toMatchObject({ evidenceStatus: 'provisional-self-assessment' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('recentMistakesForKps(复习课错因注入,DeepTutor 借鉴票2)', () => {
  it('只返回自评链完整的误答记录,答对与占位记录不入错题账本', async () => {
    createTables()
    await recordPracticeAttempt({
      courseId: 'course-1', sessionId: CLASSROOM_SESSION_ID, sceneId: 'scene-a', kpId: 'kp-1',
      practiceSnapshot: PRACTICE_SNAPSHOT,
      objectiveCriteria: [{ objectiveId: 'goal-kp-1', successSignal: '能根据相对位置是否随时间变化判断机械运动。', alignment: 'kp-specific' }],
      outcome: 'incorrect', confidence: 'high',
      attemptText: '我认为乙车静止,因为它相对地面不动。',
      reflectionText: '第一处偏离:参照物选错了,题目要求相对甲车判断;改正:乙车相对甲车位置变化,是运动的。',
    })
    await recordPracticeAttempt({
      courseId: 'course-1', sessionId: CLASSROOM_SESSION_ID, sceneId: 'scene-b', kpId: 'kp-1',
      practiceSnapshot: PRACTICE_SNAPSHOT,
      objectiveCriteria: [{ objectiveId: 'goal-kp-1', successSignal: '能根据相对位置是否随时间变化判断机械运动。', alignment: 'kp-specific' }],
      outcome: 'correct', confidence: 'medium',
      attemptText: '乙车相对甲车位置变化,运动。',
      reflectionText: '关键依据是相对位置随时间变化。',
    })

    const mistakes = await recentMistakesForKps(['kp-1', 'kp-none'])
    expect(mistakes).toHaveLength(1)
    expect(mistakes[0]).toMatchObject({
      kpId: 'kp-1',
      task: PRACTICE_SNAPSHOT.task,
      confidence: 'high',
    })
    expect(mistakes[0]!.attemptText).toContain('乙车静止')
    expect(mistakes[0]!.reflectionText).toContain('参照物选错')
    // 每 KP 上限与空输入
    await expect(recentMistakesForKps([])).resolves.toEqual([])
  })
})
