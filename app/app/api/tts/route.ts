import { type NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { WebSocket } from 'ws'
import {
  MAX_TTS_REQUEST_BYTES,
  parseAdditionalTtsVoiceIds,
  parseTtsRequestBody,
} from '@/lib/tts-request'

const DASHSCOPE_WS = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'
const DEFAULT_VOICE = 'longxiaochun_v3'
// 注: v3-plus 音质更好但仅 2 个音色(longanyang/longanhuan), 撑不起 4 位老师人设,
// 故 DashScope 默认留在 flash; 音质升级走 MiniMax 通道(配 MINIMAX_API_KEY 自动启用)
const TTS_MODEL = process.env.TTS_MODEL ?? 'cosyvoice-v3-flash'

// ===== MiniMax provider (配置 MINIMAX_API_KEY 即自动启用, 音质优先) =====
const MINIMAX_URL = process.env.MINIMAX_TTS_URL ?? 'https://api.minimaxi.com/v1/t2a_v2'
const MINIMAX_MODEL = process.env.MINIMAX_TTS_MODEL ?? 'speech-2.8-hd'
// 客户端仍传 DashScope 音色 id, 在此映射到 MiniMax 系统音色(按老师人设气质对齐)。
// 注意: 经典短 id (male-qn-* / female-*) 在 speech-2.8-hd 上时长异常(实测同文本忽 5s 忽 51s),
// 必须用新一代 "Chinese (Mandarin)_*" 系列。
const MINIMAX_VOICE_MAP: Record<string, string> = {
  longshuo_v3: 'Chinese (Mandarin)_Reliable_Executive', // 龙老师: 严谨务实男 → 沉稳高管
  longxiaochun_v3: 'Chinese (Mandarin)_Warm_Bestie',    // 晓梅老师: 亲切温暖女 → 温暖闺蜜
  longhua_v3: 'Chinese (Mandarin)_Gentleman',           // 陈教授: 沉稳带玩味 → 温润男声
  longxiaoxia_v3: 'Chinese (Mandarin)_Warm_Girl',       // 小李老师: 年轻活力女 → 温暖少女
  longyuan_v3: 'Chinese (Mandarin)_Male_Announcer',
}
const MINIMAX_DEFAULT_VOICE = 'Chinese (Mandarin)_Warm_Bestie'
const ENABLE_TTS_EMOTION = process.env.TTS_ENABLE_EMOTION === '1'
// 回退链默认开启, 课堂宁可音色降级也不能哑掉; 要严格保人设音色时显式设 '0' 关闭。
const ALLOW_PROVIDER_FALLBACK = process.env.TTS_ALLOW_PROVIDER_FALLBACK !== '0'
const ALLOW_LOCAL_FALLBACK = process.env.TTS_ALLOW_LOCAL_FALLBACK !== '0'
const ADDITIONAL_VOICE_IDS = parseAdditionalTtsVoiceIds(process.env.TTS_ALLOWED_VOICE_IDS)

function resolveProvider(): 'minimax' | 'dashscope' {
  const forced = process.env.TTS_PROVIDER
  if (forced === 'minimax' || forced === 'dashscope') return forced
  return process.env.MINIMAX_API_KEY ? 'minimax' : 'dashscope'
}

export async function POST(req: NextRequest) {
  const declaredLength = Number(req.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_TTS_REQUEST_BYTES) {
    return NextResponse.json({ error: 'request_too_large' }, { status: 413 })
  }

  let rawBody: string
  try {
    rawBody = await req.text()
  } catch {
    return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 })
  }
  if (Buffer.byteLength(rawBody, 'utf8') > MAX_TTS_REQUEST_BYTES) {
    return NextResponse.json({ error: 'request_too_large' }, { status: 413 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody) as unknown
  } catch {
    return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 })
  }
  const parsed = parseTtsRequestBody(body, { additionalVoiceIds: ADDITIONAL_VOICE_IDS })
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error.code, message: parsed.error.message }, { status: 400 })
  }
  const { text, voice, emotion } = parsed.value

  const provider = resolveProvider()
  try {
    let audioBuffer: Buffer
    if (provider === 'minimax') {
      const apiKey = process.env.MINIMAX_API_KEY
      if (!apiKey) return NextResponse.json({ error: 'MINIMAX_API_KEY missing' }, { status: 503 })
      const mmVoice = MINIMAX_VOICE_MAP[voice ?? ''] ?? voice ?? MINIMAX_DEFAULT_VOICE
      const emo = ENABLE_TTS_EMOTION && emotion && emotion !== 'neutral' ? emotion : undefined
      try {
        audioBuffer = await synthesizeMinimax(text, mmVoice, apiKey, emo)
      } catch (err) {
        const dashscopeKey = process.env.DASHSCOPE_API_KEY
        if (process.env.TTS_PROVIDER === 'minimax' || !dashscopeKey || !ALLOW_PROVIDER_FALLBACK) throw err
        console.warn('[TTS:minimax] falling back to DashScope:', err)
        const selectedVoice = voice ?? process.env.TTS_VOICE ?? DEFAULT_VOICE
        audioBuffer = await synthesize(text, selectedVoice, dashscopeKey)
      }
    } else {
      const apiKey = process.env.DASHSCOPE_API_KEY
      if (!apiKey) return NextResponse.json({ error: 'TTS not configured' }, { status: 503 })
      const selectedVoice = voice ?? process.env.TTS_VOICE ?? DEFAULT_VOICE
      audioBuffer = await synthesize(text, selectedVoice, apiKey)
    }
    return new NextResponse(audioBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audioBuffer.byteLength),
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error(`[TTS:${provider}] Error:`, err)
    if (!ALLOW_LOCAL_FALLBACK) {
      return NextResponse.json({ error: String(err), fallback: 'disabled-to-preserve-role-voice' }, { status: 502 })
    }
    try {
      const localAudio = synthesizeLocal(text)
      return new NextResponse(localAudio as unknown as BodyInit, {
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': String(localAudio.byteLength),
          'Cache-Control': 'no-store',
          'X-TTS-Fallback': 'windows-sapi',
        },
      })
    } catch (localErr) {
      console.error('[TTS:local] Error:', localErr)
      return NextResponse.json({ error: String(err), localFallbackError: String(localErr) }, { status: 500 })
    }
  }
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function synthesizeLocal(text: string): Buffer {
  if (process.platform !== 'win32') throw new Error('Local TTS fallback requires Windows')
  const id = randomUUID()
  const textPath = path.join(tmpdir(), `maolab-tts-${id}.txt`)
  const wavPath = path.join(tmpdir(), `maolab-tts-${id}.wav`)
  try {
    writeFileSync(textPath, text, 'utf8')
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      '$voice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like "zh-*" } | Select-Object -First 1',
      'if ($voice) { $synth.SelectVoice($voice.VoiceInfo.Name) }',
      '$synth.Rate = 0',
      '$synth.Volume = 100',
      `$text = [System.IO.File]::ReadAllText(${psQuote(textPath)}, [System.Text.Encoding]::UTF8)`,
      `$synth.SetOutputToWaveFile(${psQuote(wavPath)})`,
      '$synth.Speak($text)',
      '$synth.Dispose()',
    ].join('; ')
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30_000,
    })
    if (result.error || result.status !== 0) {
      throw new Error(result.error?.message || result.stderr || `PowerShell exited ${result.status}`)
    }
    const audio = readFileSync(wavPath)
    if (audio.byteLength < 1024) throw new Error('Local TTS produced empty audio')
    return audio
  } finally {
    for (const tempPath of [textPath, wavPath]) {
      try {
        rmSync(tempPath, { force: true })
      } catch (cleanupError) {
        console.warn('[TTS:local] Failed to remove temp file:', cleanupError)
      }
    }
  }
}

