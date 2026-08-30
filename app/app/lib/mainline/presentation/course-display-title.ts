import type { LessonScene, MainlineCourse } from '../domain.js'

/**
 * 教师看到的课程标题必须直接列出本课全部知识点。
 *
 * `topic` 是课程生成和旧数据兼容字段；知识点名称以 sourceMaterial 的 kp 顺序为准。
 * 旧课缺少来源时才回退 topic，避免把无法恢复的信息凭空改写。
 */
export function courseDisplayTitle(course: Pick<MainlineCourse, 'topic' | 'sourceMaterial'>): string {
  const names = [...new Set(course.sourceMaterial
    .filter(source => Boolean(source.kpId))
    .map(source => source.title.trim())
    .filter(Boolean))]

  if (names.length === 1 && course.topic.trim()) return course.topic.trim()
  return names.length > 0 ? names.join('、') : course.topic.trim()
}

/** 旧课的课程级开场曾复制旧 topic；显示时与课程标题保持一致。 */
export function sceneDisplayTitle(course: Pick<MainlineCourse, 'topic' | 'sourceMaterial'>, scene: Pick<LessonScene, 'kpId' | 'visualFocus'>): string {
  return !scene.kpId && scene.visualFocus.trim() === course.topic.trim()
    ? courseDisplayTitle(course)
    : scene.visualFocus
}

/**
 * 课程级旧页面可能在多个面向教师或学生的字段中复制了旧 topic。
 * 这里仅构造渲染副本，既不修改数据库，也不影响带 kpId 的具体教学页面。
 */
export function courseDisplayScene(course: MainlineCourse, scene: LessonScene): LessonScene {
  const sourceTitle = course.topic.trim()
  const displayTitle = courseDisplayTitle(course)
  if (scene.kpId || !sourceTitle || sourceTitle === displayTitle) return scene

  const replaceTitle = (value: string) => value.split(sourceTitle).join(displayTitle)
  return {
    ...scene,
    visualFocus: replaceTitle(scene.visualFocus),
    contentSlots: Object.fromEntries(Object.entries(scene.contentSlots).map(([key, value]) => [key, replaceTitle(value)])),
    narrationAnchor: replaceTitle(scene.narrationAnchor),
    syncStrategy: replaceTitle(scene.syncStrategy),
    interactionContract: replaceTitle(scene.interactionContract),
    fallbackPresentation: replaceTitle(scene.fallbackPresentation),
    gradeTone: replaceTitle(scene.gradeTone),
    teacherScript: replaceTitle(scene.teacherScript),
    studentAction: replaceTitle(scene.studentAction),
    boardText: scene.boardText.map(replaceTitle),
    evidenceOnScreen: scene.evidenceOnScreen.map(replaceTitle),
    voiceCue: { ...scene.voiceCue, pauseRule: replaceTitle(scene.voiceCue.pauseRule) },
  }
}

/**
 * 封面页大标题(2026-08-26 用户「第一页内容为啥重复」):多 KP 课的 topic 是
 * KP 名逐条拼接,而封面下方目录又逐条列出同样的 KP 名——大标题与目录一字不差。
 * 封面标题在与目录重复时改用各 KP 名的公共前缀作概括课题(如「中国地理位置
 * 描述…」+「中国地理位置优越性分析」→「中国地理位置」);无 ≥4 字公共前缀时
 * 保持原样(不比现状差)。仅呈现层,不改数据,教师侧标题(courseDisplayTitle)
 * 仍列全知识点。
 */
export function coverDisplayTitle(course: Pick<MainlineCourse, 'topic' | 'sourceMaterial'>): string {
  const names = [...new Set(course.sourceMaterial
    .filter(source => Boolean(source.kpId))
    .map(source => source.title.trim())
    .filter(Boolean))]
  const full = courseDisplayTitle(course)
  if (names.length < 2) return full

  let prefix = names[0]!
  for (const name of names.slice(1)) {
    let common = 0
    while (common < prefix.length && common < name.length && prefix[common] === name[common]) common += 1
    prefix = prefix.slice(0, common)
  }
  // 去掉悬在结尾的连接符/半个括号
  prefix = prefix.replace(/[（(「、,，:：\s]+$/, '').trim()
  return prefix.length >= 4 ? prefix : full
}
