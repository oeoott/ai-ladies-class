// Guardian dashboard layout with walks this week, earlier this month and in the months before:
// the period name and the circles/calendar share one centre, the chart is about 80px, nothing scrolls.
import { expect, test } from '@playwright/test'
import { BACKEND, ONLINE } from './ports.js'
import { DEVICE_KEY, emotions, onboard, openGuardian, prepare, today, topicIds } from './helpers.js'

const daysAgo = (n) => {
  const d = new Date(today() + 'T12:00:00')
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}
const centre = (box) => box.x + box.width / 2

async function walksBefore(page, request) {
  const device = await page.evaluate((key) => localStorage.getItem(key), DEVICE_KEY)
  for (const [i, n] of [0, 1, 3, 9, 16, 33, 40, 61, 70, 95].entries()) {
    const topicId = topicIds[i % topicIds.length]
    const walk = await (await request.post(BACKEND + '/walks', {
      data: { child_id: device, topic_id: topicId, level: 'basic', day: daysAgo(n) },
    })).json()
    const e = emotions[topicId]
    await request.post(`${BACKEND}/lessons/emotion/walks/${walk.id}/answer`, { data: { selected: [i % 3 ? e.word : e.opposite] } })
    const talk = await (await request.post(`${BACKEND}/lessons/story/walks/${walk.id}/talk`, { data: {} })).json()
    await request.post(`${BACKEND}/conversations/${talk.conversation_id}/turn`, { data: { choice_index: 0, input_mode: i % 2 ? 'voice' : 'picture' } })
    await request.post(`${BACKEND}/walks/${walk.id}/complete`)
  }
}

test('학습 대시보드: 기간 이름과 요일·달력 묶음의 가운데가 같고, 그래프는 약 80px, 스크롤 없음', async ({ page, request }, info) => {
  await prepare(page)
  await page.goto(ONLINE)
  await onboard(page, { email: `dash-${info.project.name}-${Date.now()}@example.com` })
  await walksBefore(page, request)
  await openGuardian(page)
  await page.getByRole('button', { name: /보호자 계정/ }).click()
  await page.getByRole('dialog', { name: '보호자 로그인' }).getByRole('button', { name: '계정 만들기' }).click()
  const signup = page.getByRole('dialog', { name: '보호자 계정 만들기' })
  await signup.getByLabel('비밀번호 (8자 이상)').fill('forest-e2e-pass')
  await signup.getByRole('button', { name: '가입하기' }).click()
  const account = page.getByRole('dialog', { name: '보호자 계정' })
  await expect(account.getByRole('status')).toContainText('옮겼어요')
  await account.getByRole('button', { name: '닫기' }).click()
  await page.getByRole('button', { name: /학습 대시보드/ }).click()
  const dashboard = page.getByRole('dialog', { name: /학습 대시보드/ })
  const name = dashboard.locator('.dashboard-nav > span')
  const noScroll = () => dashboard.evaluate((d) => d.scrollHeight - d.clientHeight)

  await expect(dashboard.locator('.dashboard-week')).toBeVisible()
  expect(Math.abs(centre(await name.boundingBox()) - centre(await dashboard.locator('.dashboard-week').boundingBox()))).toBeLessThanOrEqual(1)
  expect(await noScroll()).toBeLessThanOrEqual(0)

  await dashboard.getByRole('button', { name: '월간' }).click()
  const chart = dashboard.locator('.dashboard-chart')
  await expect(chart).toBeVisible()
  const [stats, calendar, nameBox, chartBox] = await Promise.all([
    dashboard.locator('.dashboard-stats').boundingBox(), dashboard.locator('.dashboard-calendar').boundingBox(),
    name.boundingBox(), chart.boundingBox()])
  const pair = { x: stats.x, width: calendar.x + calendar.width - stats.x }
  expect(Math.abs(centre(nameBox) - centre(pair))).toBeLessThanOrEqual(1)
  expect(calendar.x - (stats.x + stats.width)).toBeLessThanOrEqual(16) // numbers right beside the calendar
  expect(chartBox.height).toBeGreaterThanOrEqual(76)
  expect(chartBox.height).toBeLessThanOrEqual(86)
  expect(await noScroll()).toBeLessThanOrEqual(0)
})
