// Lesson 3 talk against the real backend, with the turn answer changed per test (slow, fallback, error).
// Each test starts at the chosen action's result with a walk on the backend, then opens the talk.
import { expect, test } from '@playwright/test'
import { BACKEND, ONLINE } from './ports.js'
import {
  STORAGE_KEY, friendFace, friendLine, named, newDeviceId, planVoice, prepare, quote, readStored, replyButton, replyButtons,
  saidNote, seedSession, startWalk, tales, talkTitle, topicIds, voiceNote,
} from './helpers.js'

const topicId = topicIds[0]
const tale = tales[topicId]
const talk = tale.talk
const TURN = BACKEND + '/conversations/*/turn'
const THINKING = '생각하고 있어요.'
// Lines the child "says" and the server "answers" in these tests. They are test data, not the tale script.
const HEARD = '하늘에 무지개가 떴어'
const SERVER_LINE = '서버에서 온 답이야.'

async function openTalk(page, request) {
  const deviceId = newDeviceId()
  const walkId = await startWalk(request, { deviceId, topicId })
  await seedSession(page, { topicId, walkId, deviceId, activity: { phase: 'consequence', branch: 0 } })
  await prepare(page)
  const turns = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/conversations\/[^/]+\/turn$/.test(r.url())) turns.push(r.postDataJSON())
  })
  await page.goto(ONLINE)
  await page.getByRole('button', { name: '산책 이어가기' }).click()
  await expect(page.getByRole('heading', { name: tale.actions[0].title })).toBeVisible()
  await page.getByRole('button', { name: '친구와 대화하기' }).click()
  await expect(page.getByRole('heading', { name: talkTitle() })).toBeVisible()
  await expect.poll(async () => (await readStored(page, STORAGE_KEY)).activity.talkId).toBeTruthy()
  // Choosing or speaking: the friend listens.
  await expect(friendFace(page)).toHaveAttribute('data-gesture', 'listen')
  return turns
}

const fallback = (choices = talk.choices) => ({
  status: 200, contentType: 'application/json',
  body: JSON.stringify({ reply: '그림으로 골라 볼까요?', finished: false, choices, fallback_to_picture: true }),
})

test('보기를 누르면 서버로 턴을 보내고, 답을 친구 말풍선에 대사의 표정으로 보인다', async ({ page, request }) => {
  const turns = await openTalk(page, request)
  await replyButton(page, talk.choices[1]).click()
  await expect(friendLine(page)).toHaveText(quote(talk.replies[1]))
  await expect(saidNote(page)).toHaveText('내가 한 말: ' + talk.choices[1])
  await expect(friendFace(page)).toHaveAttribute('data-feeling', talk.replyExpressions[1])
  await expect(friendFace(page)).toHaveAttribute('data-gesture', 'speak')

  await page.getByRole('button', { name: '조금 더 이야기하기' }).click()
  await replyButton(page, talk.extra[0]).click()
  await expect(friendLine(page)).toHaveText(talk.ends[0])
  await expect(friendFace(page)).toHaveAttribute('data-feeling', talk.endExpressions[0])
  await expect(friendFace(page)).toHaveAttribute('data-gesture', 'nod')
  expect(turns).toEqual([
    { choice_index: 1, text: null, input_mode: 'picture' },
    { choice_index: 0, text: null, input_mode: 'picture' },
  ])
})

test('서버 답이 6초 늦으면 생각하고 있어요를 보이다가 5초 뒤 대본으로 이어 간다', async ({ page, request }) => {
  const turns = await openTalk(page, request)
  await page.route(TURN, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6000))
    // Too late: the app stopped waiting at 5 seconds, so this answer must not appear.
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reply: SERVER_LINE, finished: false }) })
      .catch(() => {})
  })
  const started = Date.now()
  await replyButton(page, talk.choices[0]).click()
  await expect(voiceNote(page)).toHaveText(THINKING)
  for (const choice of await replyButtons(page).all()) await expect(choice).toBeDisabled()
  await expect(page.getByRole('button', { name: '말로 답하기' })).toBeDisabled()

  await expect(friendLine(page)).toHaveText(quote(talk.replies[0]), { timeout: 8000 })
  expect(Date.now() - started).toBeGreaterThan(4500)
  await page.waitForTimeout(1500) // past the late answer at 6 seconds
  await expect(friendLine(page)).toHaveText(quote(talk.replies[0]))
  await expect(page.getByText(THINKING)).toHaveCount(0)

  // The rest of the talk stays on the script: no second turn is sent.
  await page.getByRole('button', { name: '조금 더 이야기하기' }).click()
  await replyButton(page, talk.extra[1]).click()
  await expect(friendLine(page)).toHaveText(talk.ends[1])
  expect(turns).toHaveLength(1)
})

