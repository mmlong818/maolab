// ─── Provider 预设（纯数据，client+server 都可 import）────────────────────────

export type ProviderId = 'anthropic' | 'openai-compat' | 'claude-cli';

export interface ProviderConfig {
  provider: ProviderId;
  model: string;
  apiKey?: string;
  baseURL?: string;
}

export interface ProviderPreset {
  id: string;
  label: string;
  provider: ProviderId;
  baseURL?: string;
  defaultModel: string;
  modelExamples: string[];
  signupURL?: string;
  /** 仅本地可用（部署版隐藏） */
  localOnly?: boolean;
  note?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'claude-cli',
    label: 'Claude CLI 订阅（本地）',
    provider: 'claude-cli',
    defaultModel: '(由 CLI 选择)',
    modelExamples: [],
    localOnly: true,
    note: '调用本地 claude 命令，复用你的 Claude Code 订阅，不消耗 API 额度。仅本地运行可用。',
  },
  {
    id: 'anthropic',
    label: 'Anthropic 官方',
    provider: 'anthropic',
    defaultModel: 'claude-sonnet-4-6',
    modelExamples: ['claude-sonnet-4-6', 'claude-opus-4-7', 'claude-haiku-4-5'],
    signupURL: 'https://console.anthropic.com/settings/keys',
    note: '主力 sonnet-4-6；复杂推理用 opus-4-7；高频轻量用 haiku-4-5',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    provider: 'openai-compat',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.4',
    modelExamples: ['gpt-5.4', 'gpt-5.5', 'gpt-5.4-mini', 'o3', 'o4-mini'],
    signupURL: 'https://platform.openai.com/api-keys',
    note: '主力 gpt-5.4；旗舰 gpt-5.5；推理用 o3 / o4-mini',
  },
  {
    id: 'gemini',
    label: 'Google Gemini（OpenAI 兼容）',
    provider: 'openai-compat',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-pro',
    modelExamples: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview'],
    signupURL: 'https://aistudio.google.com/apikey',
    note: '生产用 2.5；最新预览 3.1-pro / 3-flash',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    provider: 'openai-compat',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
    modelExamples: ['deepseek-v4-flash', 'deepseek-v4-pro'],
    signupURL: 'https://platform.deepseek.com/api_keys',
    note: '通用 v4-flash；推理 v4-pro。旧别名 deepseek-chat / reasoner 2026-07-24 弃用',
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    provider: 'openai-compat',
    baseURL: 'https://api.x.ai/v1',
    defaultModel: 'grok-4.3',
    modelExamples: ['grok-4.3', 'grok-4.20-reasoning', 'grok-3-mini-fast'],
    signupURL: 'https://console.x.ai',
    note: '旗舰 grok-4.3；推理 grok-4.20-reasoning',
  },
  {
    id: 'mistral',
    label: 'Mistral',
    provider: 'openai-compat',
    baseURL: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    modelExamples: ['mistral-large-latest', 'mistral-medium-2505', 'codestral-latest'],
    signupURL: 'https://console.mistral.ai/api-keys',
    note: '旗舰 large-latest；代码 codestral-latest',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter（多模型聚合）',
    provider: 'openai-compat',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: 'anthropic/claude-sonnet-4-6',
    modelExamples: [
      'anthropic/claude-sonnet-4-6',
      'anthropic/claude-opus-4-7',
      'openai/gpt-5.4',
      'openai/gpt-5.5',
      'google/gemini-2.5-pro',
      'deepseek/deepseek-v4-flash',
      'x-ai/grok-4.3',
    ],
    signupURL: 'https://openrouter.ai/keys',
    note: '一个 key 用所有模型，按 token 计费',
  },
  {
    id: 'moonshot',
    label: '月之暗面 Kimi',
    provider: 'openai-compat',
    baseURL: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-32k',
    modelExamples: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
    signupURL: 'https://platform.moonshot.cn/console/api-keys',
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    provider: 'openai-compat',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4.5',
    modelExamples: ['glm-4.5', 'glm-4.5-air', 'glm-4-plus'],
    signupURL: 'https://open.bigmodel.cn/usercenter/apikeys',
  },
  {
    id: 'qwen',
    label: '通义千问 Qwen',
    provider: 'openai-compat',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-max',
    modelExamples: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen3-max'],
    signupURL: 'https://dashscope.console.aliyun.com/apiKey',
  },
  {
    id: 'custom',
    label: '自定义 baseURL',
    provider: 'openai-compat',
    baseURL: '',
    defaultModel: '',
    modelExamples: [],
    note: '任何 OpenAI 兼容协议的服务',
  },
];
