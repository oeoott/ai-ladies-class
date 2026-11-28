// Reproduce resuming a saved tab after the memory backend lost its walk/conversation.
// The real backend manages the new walk/talk; only the generated turn response is faked.
import { expect, test } from '@playwright/test'
import { ONLINE } from './ports.js'
import { STORAGE_KEY, friendLine, storyLine, newDeviceId, planVoice, prepare, readStored, seedSession, talkTitle, topicIds } from './helpers.js'

test('서버에서 사라진 산책의 두 번째 질문을 이어가면 진행을 보존하며 새 대화로 복구한다', async ({ page }) => {
  const missingWalk = 'missing-' + crypto.randomUUID()
  await seedSession(page, { topicId: topicIds[0], walkId: missingWalk, deviceId: newDeviceId(),
    activity: { phase: 'extra', branch: 0, talkId: 'stale-conversation', choice: 0, serverReply: '지난 답' } })
  await prepare(page)
  const turns = []
  await page.route('**/conversations/*/turn', async (route) => {
    turns.push({ url: route.request().url(), body: route.request().postDataJSON() })
    await route.fulfill({ json: { reply: '초대장에 별을 그리면 멋지겠다.', finished: false,
      fallback_to_picture: false, expression: 'joy' } })
  })
  await page.goto(ONLINE)
  await page.getByRole('button', { name: '산책 이어가기' }).click()
  await expect(page.getByRole('heading', { name: talkTitle() })).toBeVisible()
  await expect.poll(async () => (await readStored(page, STORAGE_KEY)).activity.talkId).toBeTruthy()
  const saved = await readStored(page, STORAGE_KEY)
  expect(saved.walkId).not.toBe(missingWalk)
  expect(saved.activity).toMatchObject({ phase: 'question', branch: 0, serverReply: null })
  expect(saved.activity.talkId).not.toBe('stale-conversation')
  await planVoice(page, { transcript: '초대장에 별 그림도 그리고 싶어' })
  await page.getByRole('button', { name: '말로 답하기' }).click()
  await expect(friendLine(page)).toHaveText('초대장에 별을 그리면 멋지겠다.')
  expect(turns).toHaveLength(1)
  expect(turns[0].url).not.toContain('stale-conversation')
  expect(turns[0].body).toMatchObject({ text: '초대장에 별 그림도 그리고 싶어', input_mode: 'voice' })
})


test('첫 답은 로컬 대본이어도 두 번째 질문의 별을 그리자는 서버로 보낸다', async ({ page, request }) => {
  const { startWalk } = await import('./helpers.js')
  const deviceId = newDeviceId()
  const walkId = await startWalk(request, { deviceId, topicId: topicIds[0] })
  await seedSession(page, { topicId: topicIds[0], walkId, deviceId,
    activity: { phase: 'extra', branch: 0, choice: 0, talkId: null } })
  await prepare(page)
  const turns = []
  await page.route('**/conversations/*/turn', async (route) => {
    const body = route.request().postDataJSON()
    turns.push(body)
    if (!body.text) return route.continue() // real server receives the known first choice
    await route.fulfill({ json: { reply: '초대장에 별을 그렸어요.', finished: true,
      fallback_to_picture: false, expression: 'joy' } })
  })
  await page.goto(ONLINE)
  await page.getByRole('button', { name: '산책 이어가기' }).click()
  await planVoice(page, { transcript: '별을 그리자.' })
  await page.getByRole('button', { name: '말로 답하기' }).click()
  await expect(storyLine(page)).toHaveText('초대장에 별을 그렸어요.')
  expect(turns).toEqual([
    { choice_index: 0, text: null, input_mode: 'picture' },
    { choice_index: null, text: '별을 그리자.', input_mode: 'voice' },
  ])
})
