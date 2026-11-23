// Lesson 3 talk scene screenshots (npm run e2e:shots), server off, motion reduced, fake on-device voice.
// One per emotion in emotions.json order (A, B, C, …) and orientation: lesson3/A07-landscape.png …
// The scene: the child tapped the first choice and the friend answers with that line's face and 'speak'.
// Saved outside the repository, in screenshots-final next to the project folder.
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { OFFLINE } from './ports.js'
import { friendFace, friendLine, prepare, quote, replyButton, seedSession, tales, talkTitle, topicIds } from './helpers.js'

const folder = fileURLToPath(new URL('../../../screenshots-final/lesson3/', import.meta.url))

for (const [index, topicId] of topicIds.entries()) {
  const letter = String.fromCharCode(65 + index)
  test(`${letter}07 ${topicId} 대화 장면 @shots`, async ({ page }, info) => {
    const talk = tales[topicId].talk
    await seedSession(page, { topicId, activity: { phase: 'question', branch: 0 } })
    await prepare(page)
    await page.goto(OFFLINE)
    await page.getByRole('button', { name: '산책 이어가기' }).click()
    await expect(page.getByRole('heading', { name: talkTitle() })).toBeVisible()
    await replyButton(page, talk.choices[0]).click()
    await expect(friendLine(page)).toHaveText(quote(talk.replies[0]))
    await expect(friendFace(page)).toHaveAttribute('data-feeling', talk.replyExpressions[0])
    await expect(friendFace(page)).toHaveAttribute('data-gesture', 'speak')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0))
    // Nothing scrolls: the whole scene fits the iPad screen.
    const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
    expect(overflow).toBeLessThanOrEqual(0)
    await page.screenshot({ path: `${folder}${letter}07-${info.project.name}.png` })
  })
}
