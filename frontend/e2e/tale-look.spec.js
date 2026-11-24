// Lesson 3 look: the friend and props are 15% larger yet never touch the card, and the friend's one-time
// feeling movement follows the face (moves at a result or reply, not while the face stays, none with
// reduced motion). Server off.
import { expect, test } from '@playwright/test'
import { OFFLINE } from './ports.js'
import { prepare, seedSession, tales, topicIds } from './helpers.js'

const SCENES = [
  ['page1', { phase: 'book', bookPage: 0 }], ['page3', { phase: 'book', bookPage: 2 }], ['act', { phase: 'act' }],
  ['result1', { phase: 'consequence', branch: 0 }], ['result2', { phase: 'consequence', branch: 1 }],
  ['reply2', { phase: 'reply', branch: 1, choice: 1 }],
]
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

async function open(page, topicId, activity) {
  await seedSession(page, { topicId, activity })
  await prepare(page)
  await page.goto(OFFLINE)
  await page.getByRole('button', { name: '산책 이어가기' }).click()
  await expect(page.locator('.tale-diorama')).toBeVisible()
}

for (const topicId of topicIds) {
  test(`${topicId}: 친구와 소품은 15% 커도 카드와 겹치지 않는다`, async ({ page }) => {
    for (const [, activity] of SCENES) {
      await open(page, topicId, activity)
      expect(await page.locator('.tale-cast').evaluate((el) => getComputedStyle(el).scale)).toBe('1.15')
      const card = await page.locator('.edu-paper').boundingBox()
      expect(overlap(await page.locator('.tale-cast .edu-portrait').boundingBox(), card)).toBe(0)
      for (const prop of await page.locator('.tale-props > span').all()) {
        if (await prop.evaluate((el) => getComputedStyle(el).opacity === '0')) continue
        expect(overlap(await prop.boundingBox(), card)).toBe(0)
      }
      await page.evaluate(() => localStorage.clear())
    }
  })
}

test.describe('감정 몸 움직임', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('결과에서 한 번 움직이고, 같은 표정으로 대화를 이어 가면 다시 움직이지 않는다', async ({ page }) => {
    const talk = tales.joy.talk
    await open(page, 'joy', { phase: 'consequence', branch: 0 })
    const body = page.locator('.tale-cast .edu-character-body')
    await expect(body).toHaveAttribute('data-emote', 'joy')
    await expect(body).toHaveAttribute('data-emote-now', 'true')
    expect(await body.evaluate((el) => getComputedStyle(el).animationName)).toBe('edu-emote-joy')
    // The nod gesture of this scene waits until the movement is done.
    expect(await page.locator('.tale-cast .edu-character-head').evaluate((el) => getComputedStyle(el).animationDelay)).toBe('0.8s')

    await page.getByRole('button', { name: '친구와 대화하기' }).click()
    await expect(body).toHaveAttribute('data-emote', 'joy')
    await expect(body).not.toHaveAttribute('data-emote-now', /.*/) // listening: no new movement
    await page.getByRole('group', { name: '친구에게 보낼 말' }).getByRole('button', { name: talk.choices[0] }).click()
    await expect(page.locator('.tale-cast [data-gesture="speak"]')).toHaveCount(1)
    await expect(body).not.toHaveAttribute('data-emote-now', /.*/) // still joy: not again
  })

  test('표정이 바뀌는 친구 답에서는 그 감정으로 움직인다', async ({ page }) => {
    // 놀람 동화: the result face is neutral (no movement), the first reply is surprise.
    await open(page, 'surprise', { phase: 'question', branch: 0 })
    const body = page.locator('.tale-cast .edu-character-body')
    await expect(body).not.toHaveAttribute('data-emote', /.*/)
    await page.getByRole('group', { name: '친구에게 보낼 말' }).getByRole('button').first().click()
    await expect(body).toHaveAttribute('data-emote', tales.surprise.talk.replyExpressions[0])
    expect(await body.evaluate((el) => getComputedStyle(el).animationName)).toBe('edu-emote-surprise')
  })
})

test('동작 줄이기에서는 몸이 움직이지 않는다', async ({ page }) => {
  await open(page, 'sad', { phase: 'consequence', branch: 0 })
  expect(await page.locator('.tale-cast .edu-character-body').evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
})
