import assert from 'node:assert/strict'
import test from 'node:test'
import { createApi } from '../src/api.js'
import {
  emotionRows, hasRecords, monthCalendar, periodFor, practiceEmotion, stickerDots, storyLine, walkLine, dashboardTitle,
} from '../src/dashboard.js'
import {
  childNickname, choseProfile, createLinkGate, emptyGuardian, expired, learnerFor, linkedDevice, needsLink, newDeviceId, readGuardian, signedIn,
} from '../src/guardian.js'

const DEVICE = 'device-3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'
const NEW_DEVICE = 'device-0a1b2c3d-4e5f-4a6b-9c8d-7e6f5a4b3c2d'
const PROFILE = { id: 'c71a', nickname: '하늘' }

test('learning requests use the device id without a token until this device is linked', () => {
  const none = emptyGuardian()
  assert.deepEqual(learnerFor(none, DEVICE), { childId: DEVICE, token: null })
  const loggedIn = signedIn(none, { token: 't1', email: 'p@example.com' })
  assert.deepEqual(learnerFor(loggedIn, DEVICE), { childId: DEVICE, token: null }) // 로그인만 함
  const chosen = choseProfile(loggedIn, PROFILE)
  assert.deepEqual(learnerFor(chosen, DEVICE), { childId: DEVICE, token: null }) // 연결 전
  assert.equal(needsLink(chosen, DEVICE), true)
  assert.equal(needsLink(loggedIn, DEVICE), false) // 프로필을 고를 때 연결한다
})

test('after linking, learning requests always use the profile id and token', () => {
  const linked = linkedDevice(choseProfile(signedIn(emptyGuardian(), { token: 't1', email: 'p@example.com' }), PROFILE), DEVICE)
  assert.deepEqual(learnerFor(linked, DEVICE), { childId: 'c71a', token: 't1' })
  assert.equal(needsLink(linked, DEVICE), false)
  const other = choseProfile(linked, { id: 'b02', nickname: '바다' }) // 다른 프로필로 바꿔도 연결은 다시 하지 않는다
  assert.deepEqual(learnerFor(other, DEVICE), { childId: 'b02', token: 't1' })
  assert.equal(learnerFor(expired(linked), DEVICE), null) // 토큰이 만료되면 연결된 기기 id로 보내지 않고 건너뜀
  assert.deepEqual(learnerFor(linked, NEW_DEVICE), { childId: NEW_DEVICE, token: null }) // 로그아웃 뒤 새 기기 id
})

