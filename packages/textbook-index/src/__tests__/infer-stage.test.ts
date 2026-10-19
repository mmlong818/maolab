import { describe, expect, it } from 'vitest'
import { inferStage } from '../annotation-pipeline.js'

describe('inferStage', () => {
  it('年级词优先于学段词：平台书名把九年级教材误写成"小学"', () => {
    expect(inferStage('新教材-小学音乐人教版九年级上册')).toBe('初中')
  })

  it.each([
    ['小学数学人教版一年级上册', '小学'],
    ['小学体育与健康人教版一至二年级全一册', '小学'],
    ['初中历史统编版七年级上册', '初中'],
    ['高中历史统编版高二选择性必修1 国家制度与社会治理', '高中'],
    ['高中数学人教A版必修 第一册', '高中'],
    ['普通中学教科书•法语_高二年级_法语IV（下册）', '高中'],
    ['小学英语学生读本', '小学'],
    ['无学段信息', '未知学段'],
  ])('%s → %s', (title, stage) => {
    expect(inferStage(title)).toBe(stage)
  })
})
