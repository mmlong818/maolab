// 阶段 2f 裁决 C（工具元话语）的定稿兜底：finalizeTutorTurn 之后、narration.say 与 done 之前清掉学生不该看到的两类文字。
// 1. 括号元话语：整段括号（全角或半角、不跨行）里含有精确短语时，整段删掉。只用短语，不用单词——"系统""记录"会误伤"消化系统""记录数据"。
//    括号里有问号（？/?）时一律不删：模型可能在旁白里顺带复述检查题（"（检查题已出：-1 和 -4 哪个大？）"），
//    删掉就丢了学生要回答的问题，内核的揭示判断与末句问题自动登记也看不到它。不做"只删前缀、保留问句"：
//    旁白与问句之间没有可靠的切分边界（冒号、逗号、破折号都可能），切错会留下半句旁白或残缺的题，整段保留更安全。
// 2. 漏进正文的工具语法（2f Task 3 实测 low 推理下 2/27 回合）：按已注册的工具名精确匹配
//    a. 整行只有工具名，或"工具名 + 一个小写单词参数"（实测形状 "set_stage diagnose"；skill 只认 "skill <已有 skill 名>"）。
//       不认括号/JSON/等号参数：词表里的 "skill (n.)"、"skill(s)"，代码行 "grade_answer = 5" 都不动；
//    b. XML 式伪调用块 <工具名 …>…</工具名>、自闭合 <工具名 …/>，以及 GLM 原生格式 <tool_call>工具名…</tool_call>。
//    只提到某个词的正文（"阶段""图示""render"……）不动。
// 删除后整行为空的行连同换行一起去掉，其余前后文与换行保持；反复清到不再变化（幂等）；全部删空则返回原文（emptyIfAll 时返回空串）。
// apps/api/scripts/realmodel-check.ts 按同一短语表与工具名计数（脚本不 import 本文件；
// finalize-chatter.test.ts 校验两边的表一致，realmodel-check-guard.test.ts 在同一组样本上校验两边的工具语法判定一致）。

/** 括号元话语的精确短语（2e 截图、2f Task 3 实测样本）；"登记好"只认与问题/检查题连用，"把实验数据登记好"不算 */
export const CHATTER_PHRASES: readonly string[] = [
  '问题登记好',
  '检查题登记好',
  '已经把问题登记',
  '已登记检查题',
  '检查题已登记',
  '检查题已出',
  '图示暂时没能显示',
  '图示没能显示',
  '图示没有通过校验',
  '没能通过校验',
  '会话已结束',
]

/** 导师可调用的全部工具名（tutor 白名单 + 记忆工具；与 apps/harness/tests/helpers/whitelist.ts 的 TUTOR_MEMORY_TOOLS 一致） */
export const TOOL_NAMES: readonly string[] = [
  'cite_resource', 'close_session', 'create_checkpoint', 'flag_safety', 'grade_answer', 'persist_memory',
  'recall_memory', 'record_teaching_event', 'render_visual', 'search_knowledge_points', 'set_stage', 'skill',
]
/** skill 是普通英文单词（英语课的词表里可能单独成行）：整行规则只认"skill + 已有的 skill 名" */
const SKILL_NAMES = ['checkpoint-design', 'safety-support', 'teaching-rules', 'visual-guide']

const MARK = '\u0000'
const BRACKET = /[（(][^（）()\n]*[）)]/g
const names = TOOL_NAMES.join('|')
const SNAKE = TOOL_NAMES.filter((n) => n.includes('_')).join('|')
const XML_BLOCK = new RegExp(`<(${names})(?:\\s[^<>]*)?>[\\s\\S]*?</\\1\\s*>`, 'g')
const XML_SELF = new RegExp(`<(?:${names})(?:\\s[^<>]*)?/>`, 'g')
const GLM_CALL = new RegExp(`<tool_call>\\s*(?:${names})\\b[\\s\\S]*?</tool_call>`, 'g')
const TOOL_LINE = new RegExp(`^\\s*\`?(?:(?:${SNAKE})(?:[ \\t]+[a-z][a-z0-9_-]*)?|skill[ \\t]+(?:${SKILL_NAMES.join('|')}))\`?\\s*$`)

const strippable = (segment: string): boolean => !/[？?]/.test(segment) && CHATTER_PHRASES.some((p) => segment.includes(p))

/** 一遍清理；没有命中时返回原字符串 */
function stripOnce(text: string): string {
  // 自闭合先于成对块：否则 "<render_visual />" 会被当成开标签，与后面真正的块之间的教学文字一起被吞
  let marked = text.replace(GLM_CALL, MARK).replace(XML_SELF, MARK).replace(XML_BLOCK, MARK)
  marked = marked.split('\n').map((line) => (TOOL_LINE.test(line) ? MARK : line)).join('\n')
  marked = marked.replace(BRACKET, (seg) => (strippable(seg) ? MARK : seg))
  if (!marked.includes(MARK)) return text
  return marked
    .split('\n')
    .filter((line) => !(line.includes(MARK) && line.split(MARK).join('').trim() === ''))
    .map((line) => line.split(MARK).join(''))
    .join('\n')
}

/** 定稿兜底：清除括号元话语与漏进正文的工具语法。反复清到不再变化（删掉一个块后，下一行可能才露出整行工具语法），因此幂等；
 *  没有命中时原样返回（同一个字符串）；全部删空则返回原文——emptyIfAll 时返回空串（终审 I-1：定稿据此走兜底，
 *  去重据此不把纯伪调用的一步当文字），调用方不能再把原始块交给学生 */
export function stripToolChatter(text: string, options: { emptyIfAll?: boolean } = {}): string {
  let out = text
  for (let i = 0; i < 8; i++) {
    const next = stripOnce(out)
    if (next === out) break
    out = next
  }
  if (out.trim() !== '') return out
  return options.emptyIfAll && out !== text ? '' : text
}