test('guardian storage keeps only expected fields', () => {
  assert.deepEqual(readGuardian('not json'), emptyGuardian())
  assert.deepEqual(readGuardian(JSON.stringify({ token: 't', email: 'p@example.com', profileId: 5, extra: 'x' })),
    { token: 't', email: 'p@example.com', profileId: null, profileName: '', linkedDevice: null })
  assert.match(newDeviceId(), /^device-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
})

function recorder(status = 200, data = {}) {
  const calls = []
  const send = async (url, options) => {
    calls.push({ url, method: options.method, auth: options.headers.Authorization, body: options.body && JSON.parse(options.body) })
    return { ok: status < 400, status, json: async () => data }
  }
  return { calls, send }
}

test('learning calls attach the token only in profile mode and skip when the learner is null', async () => {
  let who = { childId: DEVICE, token: null }
  const { calls, send } = recorder(200, { id: 'w1' })
  const online = createApi('http://server', { send, learner: () => who })
  await online.startWalk({ topicId: 'joy', level: 'basic', day: '2026-11-22' })
  await online.savePlacement({ answers: [{ target: 'joy', picks: ['joy'], usedHint: false }], level: 'expand' })
  who = { childId: 'c71a', token: 't1' }
  await online.answerEmotion('w1', { selected: ['기뻐요'] }) // 같은 walkId를 연결 뒤에도 그대로 쓴다
  who = null
  assert.equal(await online.completeWalk('w1'), null)
  assert.deepEqual(calls.map((c) => [c.url, c.auth]), [
    ['http://server/walks', undefined],
    [`http://server/children/${DEVICE}/placement`, undefined],
    ['http://server/lessons/emotion/walks/w1/answer', 'Bearer t1'],
  ])
  assert.equal(calls[0].body.child_id, DEVICE)
  assert.deepEqual(calls[1].body.answers, [{ target: 'joy', picks: ['joy'], used_hint: false }])
})

test('guardian calls always send the token and report the status', async () => {
  const { calls, send } = recorder(403, { detail: 'no' })
  const online = createApi('http://server', { send })
  assert.deepEqual(await online.report('t1', 'c71a', { from: '2026-11-16', to: '2026-11-22' }), { status: 403, data: null })
  await online.linkDevice('t1', 'c71a', DEVICE)
  assert.deepEqual(calls[0], { url: 'http://server/children/c71a/report?from=2026-11-16&to=2026-11-22', method: 'GET', auth: 'Bearer t1', body: undefined })
  assert.deepEqual(calls[1].body, { device_child_id: DEVICE })
  const offline = createApi('')
  assert.deepEqual(await offline.login('p@example.com', 'password1'), { status: 0, data: null })
  const broken = createApi('http://server', { send: async () => { throw new TypeError('offline') } })
  assert.deepEqual(await broken.me('t1'), { status: 0, data: null })
})

test('dashboard helpers', () => {
  const empty = { walks: { completed: 0, reviews: 0 }, stickerDays: [], story: { conversations: 0 }, emotion: [{ answers: 0 }] }
  assert.equal(hasRecords(empty), false) // 화면은 '아직 기록이 없어요' 한 줄
  assert.equal(hasRecords({ ...empty, emotion: [{ answers: 1 }] }), true)
  const walks = { walks: { completed: 4 } }
  assert.deepEqual(walkLine(periodFor('week', 0, '2026-11-23'), walks), ['이번 주', '4번', '산책했어요'])
  assert.deepEqual(walkLine(periodFor('week', -1, '2026-11-23'), walks), ['이 주에', '4번', '산책했어요'])
  assert.deepEqual(walkLine(periodFor('month', -1, '2026-11-23'), walks), ['10월에', '4번', '산책했어요'])
  assert.deepEqual(emotionRows([{ topicId: 'joy', label: '기쁨', answers: 0, accuracy: null }]),
    [{ topicId: 'joy', label: '기쁨', ratio: null, percent: null }])
  assert.deepEqual(storyLine({ conversations: 4, voiceRatio: null }), { count: '4번', voice: '0%' })
  assert.deepEqual(storyLine({ conversations: 2, voiceRatio: 0.5 }), { count: '2번', voice: '50%' })
})

// --- Requests made while this device's records are being linked ---
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function linkingApi({ timeout } = {}) {
  let guardian = choseProfile(signedIn(emptyGuardian(), { token: 't1', email: 'p@example.com' }), PROFILE)
  const gate = createLinkGate(() => learnerFor(guardian, DEVICE))
  const { calls, send } = recorder(200, { id: 'w1', conversationId: 'k1', reply: '좋아.' })
  const online = createApi('http://server', { send, learner: gate.learner, ...(timeout ? { timeout } : {}) })
  return { gate, calls, online, link: (ok) => { if (ok) guardian = linkedDevice(guardian, DEVICE); gate.finish() } }
}

test('records made while linking wait, then go with the profile id and token', async () => {
  const { gate, calls, online, link } = linkingApi()
  gate.start()
  let settled = false
  const sent = [
    online.answerEmotion('w1', { selected: ['기뻐요'] }),
    online.recordMirror('w1', { mode: 'camera' }),
    online.pickStoryAction('w1', 1),
    online.endTalk('k1'),
    online.completeWalk('w1'),
    online.savePlacement({ answers: [{ target: 'joy', picks: ['joy'], usedHint: false }], level: 'expand' }),
  ]
  Promise.all(sent).then(() => { settled = true })
  await flush()
  assert.equal(calls.length, 0) // 연결 중에는 보내지 않는다
  assert.equal(settled, false) // 호출한 쪽은 기다리지 않고 진행한다 (fire-and-forget)
  link(true)
  await Promise.all(sent)
  assert.deepEqual(calls.map((c) => [c.url.replace('http://server', ''), c.auth]), [
    ['/lessons/emotion/walks/w1/answer', 'Bearer t1'],
    ['/lessons/mirror/walks/w1/record', 'Bearer t1'],
    ['/lessons/story/walks/w1/action', 'Bearer t1'],
    ['/conversations/k1/end', 'Bearer t1'],
    ['/walks/w1/complete', 'Bearer t1'],
    ['/children/c71a/placement', 'Bearer t1'], // 레벨 테스트도 프로필 id로
  ]) // 보낸 순서도 그대로
})

test('when linking fails, waiting records go with the device id and no token', async () => {
  const { gate, calls, online, link } = linkingApi()
  gate.start()
  const walk = online.startWalk({ topicId: 'joy', level: 'basic', day: '2026-11-22' })
  const placement = online.savePlacement({ answers: [], level: 'basic' })
  await flush()
  assert.equal(calls.length, 0)
  link(false)
  await Promise.all([walk, placement])
  assert.deepEqual(calls.map((c) => [c.url.replace('http://server', ''), c.auth]), [
    ['/walks', undefined],
    [`/children/${DEVICE}/placement`, undefined],
  ])
  assert.equal(calls[0].body.child_id, DEVICE)
})

test('talk waits for the link only within its timeout, so the screen can fall back to the local script', async () => {
  const quick = linkingApi({ timeout: 200 })
  quick.gate.start()
  const turn = quick.online.sendTalkTurn('k1', { choiceIndex: 0 })
  setTimeout(() => quick.link(true), 20) // 시간 안에 연결이 끝남 → 프로필로 보냄
  assert.deepEqual(await turn, { id: 'w1', conversationId: 'k1', reply: '좋아.' })
  assert.equal(quick.calls[0].auth, 'Bearer t1')

  const slow = linkingApi({ timeout: 30 })
  slow.gate.start()
  const started = Date.now()
  assert.equal(await slow.online.startTalk('w1'), null) // 연결이 늦으면 기다리지 않고 null → 로컬 대본
  assert.ok(Date.now() - started < 200)
  slow.link(true)
  await flush()
  assert.equal(slow.calls.length, 0) // 화면이 이미 로컬로 갔으므로 나중에 보내지도 않는다
})

test('the gate only holds while a link is running', async () => {
  const { gate, calls, online } = linkingApi()
  assert.equal(gate.linking, false)
  await online.answerEmotion('w1', { selected: ['기뻐요'] })
  assert.equal(calls[0].auth, undefined) // 연결 전: 기기 id 방식(토큰 없음)
  gate.start()
  assert.equal(gate.linking, true)
  gate.finish()
  gate.finish() // 두 번 불러도 문제없다
  assert.equal(gate.linking, false)
})

// --- One child per account ---
test('the child nickname is the forest friend name, or the friend name when empty', () => {
  assert.equal(childNickname('하늘이', '라온'), '하늘이')
  assert.equal(childNickname('  ', '보리'), '보리')
  assert.equal(childNickname(null, '두리'), '두리')
})

test('child create and update send only nickname and character with the guardian token', async () => {
  const { calls, send } = recorder(201, { id: 'c71a', nickname: '라온', character: 'lion', birthYear: null })
  const online = createApi('http://server', { send })
  const made = await online.createChild('t1', { nickname: '라온', character: 'lion' })
  assert.equal(made.data.id, 'c71a')
  await online.updateChild('t1', 'c71a', { nickname: '보리', character: 'rabbit' })
  assert.deepEqual(calls.map((c) => [c.method, c.url.replace('http://server', ''), c.auth, c.body]), [
    ['POST', '/children', 'Bearer t1', { nickname: '라온', character: 'lion' }],
    ['PATCH', '/children/c71a', 'Bearer t1', { nickname: '보리', character: 'rabbit' }],
  ])
  const offline = createApi('')
  assert.deepEqual(await offline.updateChild('t1', 'c71a', { nickname: '보리', character: 'rabbit' }), { status: 0, data: null })
})

test('the feeling to practise is the lowest one, hidden when all are the same or nothing is recorded', () => {
  const stat = (label, answers, accuracy) => ({ topicId: label, label, answers, accuracy })
  assert.equal(practiceEmotion([stat('기쁨', 2, 1), stat('놀람', 2, 0.5), stat('슬픔', 0, null)]), '놀람')
  assert.equal(practiceEmotion([stat('기쁨', 2, 0.5), stat('놀람', 2, 0.5)]), null) // 모두 같음
  assert.equal(practiceEmotion([stat('기쁨', 1, 1), stat('놀람', 0, null)]), null) // 기록 있는 감정이 하나뿐
  assert.equal(practiceEmotion([stat('기쁨', 0, null)]), null) // 기록 없음
  assert.equal(practiceEmotion([stat('기쁨', 2, 1), stat('놀람', 2, 0.5), stat('화남', 2, 0.5)]), '놀람, 화남')
})

test('sticker days: one mark per day with its weekday', () => {
  const week = stickerDots('2026-11-16', '2026-11-22', ['2026-11-18', '2026-11-22'])
  assert.equal(week.length, 7)
  assert.deepEqual(week.map((d) => d.weekday), ['월', '화', '수', '목', '금', '토', '일']) // 11월 16일은 월요일
  assert.deepEqual(week.filter((d) => d.got).map((d) => d.name), ['11월 18일', '11월 22일'])
})

test('week period: Monday to Sunday, the Sunday stays in its own week', () => {
  // 2026-11-22 is a Sunday, 2026-11-23 the Monday after it
  assert.deepEqual(periodFor('week', 0, '2026-11-22'), { kind: 'week', from: '2026-11-16', to: '2026-11-22', current: true, name: '11월 16일 ~ 22일' })
  assert.equal(periodFor('week', 0, '2026-11-23').from, '2026-11-23')
  assert.equal(periodFor('week', 0, '2026-11-23').name, '11월 23일 ~ 29일')
  assert.equal(periodFor('week', -1, '2026-11-23').from, '2026-11-16')
  assert.equal(periodFor('week', 1, '2026-11-23').name, '11월 30일 ~ 12월 6일') // 달이 걸치면 두 달 모두
  assert.equal(periodFor('week', 0, '2026-12-31').name, '2026년 12월 28일 ~ 2027년 1월 3일') // 해가 걸치면 해까지
})

test('month period: the 1st to the last day, across month and year ends', () => {
  assert.deepEqual(periodFor('month', 0, '2026-11-23'), { kind: 'month', from: '2026-11-01', to: '2026-11-30', current: true, month: 11, name: '2026년 11월' })
  assert.deepEqual([periodFor('month', 0, '2026-03-31').from, periodFor('month', -1, '2026-03-31').to], ['2026-03-01', '2026-02-28'])
  assert.deepEqual(periodFor('month', -11, '2026-11-01'), { kind: 'month', from: '2025-12-01', to: '2025-12-31', current: false, month: 12, name: '2025년 12월' })
  assert.equal(periodFor('month', -1, '2028-03-01').to, '2028-02-29') // 윤년
})

test('the next arrow is disabled only on this week and this month', () => {
  assert.equal(periodFor('week', 0, '2026-11-23').current, true)
  assert.equal(periodFor('week', -1, '2026-11-23').current, false)
  assert.equal(periodFor('month', 0, '2026-11-23').current, true)
  assert.equal(periodFor('month', -1, '2026-11-23').current, false)
})

test('month calendar: Monday first, empty cells outside the month, walked days and today marked', () => {
  const nov = monthCalendar(periodFor('month', 0, '2026-11-23'), ['2026-11-10', '2026-11-23'], '2026-11-23')
  assert.deepEqual(nov.weekdays, ['월', '화', '수', '목', '금', '토', '일'])
  assert.equal(nov.cells.slice(0, 6).every((c) => c === null), true) // 11월 1일은 일요일 → 앞 6칸 비움
  assert.equal(nov.cells[6].day, 1)
  assert.equal(nov.cells.length % 7, 0)
  assert.deepEqual(nov.cells.filter((c) => c?.walked).map((c) => c.day), [10, 23])
  assert.deepEqual(nov.cells.filter((c) => c?.today).map((c) => c.day), [23])
  const aug = monthCalendar(periodFor('month', 0, '2026-08-15'), [], '2026-11-23') // 8월 1일은 토요일
  assert.equal(aug.cells.length / 7, 6) // 6주에 걸침
  assert.equal(aug.cells.filter(Boolean).length, 31)
  assert.equal(aug.cells.some((c) => c?.today), false) // 다른 달에는 오늘 표시 없음
})

test('dashboard title adds 이 only after a Hangul final consonant', () => {
  assert.equal(dashboardTitle('하늘'), '하늘이의 학습 대시보드') // 받침 있음
  assert.equal(dashboardTitle('보리'), '보리의 학습 대시보드') // 받침 없음
  assert.equal(dashboardTitle('Mia'), 'Mia의 학습 대시보드') // 영어
  assert.equal(dashboardTitle('하늘7'), '하늘7의 학습 대시보드') // 숫자로 끝남
  assert.equal(dashboardTitle(''), '학습 대시보드') // 빈 별명
  assert.equal(dashboardTitle('  '), '학습 대시보드')
  assert.equal(dashboardTitle(undefined), '학습 대시보드')
})

test('month totals: this month and last month from the monthly API', async () => {
  const { monthTotals } = await import('../src/dashboard.js')
  const months = [{ month: '2026-10', walks: 6 }, { month: '2026-11', walks: 8 }]
  const report = { stickerDays: ['2026-11-02'] }
  assert.deepEqual(monthTotals(periodFor('month', 0, '2026-11-23'), months, report), [['이번 달', '8번'], ['지난달', '6번']])
  assert.deepEqual(monthTotals(periodFor('month', -1, '2026-11-23'), months, report), [['이 달', '8번'], ['지난달', '6번']]) // 지난 달을 볼 때
  assert.deepEqual(monthTotals(periodFor('month', 0, '2026-11-23'), null, report), [['이번 달', '1번']]) // 월별 API 없음
})

test('month chart: viewed month on the right, highest value at the top', async () => {
  const { monthChart, monthKey } = await import('../src/dashboard.js')
  assert.equal(monthKey(periodFor('month', -1, '2026-01-10')), '2025-12')
  const months = ['06', '07', '08', '09', '10', '11'].map((m, i) => ({ month: '2026-' + m, walks: [0, 2, 4, 1, 6, 8][i] }))
  const chart = monthChart(months, { width: 520, height: 100, side: 20, top: 20, bottom: 20 })
  assert.deepEqual(chart.points.map((p) => p.label), ['6월', '7월', '8월', '9월', '10월', '11월'])
  assert.deepEqual(chart.points.map((p) => p.x), [20, 116, 212, 308, 404, 500])
  assert.equal(chart.points[5].y, 20) // 가장 많은 달이 맨 위
  assert.equal(chart.points[0].y, 80) // 0번은 맨 아래
  assert.deepEqual(chart.points.map((p) => p.current), [false, false, false, false, false, true])
  assert.ok(monthChart(months.map((m) => ({ ...m, walks: 0 }))).points.every((p) => Number.isFinite(p.y))) // 모두 0이어도 그림
})
