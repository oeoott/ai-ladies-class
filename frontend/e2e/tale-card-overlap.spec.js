// Regression for the surprise leaf covering the dialogue card at a smaller landscape window.
import { expect, test } from '@playwright/test'
import { OFFLINE } from './ports.js'
import { boxOverlap, prepare, seedSession, taleBoxes } from './helpers.js'

for (const viewport of [{ width: 826, height: 553 }, { width: 1652, height: 1106 }, { width: 820, height: 1180 }]) {
  test(`놀람 소품이 대화 카드를 가리지 않는다 (${viewport.width}×${viewport.height})`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await seedSession(page, { topicId: 'surprise', activity: { phase: 'reply', branch: 1, choice: 0,
      serverReply: '나비가 어디에 있었는지 궁금했구나. 큰 잎 밑에 숨어 있었어.' } })
    await prepare(page)
    await page.goto(OFFLINE)
    await page.getByRole('button', { name: '산책 이어가기' }).click()
    await expect(page.getByRole('button', { name: '산책 마무리하기' })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath(`tale-card-${viewport.width}.png`), fullPage: true })
    const boxes = await taleBoxes(page)
    const overlaps = boxes.items.filter((item) => boxOverlap(item, boxes.card) > 1).map((item) => item.name)
    expect(overlaps).toEqual([])
  })
}
