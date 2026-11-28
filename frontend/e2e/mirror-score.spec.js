// Lesson 2 mirror score gate. The fake camera of these tests shows no face, so with scoring on the child is asked
// to bring the face into view; with the provisional baseline (default) nothing about scores appears.
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { OFFLINE } from './ports.js'
import { STORAGE_KEY, emotions, prepare, today, topicIds } from './helpers.js'

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
  await expect(page.locator('.edu-response-copy')).toHaveCount(0)
  await page.getByRole('button', { name: '표정 연습하기' }).click()
  await expect(page.getByRole('button', { name: '내 모습 보기' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: '카메라 끄기', exact: true })).toHaveCount(0)
}

const status = (page) => page.locator('.edu-camera-status')

test('임시 기준값에서는 점수·별·힌트를 보이지 않고 얼굴 안내만 한다', async ({ page }) => {
  expect(baseline.status).toBe('provisional')
  await openMirror(page)
  await expect(status(page)).toHaveText('카메라가 켜져 있어요.')
  await page.waitForTimeout(1500) // the detector runs; still no score line
  await expect(status(page)).toHaveText('카메라가 켜져 있어요.')
  await expect(page.locator('.edu-mirror-stars')).toHaveCount(0)
})

test('팀 시험(?mirrorScore=1)에서는 채점기가 돌고, 얼굴이 없으면 얼굴을 보이게 하라고 안내한다', async ({ page }) => {
  await openMirror(page, '?mirrorScore=1')
  await expect(status(page)).toHaveText('얼굴이 화면에 보이게 해 봐요.', { timeout: 20_000 })
  await expect(page.locator('.edu-mirror-stars')).toHaveCount(0) // not scoring yet: no stars
  await page.getByLabel('이 기기의 내 모습').evaluate((v) => {
    window.__mirrorTracks = v.srcObject.getTracks()
  })
  await page.getByRole('button', { name: '쉬어 가기', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.__mirrorTracks.every((track) => track.readyState === 'ended'))).toBe(true)
  await page.getByRole('button', { name: '이어서 하기', exact: true }).click()
  await expect(status(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: '표정 연습하기', exact: true })).toBeVisible()
})