test('보기를 눌렀는데 fallbackToPicture가 오면 대본의 답으로 이어 간다', async ({ page, request }) => {
  await openTalk(page, request)
  await page.route(TURN, (route) => route.fulfill(fallback()))
  await replyButton(page, talk.choices[1]).click()
  await expect(friendLine(page)).toHaveText(quote(talk.replies[1]))
  await expect(friendFace(page)).toHaveAttribute('data-feeling', talk.replyExpressions[1])
})

test('말로 답했는데 fallbackToPicture가 오면 보기 버튼으로 돌아가고, 누르면 서버 답을 받는다', async ({ page, request }) => {
  const turns = await openTalk(page, request)
  await page.route(TURN, (route) => route.fulfill(fallback()))
  await planVoice(page, { transcript: HEARD })
  await page.getByRole('button', { name: '말로 답하기' }).click()
  await expect(voiceNote(page)).toHaveText('잘 들었어요. 이번에는 하고 싶은 말을 눌러 보아요.')
  await expect(page.getByRole('heading', { name: talkTitle() })).toBeVisible()
  await expect(page.locator('.edu-prompt')).toHaveText(named(talk.ask))
  await expect(replyButtons(page)).toHaveCount(talk.choices.length)
  for (const choice of await replyButtons(page).all()) await expect(choice).toBeEnabled()
  expect(turns[0]).toEqual({ choice_index: null, text: HEARD, input_mode: 'voice' })

  await page.unroute(TURN)
  await replyButton(page, talk.choices[0]).click()
  await expect(friendLine(page)).toHaveText(quote(talk.replies[0]))
  expect(turns).toHaveLength(2)
})

test('듣는 동안 안내와 듣기 몸짓을 보이고, 인식이 실패하면 보기를 누르라고 안내한다', async ({ page, request }) => {
  const turns = await openTalk(page, request)
  await planVoice(page, { error: 'no-speech', delay: 1200 })
  await page.getByRole('button', { name: '말로 답하기' }).click()
  await expect(voiceNote(page)).toHaveText('듣고 있어요. 보기 중 하고 싶은 말을 말해 보아요.')
  await expect(page.getByRole('button', { name: '듣기 멈추기' })).toBeVisible()
  await expect(friendFace(page)).toHaveAttribute('data-gesture', 'listen')

  await expect(voiceNote(page)).toHaveText('화면에서 하고 싶은 말을 눌러 보아요.')
  await expect(page.getByRole('button', { name: '말로 답하기' })).toBeEnabled()
  for (const choice of await replyButtons(page).all()) await expect(choice).toBeEnabled()
  expect(turns).toHaveLength(0)
})

test('서버가 오류를 돌려주면 대본의 답으로 이어 간다', async ({ page, request }) => {
  await openTalk(page, request)
  await page.route(TURN, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"error"}' }))
  await replyButton(page, talk.choices[0]).click()
  await expect(friendLine(page)).toHaveText(quote(talk.replies[0]))
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('말로 답해 받은 서버 답은 새로고침 뒤에도 남고, 내가 한 말은 남지 않는다', async ({ page, request }) => {
  const turns = await openTalk(page, request)
  await page.route(TURN, (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ reply: SERVER_LINE, finished: false, ask: talk.again, choices: talk.extra, expression: 'surprise' }),
  }))
  await planVoice(page, { transcript: HEARD })
  await page.getByRole('button', { name: '말로 답하기' }).click()
  await expect(friendLine(page)).toHaveText(quote(SERVER_LINE))
  await expect(saidNote(page)).toHaveText('내가 한 말: ' + HEARD)
  await expect(friendFace(page)).toHaveAttribute('data-feeling', 'surprise')
  await expect(friendFace(page)).toHaveAttribute('data-gesture', 'speak')
  expect(turns).toEqual([{ choice_index: null, text: HEARD, input_mode: 'voice' }])

  await page.reload()
  await page.getByRole('button', { name: '산책 이어가기' }).click()
  await expect(friendLine(page)).toHaveText(quote(SERVER_LINE))
  await expect(friendFace(page)).toHaveAttribute('data-feeling', 'surprise')
  // The spoken sentence lives in memory only: not on screen after the reload, not in storage.
  await expect(saidNote(page)).toHaveCount(0)
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }))
  expect(stored).not.toContain(HEARD)
})
