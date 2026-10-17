// skills 只读提供方在 @maolab-core/harness；这里只把目录固定为本 bundle 的 skills/（随镜像发布）。
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply as applyCore, loadSkill as loadCore, type SkillsConfig } from '@maolab-core/harness/skills'

export { parseSkillFile, type SkillFile, type SkillsConfig } from '@maolab-core/harness/skills'
export const name = 'yunyi-skills'
export const inject = ['skills']
export const SKILLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills')

export const loadSkill = (skillName: string, dir: string = SKILLS_DIR) => loadCore(skillName, dir)

export function apply(ctx: Parameters<typeof applyCore>[0], config: SkillsConfig = {}): void {
  applyCore(ctx, { ...config, dir: config.dir ?? SKILLS_DIR })
}