test('내 영상은 숨긴 채 분석·성공 판정을 하고, 영상 표시를 바꿔도 카메라를 다시 열지 않는다', async ({ page }) => {
  await page.addInitScript(() => {
    window.__cameraRequests = 0
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = (constraints) => {
      window.__cameraRequests++
      return original(constraints)
    }
  })
  // Synthetic on-device frames, accelerated timestamps. Real camera content never leaves the device.
  await page.route('**/src/facePreview.js*', (route) => route.fulfill({ contentType: 'application/javascript', body: `
    export function startFacePreview(video, onPresence, onFrame) {
      let t = 0;
      const timer = setInterval(() => {
        const k = t < 3200 ? 0 : Math.min(0.5, (t - 3200) / 800);
        onPresence(true);
        onFrame({ faces: [{mouthSmileLeft: .6*k, mouthSmileRight: .6*k,
          cheekSquintLeft: .35*k, cheekSquintRight: .35*k}] }, t);
        t += 100;
      }, 50);
      return () => clearInterval(timer);
    }
  ` }))
  await openMirror(page, '?mirrorScore=1')
  const video = page.getByLabel('이 기기의 내 모습')
  await expect(video).toBeHidden()
  await expect.poll(() => video.evaluate((v) => v.readyState >= 2 && !v.paused
    && v.srcObject?.getVideoTracks().every((track) => track.readyState === 'live'))).toBe(true)
  await page.getByRole('button', { name: '내 모습 보기', exact: true }).click()
  await expect(video).toBeVisible()
  await page.getByRole('button', { name: '내 모습 숨기기', exact: true }).click()
  await expect(video).toBeHidden()
  expect(await page.evaluate(() => window.__cameraRequests)).toBe(1)
  // The main instruction overrides the target smile during the resting-face calibration.
  await expect(page.locator('.edu-response-copy')).toHaveText('얼굴에 힘을 빼고 잠깐 기다려요.')
  await expect(page.getByRole('button', { name: '표정 연습 마쳤어요' })).toBeEnabled()
  await expect(page.getByRole('heading', { name: '표정을 잘 따라 했어요!' })).toBeVisible()
  await expect(page.locator('.edu-mirror-stars')).toHaveAttribute('data-stars', '1')
  await expect(video).toBeHidden()
  expect(await page.evaluate(() => window.__cameraRequests)).toBe(1)
  await expect(page.getByRole('button', { name: '마음 전하기', exact: true })).toBeEnabled()
  await page.waitForTimeout(250) // Success stays visible and never forces the next scene.
  await expect(page.getByRole('heading', { name: '표정을 잘 따라 했어요!' })).toBeVisible()
  await page.getByRole('button', { name: '마음 전하기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '내 마음을 전해 봐요' })).toBeVisible()
  await expect(page.getByLabel('이 기기의 내 모습')).toHaveCount(0)
})


// Exercise the real retry loop; only the MediaPipe runtime is replaced, never facePreview.js.
async function fakeDetector(page, { initialFailures = 0 } = {}) {
  await page.route('**/@mediapipe_tasks-vision.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `
      window.__detectorStarts = 0;
      window.__detectorCloses = 0;
      export const FilesetResolver = { isSimdSupported: async () => true };
      export const FaceLandmarker = { createFromOptions: async () => {
        window.__detectorStarts++;
        if (window.__detectorStarts <= ${initialFailures}) throw new Error('test model unavailable');
        return {
          detectForVideo() {
            if (window.__failDetection) { window.__failDetection = false; throw new Error('test detect failure'); }
            return {faceLandmarks: [], faceBlendshapes: []};
          },
          close() {window.__detectorCloses++;}
        };
      }};
    `,
  }))
}

test('분석기 로딩 실패를 안내하고 카메라를 유지한 채 자동으로 다시 준비한다', async ({ page }) => {
  await fakeDetector(page, { initialFailures: 2 })
  await openMirror(page, '?mirrorScore=1')
  await expect(status(page)).toHaveText('표정 분석을 다시 준비하고 있어요.')
  await expect(page.locator('.edu-mirror-stars')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.__detectorStarts)).toBe(3)
  await expect(status(page)).toHaveText('얼굴이 화면에 보이게 해 봐요.')
  expect(await page.getByLabel('이 기기의 내 모습').evaluate((v) =>
    v.srcObject.getVideoTracks().every((track) => track.readyState === 'live'))).toBe(true)
})

test('분석 중 오류도 자동 복구하고 실패한 분석기를 닫는다', async ({ page }) => {
  await fakeDetector(page)
  await openMirror(page, '?mirrorScore=1')
  await expect(status(page)).toHaveText('얼굴이 화면에 보이게 해 봐요.')
  await page.evaluate(() => { window.__failDetection = true })
  await expect(status(page)).toHaveText('표정 분석을 다시 준비하고 있어요.')
  await expect.poll(() => page.evaluate(() => window.__detectorStarts)).toBe(2)
  await expect(status(page)).toHaveText('얼굴이 화면에 보이게 해 봐요.')
  expect(await page.evaluate(() => window.__detectorCloses)).toBe(1)
})

test('다시 준비하는 중 쉬면 예약된 자동 재시도와 카메라가 함께 멈춘다', async ({ page }) => {
  await fakeDetector(page, { initialFailures: 100 })
  await openMirror(page, '?mirrorScore=1')
  await expect.poll(() => page.evaluate(() => window.__detectorStarts)).toBe(2)
  await page.getByLabel('이 기기의 내 모습').evaluate((v) => { window.__retryTracks = v.srcObject.getTracks() })
  await page.getByRole('button', { name: '쉬어 가기', exact: true }).click()
  await page.waitForTimeout(2300) // longer than the scheduled second retry (2 seconds)
  expect(await page.evaluate(() => window.__detectorStarts)).toBe(2)
  expect(await page.evaluate(() => window.__retryTracks.every((track) => track.readyState === 'ended'))).toBe(true)
  await page.getByRole('button', { name: '이어서 하기', exact: true }).click()
  await expect(page.getByRole('button', { name: '표정 연습하기', exact: true })).toBeVisible()
})
