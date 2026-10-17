export const withWhoami = (names: readonly string[]): string[] => [...names, 'whoami'].sort()
// prep 给模型的工具白名单（字母序）：15 个备课工具 + skill。与 @maolab/prep-bundle/tools-prep 的 PREP_TOOL_NAMES 同步
export const PREP_TOOLS: readonly string[] = ['accept_course', 'accept_page', 'approve_plan', 'audit_course', 'audit_page', 'export_pptx', 'generate_page', 'list_courses', 'plan_course', 'prep_brief', 'read_course', 'rehearse', 'render_page', 'repair_page', 'revise_course', 'skill']
