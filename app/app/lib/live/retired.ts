import { NextResponse } from 'next/server'

export const LIVE_CLASSROOM_RETIRED = {
  error: 'live classroom retired',
  message: '旧多人实时课堂已停用，请使用主线上课模式。',
  destination: '/mainline',
} as const

export function liveClassroomRetiredResponse() {
  return NextResponse.json(LIVE_CLASSROOM_RETIRED, {
    status: 410,
    headers: { 'Cache-Control': 'no-store' },
  })
}
