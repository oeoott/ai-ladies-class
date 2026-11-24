// Lesson 3 backgrounds: a scene picture in public/art/tale/ is used when it exists; otherwise the tale's
// original picture is shown, toned down (.is-original). Server off.
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { OFFLINE } from './ports.js'
import { prepare, seedSession } from './helpers.js'

const picture = readFileSync(new URL('../public/art/original/tale-sad.webp', import.meta.url))

async function open(page, activity) {
  await seedSession(page, { topicId: 'joy', activity })
  await prepare(page)
  await page.goto(OFFLINE)
  await page.getByRole('button', { name: '산책 이어가기' }).click()
  return page.locator('.tale-landscape')
}

test('장면 그림이 없으면 원본 동화 그림을 차분하게 보여 준다', async ({ page }) => {
  await page.route('**/art/tale/*.webp', (route) => route.fulfill({ status: 404, body: '' }))
  const landscape = await open(page, { phase: 'act' })
  await expect(landscape).toHaveAttribute('src', /art\/tale-joy\.webp$/)
  await expect(landscape).toHaveClass(/is-original/)
  expect(await landscape.evaluate((el) => getComputedStyle(el).filter)).toBe('saturate(0.65) contrast(0.9)')
})

test('장면 그림을 넣으면 그 장면에 그대로 쓰인다 (행동 결과는 고른 행동의 그림)', async ({ page }) => {
  const asked = []
  await page.route('**/art/tale/*.webp', (route) => {
    asked.push(new URL(route.request().url()).pathname.split('/').pop())
    return route.fulfill({ status: 200, contentType: 'image/webp', body: picture })
  })
  const landscape = await open(page, { phase: 'consequence', branch: 1 })
  await expect(landscape).toHaveAttribute('src', /art\/tale\/joy-post\.webp$/)
  await expect(landscape).not.toHaveClass(/is-original/)
  expect(await landscape.evaluate((el) => getComputedStyle(el).filter)).toBe('none')
  expect(asked).toContain('joy-post.webp')
})
