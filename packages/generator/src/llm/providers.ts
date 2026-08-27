export type ProviderId = 'openai' | 'anthropic' | 'deepseek' | 'qwen' | 'claude-cli'

export interface ProviderConfig {
  adapterType: 'openai' | 'anthropic' | 'claude-cli'
  defaultBaseUrl?: string
}

export const PROVIDERS: Record<ProviderId, ProviderConfig> = {
  openai: {
    adapterType: 'openai',
  },
  anthropic: {
    adapterType: 'anthropic',
  },
  deepseek: {
    adapterType: 'openai',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
  },
  qwen: {
    adapterType: 'openai',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  'claude-cli': {
    adapterType: 'claude-cli',
  },
}

export function parseModelString(model: string): { providerId: ProviderId; modelId: string } {
  const colonIdx = model.indexOf(':')
  if (colonIdx > 0) {
    const pid = model.slice(0, colonIdx)
    if (!(pid in PROVIDERS)) {
      throw new Error(
        `Unknown provider: ${pid}. Supported: ${Object.keys(PROVIDERS).join(', ')}`,
      )
    }
    return { providerId: pid as ProviderId, modelId: model.slice(colonIdx + 1) }
  }
  return { providerId: 'openai', modelId: model }
}
