// Lesson 3 look: the friend and props are 15% larger, and nothing covers anything else in any tale scene
// (friend, props, card; only the overlaps a scene is about are allowed), and the friend's one-time feeling
// movement follows the face (none with reduced motion). Server off.
import { expect, test } from '@playwright/test'
import { OFFLINE } from './ports.js'
import { boxOverlap, prepare, propOverlaps, seedSession, taleBoxes, tales, topicIds } from './helpers.js'

// Every lesson 3 scene: pages 1-3, the scene, choosing an action, then for each action its result and talk.
const SCENES = [
  ['1장', { phase: 'book', bookPage: 0 }], ['2장', { phase: 'book', bookPage: 1 }], ['3장', { phase: 'book', bookPage: 2 }],
  ['상황', { phase: 'situation' }], ['행동 고르기', { phase: 'act' }],
  ...[0, 1].flatMap((branch) => [
    [`결과 ${branch + 1}`, { phase: 'consequence', branch }],
    [`질문 ${branch + 1}`, { phase: 'question', branch }],
    [`친구 답 ${branch + 1}`, { phase: 'reply', branch, choice: 0 }],
    [`조금 더 ${branch + 1}`, { phase: 'extra', branch, choice: 0 }],
    [`마무리 ${branch + 1}`, { phase: 'ending', branch, choice: 0, extraChoice: 0 }],
  ]),
]

// Overlaps that are the scene itself.
const afterChoice = (a, branch) => a.branch === branch && a.phase !== 'book' && a.phase !== 'situation' && a.phase !== 'act'
function allowedOverlap(topicId, activity) {
  const is = (a, b, x, y) => (a === x && b === y) || (a === y && b === x)
  return (a, b) => is(a, b, 'speech', 'friend') // the bubble's tail points at the friend
    || (topicId === 'joy' && is(a, b, 'tale-windmill', 'tale-pinwheel')) // the pinwheel on its pole
    || (topicId === 'joy' && afterChoice(activity, 1) && is(a, b, 'tale-postbox', 'tale-plane')) // the letter goes in
    || (topicId === 'sad' && afterChoice(activity, 0) && is(a, b, 'friend', 'tale-mat')) // sitting on the mat
    || (topicId === 'surprise' && activity.phase === 'book' && activity.bookPage === 1
      && is(a, b, 'tale-leaf', 'tale-butterfly')) // hiding under the leaf
    || (topicId === 'surprise' && afterChoice(activity, 1) && is(a, b, 'tale-flower', 'tale-butterfly')) // on the flower
}

async function open(page, topicId, activity) {
  await seedSession(page, { topicId, activity })
  await prepare(page)
  await page.goto(OFFLINE)
  await page.getByRole('button', { name: '산책 이어가기' }).click()
  await expect(page.locator('.tale-diorama')).toBeVisible()
}

for (const topicId of topicIds) {
  test(`${topicId}: 친구·소품·말풍선·카드가 어느 장면에서도 서로 겹치지 않는다 (친구·소품 15% 크게)`, async ({ browser }, info) => {
    test.setTimeout(180_000)
    for (const [name, activity] of SCENES) {
      // A fresh context per scene: the seeded session is written only into empty storage.
      const context = await browser.newContext({ ...info.project.use })
      const page = await context.newPage()
      await open(page, topicId, activity)
      expect(await page.locator('.tale-cast').evaluate((el) => getComputedStyle(el).scale)).toBe('1.15')
      const boxes = await taleBoxes(page)
      expect(propOverlaps(boxes, allowedOverlap(topicId, activity)), name).toEqual([])
      expect(boxes.items.filter((item) => boxOverlap(item, boxes.card) > 1).map((item) => item.name), name).toEqual([])
      const speaks = ['consequence', 'reply'].includes(activity.phase)
      expect(boxes.items.some((item) => item.name === 'speech'), name).toBe(speaks)
      await context.close()
    }
  })
}

// WCAG contrast of a text colour on a background colour (computed rgb strings).
function contrast(fg, bg) {
  const lum = (c) => {
    const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map((v) => {
      const s = Number(v) / 255
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}

test('동화 카드와 말풍선: 불투명한 카드색 바탕에 본문 글자 대비 4.5:1 이상, 친구 말은 말풍선에만', async ({ page }) => {
  await open(page, 'joy', { phase: 'reply', branch: 0, choice: 0 })
  const look = await page.evaluate(() => {
    const css = (el) => getComputedStyle(el)
    const card = document.querySelector('.edu-paper')
    const speech = document.querySelector('.tale-speech')
    const texts = [...card.querySelectorAll('h1, .edu-story, .edu-prompt, .edu-note, p')].filter((el) => el.textContent.trim())
    return {
      cardBg: css(card).backgroundColor, cardImage: css(card).backgroundImage,
      texts: texts.map((el) => [el.textContent.trim().slice(0, 12), css(el).color, css(el).lineHeight, css(el).fontSize, el.tagName]),
      speechBg: css(speech).backgroundColor, speechColor: css(speech).color,
      speechBorder: css(speech).borderTopColor, cardBorder: css(card).borderTopColor,
      speechText: speech.textContent,
    }
  })
  expect(look.cardImage).toBe('none') // plain, opaque card colour
  expect(look.cardBg).toMatch(/^rgb\(/) // no transparency (rgba would be see-through)
  for (const [text, color, lineHeight, fontSize, tag] of look.texts) {
    expect(contrast(color, look.cardBg), text).toBeGreaterThanOrEqual(4.5)
    if (tag !== 'H1') expect(parseFloat(lineHeight) / parseFloat(fontSize), text).toBeGreaterThanOrEqual(1.6) // body text; the title keeps its own
  }
  expect(contrast(look.speechColor, look.speechBg)).toBeGreaterThanOrEqual(4.5)
  expect([look.speechBg, look.speechBorder]).toEqual([look.cardBg, look.cardBorder]) // same tokens as the card
  expect(look.speechText).toBe(tales.joy.talk.replies[0]) // no quotation marks
  await expect(page.locator('.edu-paper')).not.toContainText(tales.joy.talk.replies[0]) // not in the card
})

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

test.describe('감정 몸 움직임 (3장)', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('화남 동화 3장에서 화난 표정이 처음 나올 때 한 번 움직이고, 상황 장면에서는 다시 움직이지 않는다', async ({ page }) => {
    await open(page, 'anger', { phase: 'book', bookPage: 1 })
    const body = page.locator('.tale-cast .edu-character-body')
    await expect(body).not.toHaveAttribute('data-emote', /.*/)
    await page.getByRole('button', { name: '다음 장', exact: true }).click()
    await expect(body).toHaveAttribute('data-emote', 'anger')
    await expect(body).toHaveAttribute('data-emote-now', 'true')
    expect(await body.evaluate((el) => getComputedStyle(el).animationName)).toBe('edu-emote-anger')
    await page.getByRole('button', { name: '장면 살펴보기' }).click()
    await expect(body).toHaveAttribute('data-emote', 'anger')
    await expect(body).not.toHaveAttribute('data-emote-now', /.*/)
  })
})
