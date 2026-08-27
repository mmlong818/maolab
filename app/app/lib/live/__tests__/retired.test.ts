import { describe, expect, it } from 'vitest'
import { POST as startLive } from '../../../api/v2/live/start/route.js'
import { POST as advanceLive } from '../../../api/v2/live/[sessionId]/advance/route.js'
import { GET as readLiveAtom } from '../../../api/v2/live/[sessionId]/atom/route.js'
import { POST as endLive } from '../../../api/v2/live/[sessionId]/end/route.js'
import { POST as joinLive } from '../../../api/v2/live/[sessionId]/join/route.js'
import {
  PATCH as resolveLiveQuestion,
  POST as askLiveQuestion,
} from '../../../api/v2/live/[sessionId]/question/route.js'
import { GET as subscribeLive } from '../../../api/v2/live/[sessionId]/sse/route.js'
import { LIVE_CLASSROOM_RETIRED, liveClassroomRetiredResponse } from '../retired.js'

const retiredRouteHandlers = [
  ['POST /api/v2/live/start', startLive],
  ['POST /api/v2/live/[sessionId]/advance', advanceLive],
  ['GET /api/v2/live/[sessionId]/atom', readLiveAtom],
  ['POST /api/v2/live/[sessionId]/end', endLive],
  ['POST /api/v2/live/[sessionId]/join', joinLive],
  ['POST /api/v2/live/[sessionId]/question', askLiveQuestion],
  ['PATCH /api/v2/live/[sessionId]/question', resolveLiveQuestion],
  ['GET /api/v2/live/[sessionId]/sse', subscribeLive],
] as const

describe('live classroom retired response', () => {
  it('明确返回 410 并引导到主线课程库', async () => {
    const response = liveClassroomRetiredResponse()

    expect(response.status).toBe(410)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual(LIVE_CLASSROOM_RETIRED)
  })

  it.each(retiredRouteHandlers)('%s 已固定为停用响应', async (_route, handler) => {
    const response = handler()

    expect(response.status).toBe(410)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.json()).toEqual(LIVE_CLASSROOM_RETIRED)
  })
})