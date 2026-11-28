// Lesson 2 mirror score gate. The fake camera of these tests shows no face, so with scoring on the child is asked
// to bring the face into view; with the provisional baseline (default) nothing about scores appears.
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { OFFLINE } from './ports.js'
import { STORAGE_KEY, prepare, today, topicIds } from './helpers.js'

const baseline = JSON.parse(readFileSync(new URL('../src/mirrorBaseline.json', import.meta.url)))
const topicId = topicIds[0]

async function openMirror(page, query = '') {
  const session = {
    version: 1, day: today(), topicId, reviewTopicId: null, reviewReturn: null, page: 'lesson',
    friendId: 'lion', cardPortrait: 'boy', friendCharm: null, friendHeadwear: null, friendNickname: '',
    onboarded: true, level: 'basic', step: 1, placement: null, activity: { step: 1, topic: topicId },
    retestReturn: null, walkId: null, records: [],
  }
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value)
  }, { key: STORAGE_KEY, value: JSON.stringify(session) })
  await prepare(page)
  await page.goto(OFFLINE + '/' + query)
  await page.getByRole('button', { name: '산책 이어가기' }).click()
  await expect(page.getByRole('heading', { name: '표정을 따라 해 봐요' })).toBeVisible()
  await page.getByRole('button', { name: '카메라로 내 모습 보기' }).click()
  await expect(page.getByRole('button', { name: '카메라 끄기' })).toBeVisible({ timeout: 15_000 })
}

const status = (page) => page.locator('.edu-camera-status')

test('임시 기준값에서는 점수·별·힌트를 보이지 않고 얼굴 안내만 한다', async ({ page }) => {
  expect(baseline.status).toBe('provisional')
  await openMirror(page)
  await expect(status(page)).toHaveText('내 모습은 이 화면에만 보여요.')
  await page.waitForTimeout(1500) // the detector runs; still no score line
  await expect(status(page)).toHaveText('내 모습은 이 화면에만 보여요.')
  await expect(page.locator('.edu-mirror-stars')).toHaveCount(0)
})

test('팀 시험(?mirrorScore=1)에서는 채점기가 돌고, 얼굴이 없으면 얼굴을 보이게 하라고 안내한다', async ({ page }) => {
  await openMirror(page, '?mirrorScore=1')
  await expect(status(page)).toHaveText('얼굴이 화면에 보이게 해 봐요.', { timeout: 20_000 })
  await expect(page.locator('.edu-mirror-stars')).toHaveCount(0) // not scoring yet: no stars
  await page.getByRole('button', { name: '카메라 끄기' }).click()
  await expect(status(page)).toBeEmpty()
})
