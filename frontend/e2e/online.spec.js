// Server on: lessons 1·2·3 are recorded on the backend, then a guardian signs up, this device's records
// move to the child profile, and the dashboard shows the same numbers.
import { expect, test } from '@playwright/test'
import { BACKEND, ONLINE } from './ports.js'
import {
  GUARDIAN_KEY, STORAGE_KEY, emotionLesson, emotions, finishTalk, friendLine, mirrorLesson, onboard, openGuardian,
  placement, planVoice, prepare, quote, readStored, saidNote, storyToTalk, tales, today, topicIds,
} from './helpers.js'

test('서버를 켜면 학습 1·2·3과 대화 턴이 기록되고, 가입하면 대시보드에 같은 숫자가 보인다', async ({ page, request }, info) => {
  const sent = []
  page.on('request', (r) => {
    if (r.url().startsWith(BACKEND) && r.method() === 'POST') {
      sent.push({ path: new URL(r.url()).pathname, body: r.postDataJSON() })
    }
  })
  await prepare(page)
  await page.goto(ONLINE)

  const topicId = topicIds[0]
  const e = emotions[topicId]
  const talk = tales[topicId].talk
  const email = `e2e-${info.project.name}-${Date.now()}@example.com`
  await onboard(page, { email })
  await placement(page) // every face found at once → expand lesson
  await expect.poll(async () => (await readStored(page, STORAGE_KEY)).walkId).toBeTruthy()
  const walkId = (await readStored(page, STORAGE_KEY)).walkId

  await emotionLesson(page, topicId, 'expand')
  await mirrorLesson(page, topicId, { camera: true })
  await storyToTalk(page, topicId, 0)
  await expect.poll(async () => (await readStored(page, STORAGE_KEY)).activity.talkId).toBeTruthy()

  // First line by voice (recognised as a choice), the second by tapping.
  await planVoice(page, { transcript: talk.choices[0] })
  await page.getByRole('button', { name: '말로 답하기' }).click()
  await expect(friendLine(page)).toHaveText(quote(talk.replies[0]))
  await expect(saidNote(page)).toHaveText('내가 한 말: ' + talk.choices[0])
  await finishTalk(page, topicId, 0)

  // What the app sent: records only, the walk id it got back, and no camera or voice data.
  const paths = sent.map((s) => s.path)
  expect(paths).toEqual(expect.arrayContaining([
    '/walks',
    `/lessons/emotion/walks/${walkId}/answer`,
    `/lessons/mirror/walks/${walkId}/record`,
    `/lessons/story/walks/${walkId}/action`,
    `/lessons/story/walks/${walkId}/talk`,
    `/walks/${walkId}/complete`,
  ]))
  const body = (path) => sent.find((s) => s.path === path).body
  expect(body('/walks')).toMatchObject({ topic_id: topicId, level: 'expand', day: today(), review: false })
  expect(body(`/lessons/emotion/walks/${walkId}/answer`)).toEqual({ selected: [e.word, e.kin], used_hint: false })
  expect(body(`/lessons/mirror/walks/${walkId}/record`)).toEqual({ mode: 'camera', score: null, skipped: false })
  expect(body(`/lessons/story/walks/${walkId}/action`)).toEqual({ action_index: 0 })
  const turns = sent.filter((s) => /^\/conversations\/[^/]+\/turn$/.test(s.path)).map((s) => s.body)
  expect(turns).toEqual([
    { choice_index: 0, text: null, input_mode: 'voice' },
    { choice_index: 0, text: null, input_mode: 'picture' },
  ])

  const walk = await (await request.get(`${BACKEND}/walks/${walkId}`)).json()
  expect(walk).toMatchObject({ status: 'completed', topic_id: topicId, level: 'expand' })

  // Sign up from the guardian menu; the device's records move to the new child profile.
  await openGuardian(page)
  await page.getByRole('button', { name: /보호자 계정/ }).click()
  await page.getByRole('dialog', { name: '보호자 로그인' }).getByRole('button', { name: '계정 만들기' }).click()
  const signup = page.getByRole('dialog', { name: '보호자 계정 만들기' })
  await expect(signup.getByLabel('이메일 주소')).toHaveValue(email) // the parent email from the first visit
  await signup.getByLabel('비밀번호 (8자 이상)').fill('forest-e2e-pass')
  await signup.getByRole('button', { name: '가입하기' }).click()
  const account = page.getByRole('dialog', { name: '보호자 계정' })
  await expect(account.getByRole('status')).toHaveText('이 기기의 기록을 라온 프로필로 옮겼어요.')
  await expect(account).toContainText('아이 별명 라온')

  const guardian = await readStored(page, GUARDIAN_KEY)
  const auth = { Authorization: 'Bearer ' + guardian.token }
  // The linked device id no longer works without the token.
  expect((await request.get(`${BACKEND}/walks/${walkId}`)).status()).toBe(401)
  const report = await (await request.get(
    `${BACKEND}/children/${guardian.profileId}/report?from=${today()}&to=${today()}`, { headers: auth },
  )).json()
  expect(report.walks).toEqual({ completed: 1, reviews: 0 })
  expect(report.emotion.find((row) => row.topic_id === topicId))
    .toMatchObject({ answers: 1, correct: 1, accuracy: 1, hint_used: 0 })
  expect(report.emotion.filter((row) => row.topic_id !== topicId).every((row) => row.answers === 0)).toBe(true)
  expect(report.mirror).toMatchObject({ records: 1, camera: 1, touch: 0 })
  expect(report.story).toMatchObject({ conversations: 1, turns: 2, voice_turns: 1, voice_ratio: 0.5, fallback_to_picture: 0, blocked: 0 })
  // Heard on the device as a choice → exact, tapped → button.
  expect(report.story.resolved_by).toEqual({ button: 1, exact: 1, llm: 0, fallback: 0 })
  expect(report.sticker_days).toEqual([today()])

  // Dashboard: this week, then this month.
  await account.getByRole('button', { name: '닫기' }).click()
  await page.getByRole('button', { name: /학습 대시보드/ }).click()
  const dashboard = page.getByRole('dialog', { name: '라온이의 학습 대시보드' })
  const [, month, day] = today().split('-').map(Number)
  await expect(dashboard.locator('.dashboard-line').first()).toHaveText('이번 주 1번 산책했어요')
  await expect(dashboard.getByLabel(`${month}월 ${day}일 스티커 받음`)).toBeVisible()
  const joyRow = dashboard.locator('.dashboard-rows li', { hasText: e.label })
  await expect(joyRow).toContainText('100%')
  await expect(dashboard.locator('.dashboard-rows li', { hasText: '기록 없음' })).toHaveCount(topicIds.length - 1)
  await expect(dashboard.locator('.dashboard-line').last()).toHaveText('1번 이야기했어요·말로 답한 비율 50%')

  await dashboard.getByRole('button', { name: '월간' }).click()
  await expect(dashboard.locator('.dashboard-stats div').first()).toHaveText('이번 달1번')
  await expect(dashboard.getByLabel(`${month}월 ${day}일 산책함 오늘`)).toBeVisible()
  await expect(dashboard.getByRole('button', { name: '다음 달' })).toBeDisabled()
})
