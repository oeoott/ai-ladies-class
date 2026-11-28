// 음성 기능 (Azure Speech). The real Azure is never called: every microsoft.com request and WebSocket is
// blocked here. What is checked: the guardian's choice and consent, no 'in use' without a configured server,
// and that a failed Azure recognition goes back to tapping a choice.
import { expect, test } from '@playwright/test'
import { BACKEND, ONLINE } from './ports.js'
import { PIN, newDeviceId, prepare, seedSession, startWalk, tales, talkTitle, topicIds, voiceNote } from './helpers.js'

const topicId = topicIds[0]
const tale = tales[topicId]

async function blockMicrosoft(page) {
  const outside = []
  await page.route(/microsoft\.com/, (route) => { outside.push(route.request().url()); return route.abort() })
  await page.routeWebSocket(/microsoft\.com/, (ws) => { outside.push(ws.url()); ws.close() })
  return outside
}

async function openAt(page, request) {
  const deviceId = newDeviceId()
  const walkId = await startWalk(request, { deviceId, topicId })
  await seedSession(page, { topicId, walkId, deviceId, activity: { phase: 'consequence', branch: 0 } })
  await prepare(page)
  await page.goto(ONLINE)
  await page.getByRole('button', { name: '산책 이어가기' }).click()
  await expect(page.getByRole('heading', { name: tale.actions[0].title })).toBeVisible()
  return deviceId
}

async function closeDialogs(page) {
  while (await page.getByRole('dialog').count()) await page.getByRole('dialog').getByRole('button', { name: '닫기' }).first().click()
}

async function guardianSpeech(page) {
  // a seeded session has no guardian PIN yet: the gate asks to set one first
  await page.getByRole('button', { name: '보호자', exact: true }).click()
  const gate = page.getByRole('dialog', { name: '보호자 비밀번호' })
  await gate.getByLabel('새 비밀번호 (숫자 4자리)').fill(PIN)
  await gate.getByLabel('비밀번호 한 번 더').fill(PIN)
  await gate.getByRole('button', { name: '비밀번호 저장' }).click()
  await expect(page.getByRole('dialog', { name: '보호자 설정' })).toBeVisible()
  return page.getByRole('button', { name: /음성 기능/ })
}

test('서버에 Azure 음성 설정이 없으면 이 기기 음성으로 두고, 사용 중이라고 표시하지 않는다', async ({ page, request }) => {
  const outside = await blockMicrosoft(page)
  await page.addInitScript(() => localStorage.setItem('maeum-forest.speech.v1',
    JSON.stringify({ provider: 'azure', consentAt: '2026-11-28T00:00:00Z' }))) // chosen earlier
  await openAt(page, request)
  const tile = await guardianSpeech(page)
  await tile.click()
  const panel = page.getByRole('dialog', { name: '음성 기능' })
  await expect(panel.getByText('서버에 Azure 음성 기능이 설정되어 있지 않아요')).toBeVisible()
  await expect(panel.getByText('(서버 연결 안 됨)')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Azure 음성 사용하기' })).toHaveCount(0)
  await closeDialogs(page)
  await page.getByRole('button', { name: '친구와 대화하기' }).click()
  await expect(page.getByRole('heading', { name: talkTitle() })).toBeVisible()
  // the on-device path as before (prepare() gives this browser the tests' fake on-device recognizer):
  // the earlier Azure choice is not used because the server has no Azure Speech
  const tokens = []
  page.on('request', (r) => { if (r.url().endsWith('/speech/token')) tokens.push(r.url()) })
  await page.getByRole('button', { name: '말로 답하기' }).click()
  await expect(voiceNote(page)).not.toBeEmpty()
  expect(tokens).toEqual([])
  expect(outside).toEqual([])
})

test('보호자가 동의하고 Azure를 고르면 말로 답하기를 쓰고, Azure 연결이 실패하면 문구 선택으로 이어 간다', async ({ page, request }) => {
  const outside = await blockMicrosoft(page)
  const tokenBodies = []
  await page.route(BACKEND + '/speech/status', (route) => route.fulfill({ json: { available: true, language: 'ko-KR' } }))
  await page.route(BACKEND + '/speech/token', (route) => {
    tokenBodies.push(route.request().postDataJSON())
    return route.fulfill({ json: { token: 'fake-token', region: 'koreacentral', language: 'ko-KR', voice: 'ko-KR-SunHiNeural', expires_in: 540 } })
  })
  const turns = []
  page.on('request', (r) => { if (/\/conversations\/[^/]+\/turn$/.test(r.url())) turns.push(r.postDataJSON()) })
  const deviceId = await openAt(page, request)
  const tile = await guardianSpeech(page)
  await expect(tile).toContainText('이 기기 음성')
  await tile.click()
  const panel = page.getByRole('dialog', { name: '음성 기능' })
  const use = panel.getByRole('button', { name: 'Azure 음성 사용하기' })
  await expect(use).toBeDisabled() // consent first
  await panel.getByLabel('아이 목소리가 Microsoft Azure로 전송되는 것을 이해하고 동의해요.').check()
  await use.click()
  await expect(panel.getByText('Azure 음성 인식과 읽어 주기 (사용 중)')).toBeVisible()
  await panel.getByRole('button', { name: '설정으로 돌아가기' }).click()
  await expect(page.getByRole('button', { name: /음성 기능/ })).toContainText('Azure 음성')
  await closeDialogs(page)

  await page.getByRole('button', { name: '친구와 대화하기' }).click()
  await expect(page.getByRole('heading', { name: talkTitle() })).toBeVisible()
  await page.getByRole('button', { name: '말로 답하기' }).click()
  await expect(voiceNote(page)).toHaveText('화면에서 하고 싶은 말을 눌러 보아요.', { timeout: 20_000 })
  await expect(page.getByRole('button', { name: tale.talk.choices[0], exact: true })).toBeEnabled()
  expect(turns).toEqual([]) // nothing heard, nothing sent
  expect(tokenBodies.length).toBeGreaterThan(0)
  expect(tokenBodies.every((b) => Object.keys(b).join() === 'child_id' && b.child_id === deviceId)).toBe(true)
  expect(outside.length).toBeGreaterThan(0) // the SDK tried Azure and was blocked here
  expect(outside.every((u) => /microsoft\.com/.test(u))).toBe(true)
})
