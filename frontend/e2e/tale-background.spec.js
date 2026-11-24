// Lesson 3 background: each tale shows its one picture (public/art/tale/) in every scene, as drawn,
// with only the cream wash behind the card. Server off.
import { expect, test } from '@playwright/test'
import { OFFLINE } from './ports.js'
import { prepare, seedSession, topicIds } from './helpers.js'

const NAMES = { joy: 'joy-yard', sad: 'sad-shore', surprise: 'surprise-garden', anger: 'anger-playground' }

for (const topicId of topicIds) {
  test(`${topicId} 동화는 모든 장면에 같은 새 그림을 쓴다 (B안: 살짝 부드럽게)`, async ({ page }) => {
    await seedSession(page, { topicId, activity: { phase: 'book', bookPage: 0 } })
    await prepare(page)
    await page.goto(OFFLINE)
    await page.getByRole('button', { name: '산책 이어가기' }).click()
    const landscape = page.locator('.tale-landscape')
    const src = new RegExp(`art/tale/${NAMES[topicId]}\\.webp$`)
    await expect(landscape).toHaveAttribute('src', src)
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0))
    expect(await landscape.evaluate((el) => getComputedStyle(el).filter)).toBe('brightness(0.95) saturate(0.95)')
    expect(await page.locator('.edu-paper').evaluate((el) => getComputedStyle(el).boxShadow)).toContain('110px 70px')

    // Same picture after choosing an action (outcome and talk scenes).
    for (const step of ['다음 장', '다음 장', '장면 살펴보기', '내가 해 보기']) {
      await page.getByRole('button', { name: step, exact: true }).click()
    }
    await page.getByRole('group', { name: '이야기 속에서 할 행동' }).getByRole('button').nth(1).click()
    await expect(landscape).toHaveAttribute('src', src)
    await page.getByRole('button', { name: '친구와 대화하기' }).click()
    await expect(landscape).toHaveAttribute('src', src)
  })
}
