'use client'

/**
 * SongPlayer — 知识歌播放器（媒介化方向 A）
 *
 * 逐句 TTS 朗诵 + 卡拉OK 式高亮当前句; 副歌区分色。
 * 点"播放"从头念到尾, 当前句放大高亮并显示它在记哪个 KP。
 */

import { useCallback, useRef, useState } from 'react'
import type { SongPayload } from '@maolab/shared-types'
import { getClassroomTheme } from '../classroom-theme.js'
import { useTtsAudio } from '../../../../components/mainline/useTtsAudio.js'
import AspectStage from '../AspectStage.js'

export default function SongPlayer({ payload, title, subject }: {
  payload: SongPayload
  title: string
  subject?: string | undefined
}) {
  const theme = getClassroomTheme(subject)
  const tts = useTtsAudio()
  const [cur, setCur] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const stopRef = useRef(false)

  // 全曲句子序列(歌词 + 副歌追加在末尾)
  const seq = [
    ...payload.lines.map((l, i) => ({ text: l.text, kpHint: l.kpHint, isChorus: false, key: `l${i}` })),
    ...(payload.chorus ?? []).map((t, i) => ({ text: t, kpHint: undefined as string | undefined, isChorus: true, key: `c${i}` })),
  ]

  const playFrom = useCallback(async (start: number) => {
    stopRef.current = false
    setPlaying(true)
    for (let i = start; i < seq.length; i++) {
      if (stopRef.current) break
      setCur(i)
      await new Promise<void>(resolve => {
        void tts.play(seq[i]!.text, payload.voiceId ?? 'longxiaochun_v3', `song:${i}`, {
          onEnded: () => setTimeout(resolve, 350),
        })
      })
    }
    if (!stopRef.current) { setCur(-1); setPlaying(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seq, payload.voiceId])

  const stop = useCallback(() => { stopRef.current = true; tts.stop(); setPlaying(false); setCur(-1) }, [tts])

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* 功能条(画布外): 标题/体裁/播放控制 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 4px 10px', flexShrink: 0, maxWidth: 880, width: '100%', margin: '0 auto' }}>
        <span style={{ fontSize: 24 }}>🎵</span>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: theme.ink, fontFamily: theme.headingFont }}>{title}</span>
          <span style={{ fontSize: 12, color: theme.accent, fontWeight: 700, marginLeft: 10 }}>{payload.genre} · 跟着念，记得快</span>
        </div>
        <button
          onClick={() => (playing ? stop() : playFrom(0))}
          style={{ padding: '9px 20px', borderRadius: 999, border: 'none', background: theme.accent, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >{playing ? '⏸ 停' : '▶ 唱一遍'}</button>
      </div>

      {/* 16:9 教学画布: 歌词(课程内容)居中大字, 像歌词大屏 */}
      <AspectStage>
      <div style={{ width: '100%', height: '100%', overflow: 'auto', background: theme.stageBg, padding: '20px 48px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
        {seq.map((s, i) => {
          const active = i === cur
          return (
            <div
              key={s.key}
              onClick={() => playFrom(i)}
              style={{
                cursor: 'pointer',
                padding: active ? '12px 16px' : '7px 16px',
                borderRadius: 12,
                background: active ? (s.isChorus ? '#fef3c7' : theme.paper) : 'transparent',
                boxShadow: active ? '0 4px 16px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.3s ease-out',
                transform: active ? 'scale(1.02)' : 'scale(1)',
                borderLeft: s.isChorus ? `3px solid ${theme.accent}` : '3px solid transparent',
              }}
            >
              <div style={{
                fontSize: active ? (seq.length <= 10 ? 34 : 24) : (seq.length <= 10 ? 25 : 18),
                fontWeight: active ? 800 : (s.isChorus ? 700 : 500),
                color: active ? theme.accent : (s.isChorus ? '#92400e' : theme.ink),
                lineHeight: 1.6,
                textAlign: 'center',
                transition: 'all 0.3s',
              }}>
                {s.isChorus && <span style={{ fontSize: 11, marginRight: 8, opacity: 0.7 }}>副歌</span>}
                {s.text}
              </div>
              {active && s.kpHint && (
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>🎯 在记：{s.kpHint}</div>
              )}
            </div>
          )
        })}
      </div>
      </AspectStage>
    </div>
  )
}
