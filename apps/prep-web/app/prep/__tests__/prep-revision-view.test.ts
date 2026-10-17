import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { canRevise, courseFamilyId, REVISE_CONFIRM } from '../lib/api'

test('canRevise only for accepted courses; the confirm text states the cost and nothing about publishing', () => {
  expect(canRevise({ planning: { status: 'ready' } })).toBe(true)
  for (const c of [{ planning: { status: 'review' } }, {}, null]) expect(canRevise(c)).toBe(false)
  expect(REVISE_CONFIRM).toMatch(/重新生成/)
  expect(REVISE_CONFIRM).not.toMatch(/发布|孩子/)
})

test('courseFamilyId: revision.familyId when present, otherwise the course id', () => {
  expect(courseFamilyId({ id: 'c-2', revision: { familyId: 'c-1', revisionNo: 2 } }, 'c-2')).toBe('c-1')
  expect(courseFamilyId({ id: 'c-1' }, 'c-1')).toBe('c-1')
  expect(courseFamilyId({}, 'c-3')).toBe('c-3')
})

test('RevisionView asks before revising, drops stale responses, switches to the revision, and the panel has no publishing left', () => {
  const src = readFileSync(resolve(import.meta.dirname, '..', 'panel', 'RevisionView.tsx'), 'utf8')
  expect(src).toContain('window.confirm(REVISE_CONFIRM)')
  expect(src).toContain('courseRef.current !== forCourse')
  expect(src).toContain('onSelectCourse(revision.courseId, text)')
  const panel = readFileSync(resolve(import.meta.dirname, '..', 'panel', 'PrepPanel.tsx'), 'utf8')
  expect(panel).toContain('<RevisionView key={courseId!}')
  expect(panel).not.toMatch(/Publish|canPublish/)
})
