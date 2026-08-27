import type { Scene, TeachingMethod } from '@maolab/shared-types'
import type { ContentWorker } from './types.js'

export class WorkerRegistry {
  private readonly workers = new Map<Scene['type'], ContentWorker>()

  register(worker: ContentWorker): void {
    this.workers.set(worker.type, worker)
  }

  resolve(sceneType: Scene['type'], method: TeachingMethod): ContentWorker {
    const worker = this.workers.get(sceneType)
    if (!worker) {
      throw new Error(
        `No worker registered for sceneType="${sceneType}" method="${method}". ` +
        `Registered: ${[...this.workers.keys()].join(', ')}`,
      )
    }
    return worker
  }
}
