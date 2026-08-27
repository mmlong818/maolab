'use client'

import type { OutlineChunk } from '@maolab/setup'
import OutlineItemRow from './OutlineItemRow'

interface Props {
  chunks: OutlineChunk[]
  onChange: (chunks: OutlineChunk[]) => void
  onSave: () => void
  isSaving: boolean
}

export default function StepOutline({ chunks, onChange, onSave, isSaving }: Props) {
  function updateChunk(index: number, patch: Partial<OutlineChunk>) {
    onChange(chunks.map((c, i) => i === index ? { ...c, ...patch } : c))
  }

  function removeChunk(index: number) {
    onChange(chunks.filter((_, i) => i !== index))
  }

  function addChunk() {
    const next: OutlineChunk = {
      index: chunks.length,
      title: '新章节',
      sceneType: 'slide',
      objective: '',
      durationHint: 180,
    }
    onChange([...chunks, next])
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">编辑大纲</h2>
        <span className="text-xs text-gray-400">{chunks.length} 个章节</span>
      </div>

      <div className="space-y-2">
        {chunks.map((chunk, i) => (
          <OutlineItemRow
            key={i}
            chunk={chunk}
            onUpdate={patch => updateChunk(i, patch)}
            onRemove={() => removeChunk(i)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={addChunk}
        className="text-sm text-blue-600 hover:underline"
      >
        + 添加章节
      </button>

      <button
        onClick={onSave}
        disabled={isSaving || chunks.length === 0}
        className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium disabled:opacity-50 mt-4"
      >
        {isSaving ? '保存中…' : '确认大纲，开始生成内容'}
      </button>
    </div>
  )
}
