'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { quickDecideAndSave } from '@/lib/actions/setup'

export default function QuickSetupPage() {
  const [topic, setTopic] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!topic.trim()) return
    setError(null)
    startTransition(async () => {
      try {
        const planId = await quickDecideAndSave(topic.trim())
        router.push(`/generator/${planId}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : '生成失败，请重试')
      }
    })
  }

  return (
    <main className="mx-auto max-w-lg py-16 px-4">
      <h1 className="text-2xl font-bold mb-2">快速开始</h1>
      <p className="text-sm text-gray-500 mb-8">
        输入你想教授的主题，AI 会根据你的学习画像自动决策教学方案。
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">教学主题</label>
          <input
            type="text"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="例如：牛顿三定律、Git 分支管理、光合作用"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isPending}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={isPending || !topic.trim()}
          className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
        >
          {isPending ? 'AI 分析中…' : '生成教学方案'}
        </button>
      </form>
    </main>
  )
}
