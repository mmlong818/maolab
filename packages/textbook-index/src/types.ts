/**
 * 教材条目 (Textbook Entry)
 *
 * 来源: 国家中小学智慧教育平台 CDN
 * tag_list 用 tag_dimension_id 区分维度:
 *  - tagView         = 教材类型 (教材 / 教辅 / 课外读物)
 *  - zxxbb           = 版本 (统编版 / 人教版 / 北师大版…)
 *  - zxxcc           = 册 (上册 / 下册 / 全一册)
 *  - zxxnj           = 年级 (一年级 / 八年级 / 高一 / 选修…)
 *  - zxxxd / stage   = 学段 (小学 / 初中 / 高中)
 *  - zxxxk / subject = 学科 (语文 / 数学 / 物理 / 道德与法治…)
 */

export type K12Stage = '小学' | '初中' | '高中'

export interface TextbookEntry {
  /** 教材 UUID (用于拉 PDF / 预览图) */
  id: string
  /** 中文标题 */
  title: string
  /** 学段 */
  stage: K12Stage
  /** 学科 */
  subject: string
  /** 版本 (统编版 / 人教版 等) */
  version: string
  /** 年级 */
  grade: string
  /** 册 */
  volume: string
  /** 出版社 */
  publisher: string
  /** 每页预览 jpg URL: { Slide1: url, Slide2: url, ... } */
  previewUrls: Record<string, string>
  /** 上线时间 (ISO) */
  onlineAt?: string
  /** 索引同步时间 (ms) */
  syncedAt: number
}

export interface TextbookIndex {
  /** 索引版本 (CDN module_version 透传) */
  moduleVersion: number
  syncedAt: number
  entries: TextbookEntry[]
}

export interface SearchQuery {
  stage?: K12Stage
  subject?: string
  version?: string
  grade?: string
  volume?: string
  /** 子串模糊匹配 title */
  q?: string
}
