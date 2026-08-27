/**
 * 章节树 (tree) 和 国家课资源 (national_lesson) 的类型
 *
 * 数据来源:
 *   章节树: https://s-file-1.ykt.cbern.com.cn/zxx/ndrv2/national_lesson/trees/{textbookId}.json
 *   资源包: https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/national_lesson/teachingmaterials/{textbookId}/resources/part_*.json
 */

/**
 * Anderson & Krathwohl (2001) 修订版布鲁姆分类——知识维度
 * TODO(phase-a): 引入 @maolab/shared-types 之后改为 import 复用
 * 当前内联以避免 textbook-index 反向依赖未稳定的下游类型
 */
export type KnowledgeType = 'factual' | 'conceptual' | 'procedural' | 'metacognitive'

/**
 * 单条标注的通用包装。所有 annotator 输出统一形态，便于追溯、复核、按版本重打。
 *
 *   value           标注主值（类型由 annotator 决定）
 *   source          来源：llm 自动 / 人工 / 人工复核过的 LLM
 *   confidence?     置信度 [0,1]；人工标注可省略
 *   labeledAt       ms timestamp
 *   annotatorName   annotator 标识，如 "knowledge-type"
 *   annotatorVersion 语义化版本字符串，如 "v1.0.0"——升级 prompt / 规则要 bump
 *   model?          LLM 模型字符串
 *   reasoning?      LLM 判断依据 / 人工备注
 */
export interface Annotation<T> {
  value: T
  source: 'llm' | 'human' | 'human-verified'
  confidence?: number
  labeledAt: number
  annotatorName: string
  annotatorVersion: string
  model?: string
  reasoning?: string
}

/**
 * 章节节点的标注容器——可扩展。
 * 新增 annotator 只需在此 interface 加一个 optional 字段，不破坏旧数据。
 */
export interface ChapterAnnotations {
  /** Anderson & Krathwohl 知识维度——Phase A B 路线核心字段 */
  knowledgeType?: Annotation<KnowledgeType>
  /** 难度评级 0~1（占位，待 DifficultyAnnotator 落地） */
  difficulty?: Annotation<number>
  /** 前置知识依赖：chapter id 列表（占位） */
  prerequisites?: Annotation<string[]>
  /** 考点权重 0~1（占位） */
  examWeight?: Annotation<number>
  /** 时长估算（分钟，占位） */
  estimatedMinutes?: Annotation<number>
  /** 跨学科链接（占位） */
  crossSubjectLinks?: Annotation<string[]>
  /**
   * v1.1 起：本节关联的 KnowledgePoint id 列表（additive，不破坏旧数据）。
   * 旧的内嵌 knowledgeType 等字段过渡期仍兼容；KP 才是独立实体。
   */
  knowledgePointIds?: string[]
}

export interface ChapterNode {
  id: string
  title: string
  rich_title?: string
  description?: string | null
  chapter_type?: string | null
  language?: string
  node_path?: string
  tree_id?: string
  custom_properties?: { tree_type?: string }
  child_nodes?: ChapterNode[]
  /** 可扩展标注容器；叶子节点才会被标 */
  annotations?: ChapterAnnotations
}

/** 一节"国家课"(national_lesson) — 一份国家级专家做的教学资源包 */
export interface NationalLesson {
  id: string
  title: string
  resource_type_code: 'national_lesson'
  /** 关联到教材的章节(可能多条) */
  chapter_ids: string[]
  chapter_paths: string[]
  /** 主讲教师 */
  teacher_list?: Array<{ id: string; name: string; intro?: string | null }>
  /** 教研顾问(正高级居多) */
  faculty_advisor_list?: Array<{ id: string; name: string; intro?: string | null }>
  provider_list?: Array<{ id: string; name: string }>
  producer_list?: Array<{ id: string; name: string }>
  /** 子资源列表 (5 类: 微课/课件/教学设计/学习任务/课后练习) */
  relations?: {
    national_course_resource?: SubResource[]
  }
  status?: string
}

export type SubResourceType =
  | 'micro_lesson_video'
  | 'coursewares'
  | 'lesson_plandesign'
  | 'learning_task'
  | 'after_class_exercise'

export interface SubResource {
  id: string
  resource_type_code: SubResourceType
  resource_type_code_name?: string
  global_title?: { 'zh-CN'?: string }
  /** 预览图: { Slide1: url, Slide2: url, ... } */
  custom_properties?: {
    preview?: Record<string, string>
  }
  ti_items?: Array<{
    ti_format?: string
    ti_storages?: string[]
  }>
}

/** A-2 入库结构: 单本教材的完整章节 + 资源映射 */
export interface TextbookFullInfo {
  textbookId: string
  textbookTitle: string
  syncedAt: number
  /** 嵌套章节树 */
  chapterTree: ChapterNode[]
  /** 国家课列表 (每条关联到 chapter_ids) */
  nationalLessons: NationalLesson[]
}
