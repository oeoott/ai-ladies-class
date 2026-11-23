// Server off (VITE_API_URL empty): first visit to the sticker board on local data only.
import { expect, test } from '@playwright/test'
import { OFFLINE } from './ports.js'
import {
  emotionLesson, emotions, finishTalk, friendFace, friendLine, mirrorLesson, onboard, openGuardian, placement,
  prepare, quote, readStored, replyButton, saidNote, STORAGE_KEY, storyToTalk, tales, today, topicIds,
} from './helpers.js'

test('서버 없이 첫 방문부터 스티커판까지 진행한다', async ({ page }) => {
  const requests = []
  page.on('request', (request) => {
    if (!request.url().startsWith(OFFLINE) && !request.url().startsWith('data:')) requests.push(request.url())
  })
  await prepare(page)
  await page.goto(OFFLINE)

  const topicId = topicIds[0] // a new session starts with the first emotion in emotions.json
  const talk = tales[topicId].talk
  await onboard(page)
  await placement(page, { hint: true }) // a hint in the level test → basic lesson
  await emotionLesson(page, topicId, 'basic')
  await mirrorLesson(page, topicId)
  await storyToTalk(page, topicId, 1)

  // The built-in script answers; the friend speaks with that line's expression.
  await replyButton(page, talk.choices[1]).click()
  await expect(friendLine(page)).toHaveText(quote(talk.replies[1]))
  await expect(saidNote(page)).toHaveText('내가 한 말: ' + talk.choices[1])
  await expect(friendFace(page)).toHaveAttribute('data-feeling', talk.replyExpressions[1])
  await expect(friendFace(page)).toHaveAttribute('data-gesture', 'speak')

  await finishTalk(page, topicId, 1)
  await expect(page.getByText('지금까지 모은 스티커 1개')).toBeVisible()
  // Stickers are only shown: a picture, not a button, and not in the Tab order. The next lesson slot stays.
  const board = page.locator('.stamp-board')
  const sticker = board.getByRole('img', { name: `${emotions[topicId].label} 스티커 · ${today()}` })
  await expect(sticker).toBeVisible()
  expect(await sticker.evaluate((el) => el.tagName === 'SPAN' && el.tabIndex < 0)).toBe(true)
  await expect(page.getByText('다음 학습 칸을 누르면 시작해요.')).toBeVisible()
  await expect(board.getByRole('button')).toHaveCount(1)
  await expect(board.getByRole('button', { name: `${emotions[topicIds[1]].label} 학습 시작` })).toBeVisible()

  const session = await readStored(page, STORAGE_KEY)
  expect(session.records).toEqual([{ date: today(), topic: emotions[topicId].label }])
  expect(session.walkId).toBeNull()

  // No server: the guardian menu has no account rows, and nothing left this origin.
  await openGuardian(page)
  await expect(page.getByRole('button', { name: /보호자 계정/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /학습 대시보드/ })).toHaveCount(0)
  expect(requests).toEqual([])
})
