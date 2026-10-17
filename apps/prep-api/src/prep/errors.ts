// /api/prep/* 对浏览器的固定错误体（中文文案 + 固定码；门面的失败另走 failureBody）
export const PREP_ERRORS = {
  unavailable: { error: '备课需要登录账号。', code: 'PREP_UNAVAILABLE' },
  notEnabled: { error: '备课功能还没有对你的账号开放。', code: 'PREP_NOT_ENABLED' },
  notFound: { error: '没有找到。', code: 'NOT_FOUND' },
  credential: { error: '备课助理要用你自己的云一账号调用模型：请用云一账号登录后再试。', code: 'PREP_CREDENTIAL_REQUIRED' },
  turnRunning: { error: '备课助理正在处理上一条消息，完成后再改课程。', code: 'PREP_TURN_RUNNING' },
  queueFull: { error: '排队的消息太多了，请等前面的处理完再发。', code: 'PREP_QUEUE_FULL' },
  busy: { error: '这条消息还在处理中。', code: 'PREP_RUN_IN_PROGRESS' },
  bodyInvalid: { error: '请求内容不正确。', code: 'BODY_INVALID' },
  requestKeyConflict: { error: '这个请求编号已经用于别的课程或操作，请刷新后重试。', code: 'REQUEST_KEY_CONFLICT' },
  failed: { error: '操作没有完成，请稍后重试。', code: 'PREP_FAILED' },
} as const
