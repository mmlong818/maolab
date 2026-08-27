import { mkdir, writeFile, unlink } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import type { MediaRepository } from './types.js'

export function createLocalMediaRepository(baseDir: string): MediaRepository {
  return {
    async save(filename: string, buffer: Buffer, _mimeType: string): Promise<string> {
      const filePath = join(baseDir, filename)
      await mkdir(dirname(filePath), { recursive: true })
      await writeFile(filePath, buffer)
      return `/api/media/${filename}`
    },

    async getUrl(filename: string): Promise<string> {
      return `/api/media/${filename}`
    },

    async delete(filename: string): Promise<void> {
      const filePath = join(baseDir, filename)
      await unlink(filePath).catch(() => undefined)
    },
  }
}
