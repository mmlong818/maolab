import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('全课备课显示契约', () => {
  it('只保留教师实际使用的投影片、讲稿和授课提示，移除内部链路说明', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/components/mainline/workbench/CourseContentOverview.tsx'),
      'utf8',
    )

    expect(source).toContain("import MathText from '../../MathOrText'")
    expect(source).toContain('lessonPresentationPages')
    expect(source).toContain('共 {pages.length} 页，按实际上课顺序查看每张投影片与讲稿。')
    expect(source).toContain('PagePreview label={`第 ${index + 1} 页${page.stageLabel')
    expect(source).toContain('forceFeedbackRevealed={page.feedbackRevealed}')
    expect(source).toContain('<MathText>{displayScene.teacherScript}</MathText>')
    expect(source).toContain('<MathText>{displayScene.narrationAnchor}</MathText>')
    expect(source).toContain('<MathText>{displayScene.studentAction}</MathText>')
    expect(source).toContain('讲解重点')
    expect(source).toContain('学生任务')
    expect(source).not.toContain('投影片要点')
    expect(source).not.toContain('LineList')
    expect(source).not.toContain('教师板书')
    expect(source).not.toContain('第 ${index + 1} 页 · 板书')
    expect(source).not.toContain('TeacherBoardSlide')
    expect(source).not.toContain('学生首屏确认稿（与上方画面一致）')
    expect(source).not.toContain('下一页先显示：')
    expect(source).not.toContain('结构化备课资料（不上屏）')
    expect(source).not.toContain('图形呈现（上方画面按这些关系绘制）')
    expect(source).not.toContain('以下为教师备课资料，不会显示给学生')
    expect(source).not.toContain('画面证据')
    expect(source).not.toContain('SCENE_TYPE_LABEL')
    expect(source).not.toContain('EXECUTOR_LABEL')
  })
})
