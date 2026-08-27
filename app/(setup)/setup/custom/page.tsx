'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import StepConfig from './StepConfig'
import StepOutline from './StepOutline'
import type { SetupConfig, OutlineChunk } from '@maolab/setup'
import { generateOutline, savePlan } from '@/lib/actions/setup'

type Step = 'config' | 'outline'

export default function CustomSetupPage() {
  const [step, setStep] = useState<Step>('config')
  const [config, setConfig] = useState<SetupConfig | null>(null)
  const [chunks, setChunks] = useState<OutlineChunk[]>([])
  const [isGenerating, startGenerate] = useTransition()
  const [isSaving, startSave] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  function handleConfigDone(cfg: SetupConfig) {
    setConfig(cfg)
    setError(null)
    startGenerate(async () => {
      try {
        const generated = await generateOutline(cfg)
        setChunks(generated)
        setStep('outline')
      } catch (err) {
        setError(err instanceof Error ? err.message : '大纲生成失败，请重试')
      }
    })
  }

  function handleSave() {
    if (!config) return
    setError(null)
    startSave(async () => {
      try {
        const planId = await savePlan(config, chunks)
        router.push(`/generator/${planId}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : '保存失败，请重试')
      }
    })
  }

  return (
    <main className="mx-auto max-w-2xl py-12 px-4">
      <div className="flex items-center gap-2 mb-8 text-sm">
        <span className={step === 'config' ? 'font-bold text-blue-600' : 'text-gray-400'}>1. 配置</span>
        <span className="text-gray-300">→</span>
        <span className={step === 'outline' ? 'font-bold text-blue-600' : 'text-gray-400'}>2. 编辑大纲</span>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {step === 'config' && (
        <StepConfig onDone={handleConfigDone} isLoading={isGenerating} />
      )}

      {step === 'outline' && (
        <StepOutline
          chunks={chunks}
          onChange={setChunks}
          onSave={handleSave}
          isSaving={isSaving}
        />
      )}
    </main>
  )
}
