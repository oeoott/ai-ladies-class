// Every learning call resolves to null when the server is unset, slow or failing; callers keep the local data.
// Guardian calls resolve to { status, data }: status 0 means no server answer.
const TIMEOUT_MS = 5000

const toCamel = (key) => key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
const toSnake = (key) => key.replace(/[A-Z]/g, (letter) => '_' + letter.toLowerCase())

function convertKeys(value, convert) {
  if (Array.isArray(value)) return value.map((item) => convertKeys(item, convert))
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [convert(key), convertKeys(item, convert)]))
}

const deviceLearner = () => ({ childId: null, token: null })

export function createApi(base, { send = globalThis.fetch, timeout = TIMEOUT_MS, learner = deviceLearner } = {}) {
  const root = (base ?? '').trim().replace(/\/+$/, '')

  async function call(method, path, { body, token, limit = timeout } = {}) {
    if (!root || typeof send !== 'function') return { status: 0, data: null }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), limit)
    const headers = {}
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    if (token) headers.Authorization = 'Bearer ' + token
    try {
      const response = await send(root + path, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(convertKeys(body, toSnake)) } : {}),
        signal: controller.signal,
      })
      let data = null
      try {
        data = convertKeys(await response.json(), toCamel)
      } catch {
        data = null
      }
      return { status: response.status, data: response.ok ? data : null }
    } catch {
      return { status: 0, data: null }
    } finally {
      clearTimeout(timer)
    }
  }

  // Learning requests follow the device/profile rule (guardian.js). The learner is
  // - { childId, token }: send now
  // - null: skip and keep local
  // - a Promise while this device's records are being linked: wait, then send with what it resolves to
  //   (profile id and token when the link worked, the device id when it failed).
  const LATE = Symbol('late')
  async function whoFor(limit) {
    const value = learner()
    if (!value || typeof value.then !== 'function' || limit === undefined) return value
    let timer
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve(LATE), limit) })
    try {
      return await Promise.race([value, late])
    } finally {
      clearTimeout(timer)
    }
  }

  // reply: the screen waits for the answer (talk), so waiting for the link counts toward the same timeout
  // and the request is dropped if the link is not done in time. Other calls are records nobody waits for.
  async function learn(request, { reply = false } = {}) {
    const began = Date.now()
    const who = await whoFor(reply ? timeout : undefined)
    if (!who || who === LATE) return null
    const { path, body = {} } = typeof request === 'function' ? request(who) : request
    if (!path) return null
    const limit = reply ? Math.max(0, timeout - (Date.now() - began)) : timeout
    const result = await call('POST', path, { body, token: who.token, limit })
    return result.data
  }
  const post = (path, body) => learn({ path, body })

  const id = encodeURIComponent
  const query = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()

  return {
    enabled: Boolean(root),
    // 공통 산책
    startWalk: ({ childId, topicId, level, day, review = false }) => learn((who) => (
      { path: '/walks', body: { childId: childId ?? who.childId, topicId, level, day, review } }
    )),
    stopWalk: (walkId) => post(`/walks/${id(walkId)}/stop`),
    completeWalk: (walkId) => post(`/walks/${id(walkId)}/complete`),
    // 레벨 테스트 (보내기만 하고 기다리지 않는다)
    savePlacement: ({ answers, level }) => learn((who) => (
      { path: who.childId ? `/children/${id(who.childId)}/placement` : null, body: { answers, level } }
    )),
    // 학습 1 감정 탐색
    answerEmotion: (walkId, { selected, usedHint = false }) => post(`/lessons/emotion/walks/${id(walkId)}/answer`, { selected, usedHint }),
    // 학습 2 표정 거울
    // 요약 값만 보낸다 (영상·얼굴 특징·blendshape 값은 보내지 않음, 서버도 받지 않음)
    recordMirror: (walkId, {
      mode, score = null, skipped = false, scoreVersion = null, stars = null, trackedSec = null, attempts = null,
      endReason = null,
    }) => post(`/lessons/mirror/walks/${id(walkId)}/record`, {
      mode, score, skipped, scoreVersion, stars, trackedSec, attempts, endReason,
    }),
    // 학습 3 동화·대화 (대화 시작·턴은 화면이 답을 기다린다)
    pickStoryAction: (walkId, actionIndex) => post(`/lessons/story/walks/${id(walkId)}/action`, { actionIndex }),
    // actionIndex: 화면에서 지금 고른 행동. 행동 저장(pickStoryAction)이 늦거나 실패해도 대화가 이 행동으로 시작한다
    startTalk: (walkId, { character, actionIndex } = {}) => (
      learn({
        path: `/lessons/story/walks/${id(walkId)}/talk`,
        body: { ...(character ? { character } : {}), ...(Number.isInteger(actionIndex) ? { actionIndex } : {}) },
      }, { reply: true })
    ),
    sendTalkTurn: (conversationId, { choiceIndex = null, text = null, inputMode = 'picture' }) => (
      learn({ path: `/conversations/${id(conversationId)}/turn`, body: { choiceIndex, text, inputMode } }, { reply: true })
    ),
    endTalk: (conversationId) => post(`/conversations/${id(conversationId)}/end`),
    // Azure Speech: 서버에 설정이 있는지, 그리고 10분짜리 토큰 (키는 서버에만). 실패하면 null → 기존 방식으로
    speechStatus: async () => (root ? (await call('GET', '/speech/status', {})).data : null),
    speechToken: () => learn((who) => ({ path: '/speech/token', body: { childId: who.childId } }), { reply: true }),

    // 보호자 화면: 항상 보호자 토큰을 붙인다
    signup: (email, password) => call('POST', '/auth/signup', { body: { email, password } }),
    login: (email, password) => call('POST', '/auth/login', { body: { email, password } }),
    me: (token) => call('GET', '/me', { token }),
    listChildren: (token) => call('GET', '/children', { token }),
    createChild: (token, { nickname, character }) => call('POST', '/children', { body: { nickname, character }, token }),
    // 숲 친구 꾸미기 완료 → 아이 별명·캐릭터 (보내기만 한다)
    updateChild: (token, childId, { nickname, character }) => (
      call('PATCH', `/children/${id(childId)}`, { body: { nickname, character }, token })
    ),
    // 탈퇴: 비밀번호를 다시 보내 확인한다. 틀리면 403
    deleteAccount: (token, password) => call('DELETE', '/me', { body: { password }, token }),
    linkDevice: (token, childId, deviceChildId) => (
      call('POST', `/children/${id(childId)}/link-device`, { body: { deviceChildId }, token })
    ),
    report: (token, childId, { from, to } = {}) => (
      call('GET', `/children/${id(childId)}/report?${query({ from, to })}`, { token })
    ),
    // Walks per month for the last `months` months ending at `to` ("2026-11"): data.months [{month, walks}]
    monthly: (token, childId, { to, months = 6 } = {}) => (
      call('GET', `/children/${id(childId)}/report/monthly?${query({ to, months })}`, { token })
    ),
  }
}

let learnerSource = deviceLearner
export const api = createApi(import.meta.env?.VITE_API_URL, { learner: () => learnerSource() })

// App sets this once so learning calls pick the device or profile id (guardian.js).
export function setLearner(source) {
  learnerSource = source
}
