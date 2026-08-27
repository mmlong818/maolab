import XAPI from '@xapi/xapi'
import type { Statement } from '@xapi/xapi'

export interface SceneCompletedParams {
  activityId: string
  activityTitle: string
  sceneType: string
  success: boolean
  score?: number
}

function buildStatement(params: SceneCompletedParams): Statement {
  const { activityId, activityTitle, sceneType, success, score } = params

  const verb = success ? XAPI.Verbs.PASSED : XAPI.Verbs.FAILED

  const statement: Statement = {
    actor: {
      objectType: 'Agent',
      account: {
        homePage: 'https://maolab.app',
        name: 'anonymous',
      },
    },
    verb,
    object: {
      objectType: 'Activity',
      id: activityId,
      definition: {
        name: { 'en-US': activityTitle },
        extensions: {
          'https://maolab.app/xapi/extensions/scene-type': sceneType,
        },
      },
    },
    ...(score !== undefined
      ? {
          result: {
            success,
            score: {
              scaled: score,
            },
          },
        }
      : { result: { success } }),
  }

  return statement
}

export async function reportSceneCompleted(
  params: SceneCompletedParams
): Promise<void> {
  const endpoint =
    typeof process !== 'undefined'
      ? process.env['NEXT_PUBLIC_LRS_ENDPOINT']
      : undefined

  if (!endpoint) {
    return
  }

  const auth =
    typeof process !== 'undefined'
      ? process.env['NEXT_PUBLIC_LRS_AUTH']
      : undefined

  const xapi = new XAPI({
    endpoint,
    ...(auth ? { auth: `Basic ${auth}` } : {}),
  })

  const statement = buildStatement(params)

  await xapi.sendStatement({ statement })
}
