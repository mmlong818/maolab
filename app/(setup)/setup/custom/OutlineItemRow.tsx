'use client'

import type { OutlineChunk } from '@maolab/setup'

interface Props {
  chunk: OutlineChunk
  onUpdate: (patch: Partial<OutlineChunk>) => void
  onRemove: () => void
}

const SCENE_OPTIONS: { value: OutlineChunk['sceneType']; label: string }[] = [
  { value: 'slide', label: '幻灯片' },
  { value: 'quiz', label: '测验' },
  { value: 'interactive', label: '互动/项目' },
]

export default function OutlineItemRow({ chunk, onUpdate, onRemove }: Props) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className="flex-1 space-y-2">
        <input
          value={chunk.title}
          onChange={e => onUpdate({ title: e.target.value })}
          className="w-full text-sm font-medium border-b border-transparent focus:border-gray-300 focus:outline-none"
          placeholder="章节标题"
        />
        <input
          value={chunk.objective}
          onChange={e => onUpdate({ objective: e.target.value })}
          className="w-full text-xs text-gray-500 border-b border-transparent focus:border-gray-300 focus:outline-none"
          placeholder="学习目标"
        />
      </div>

      <div className="flex items-center gap-2">
        <select
          value={chunk.sceneType}
          onChange={e => onUpdate({ sceneType: e.target.value as OutlineChunk['sceneType'] })}
          className="text-xs border rounded px-2 py-1"
        >
          {SCENE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-gray-400 hover:text-red-500"
          aria-label="删除"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