/** MiniMax T2A v2: POST JSON, 响应 data.audio 为 hex 编码 mp3。 */
async function synthesizeMinimax(text: string, voiceId: string, apiKey: string, emotion?: string): Promise<Buffer> {
  const groupId = process.env.MINIMAX_GROUP_ID
  const url = groupId ? `${MINIMAX_URL}?GroupId=${groupId}` : MINIMAX_URL
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL,
      text,
      stream: false,
      voice_setting: { voice_id: voiceId, speed: 1.0, vol: 1.0, pitch: 0, ...(emotion ? { emotion } : {}) },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`MiniMax HTTP ${res.status}`)
  const json = (await res.json()) as {
    data?: { audio?: string }
    base_resp?: { status_code?: number; status_msg?: string }
  }
  if (json.base_resp?.status_code !== 0) {
    throw new Error(`MiniMax error ${json.base_resp?.status_code}: ${json.base_resp?.status_msg}`)
  }
  const hex = json.data?.audio
  if (!hex) throw new Error('MiniMax empty audio')
  return Buffer.from(hex, 'hex')
}

function synthesize(text: string, voice: string, apiKey: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const taskId = randomUUID().replace(/-/g, '')
    const chunks: Buffer[] = []
    let settled = false

    const ws = new WebSocket(DASHSCOPE_WS, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })

    const done = (err?: Error) => {
      if (settled) return
      settled = true
      ws.close()
      if (err) return reject(err)
      resolve(Buffer.concat(chunks))
    }

    ws.on('open', () => {
      ws.send(JSON.stringify({
        header: { action: 'run-task', task_id: taskId, streaming: 'duplex' },
        payload: {
          task_group: 'audio', task: 'tts', function: 'SpeechSynthesizer',
          model: TTS_MODEL,
          parameters: { voice, format: 'mp3', sample_rate: 22050 },
          input: {},
        },
      }))
    })

    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        chunks.push(data)
        return
      }
      const msg = JSON.parse(data.toString()) as {
        header?: { event?: string; error_message?: string }
      }
      const event = msg.header?.event
      if (event === 'task-started') {
        ws.send(JSON.stringify({
          header: { action: 'continue-task', task_id: taskId, streaming: 'duplex' },
          payload: { input: { text } },
        }))
        ws.send(JSON.stringify({
          header: { action: 'finish-task', task_id: taskId, streaming: 'duplex' },
          payload: { input: {} },
        }))
      } else if (event === 'task-finished') {
        done()
      } else if (event === 'task-failed') {
        done(new Error(msg.header?.error_message ?? 'TTS failed'))
      }
    })

    ws.on('error', (e: Error) => done(e))
    ws.on('close', () => done())

    // 超时保护
    setTimeout(() => done(new Error('TTS timeout')), 30_000)
  })
}
