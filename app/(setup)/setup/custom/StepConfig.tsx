'use client'

import { useState } from 'react'
import type { SetupConfig } from '@maolab/setup'

interface Props {
  onDone: (config: SetupConfig) => void
  isLoading: boolean
}

export default function StepConfig({ onDone, isLoading }: Props) {
  const [form, setForm] = useState<SetupConfig>({
    topic: '',
    style: 'lecture',
    language: 'zh-CN',
    difficulty: 'intermediate',
    agentCount: 2,
    teachingMethod: 'standard',
  })

  function set<K extends keyof SetupConfig>(key: K, value: SetupConfig[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.topic.trim()) return
    onDone(form)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <h2 className="text-xl font-semibold">配置教学参数</h2>

      <div>
        <label className="block text-sm font-medium mb-1">教学主题 *</label>
        <input
          type="text"
          value={form.topic}
          onChange={e => set('topic', e.target.value)}
          placeholder="例如：相对论基础"
          className="w-full border rounded px-3 py-2 text-sm"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">教学风格</label>
          <select value={form.style} onChange={e => set('style', e.target.value as SetupConfig['style'])} className="w-full border rounded px-3 py-2 text-sm">
            <option value="lecture">讲授式</option>
            <option value="socratic">苏格拉底式</option>
            <option value="project">项目式</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">难度</label>
          <select value={form.difficulty} onChange={e => set('difficulty', e.target.value as SetupConfig['difficulty'])} className="w-full border rounded px-3 py-2 text-sm">
            <option value="beginner">入门</option>
            <option value="intermediate">中级</option>
            <option value="advanced">高级</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">语言</label>
          <select value={form.language} onChange={e => set('language', e.target.value)} className="w-full border rounded px-3 py-2 text-sm">
            <option value="zh-CN">中文（简体）</option>
            <option value="en-US">English</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">AI 智能体数量</label>
          <select value={form.agentCount} onChange={e => set('agentCount', Number(e.target.value))} className="w-full border rounded px-3 py-2 text-sm">
            {[1, 2, 3, 4, 5].map(n => (
              <option key={n} value={n}>{n} 个</option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading || !form.topic.trim()}
        className="w-full bg-blue-600 text-white rounded py-2 text-sm font-medium disabled:opacity-50"
      >
        {isLoading ? 'AI 生成大纲中…' : '下一步：生成大纲'}
      </button>
    </form>
  )
}
