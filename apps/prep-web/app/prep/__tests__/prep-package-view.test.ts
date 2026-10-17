import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import type { PrepPackage } from '../lib/api'
import { downloadHref } from '../lib/artifact-url'
import { latestPackageJob, packageDownloadName, packageExportLabel, RECALL_CONFIRM, type PrepJob } from '../lib/panel-model'

const job = (over: Partial<PrepJob>): PrepJob => ({ jobId: 'j', kind: 'export-package', pageId: null, status: 'succeeded', attempts: 1, error: null, result: null, createdAt: 1, finishedAt: 2, ...over })
const pkg = (over: Partial<PrepPackage>): PrepPackage => ({ packageId: 'pk_a', status: 'active', createdAt: 1, recalledAt: null, recallReason: null, recallUrl: null, versions: [], ...over })

test('latestPackageJob reads only package jobs: pending, failed with the reason, or done', () => {
  expect(latestPackageJob([job({ kind: 'export-pptx' })])).toBeNull()
  expect(latestPackageJob([job({ status: 'running' })])).toEqual({ pending: true })
  expect(latestPackageJob([job({ status: 'failed', error: { code: 'PACKAGE_privacy', message: '课程包的文字里有账号信息' } })])).toEqual({ failed: '课程包的文字里有账号信息' })
  expect(latestPackageJob([job({ createdAt: 1, status: 'failed' }), job({ createdAt: 5, status: 'succeeded' })])).toEqual({ done: true })
})

test('the export button says "new package" once every package of this course has been recalled', () => {
  expect(packageExportLabel([])).toBe('导出课程包')
  expect(packageExportLabel([pkg({})])).toBe('导出课程包')
  expect(packageExportLabel([pkg({ status: 'recalled' })])).toBe('导出为新课程包')
})

test('download names carry the course title and version; links carry the token only for artifact urls', () => {
  expect(packageDownloadName('分数的意义', 2)).toBe('分数的意义-v2.maolab-course.zip')
  expect(packageDownloadName('  ', 1)).toBe('课程包-v1.maolab-course.zip')
  const href = downloadHref('/api/prep/artifacts/ar_1', packageDownloadName('分数', 1), (u) => `${u}&token=t`)
  expect(href).toContain('name=')
  expect(href).toContain('token=t')
})

test('recall asks first and says it only takes effect in the study room once operations run the slip', () => {
  expect(RECALL_CONFIRM).toMatch(/撤回单/)
  expect(RECALL_CONFIRM).toMatch(/自习室/)
  const src = readFileSync(resolve(import.meta.dirname, '..', 'panel', 'PackageView.tsx'), 'utf8')
  expect(src).toContain('window.confirm(RECALL_CONFIRM)')
  expect(src).toContain('已是最新版本')
  const exportView = readFileSync(resolve(import.meta.dirname, '..', 'panel', 'ExportView.tsx'), 'utf8')
  expect(exportView).toContain('<PackageView')
})
