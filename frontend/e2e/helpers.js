// Shared steps for the browser tests.
// Every line the child sees in a lesson comes from backend/app/content (emotions.json, tales.json):
// the tests read the same files instead of copying sentences, so editing the script does not break them.
import { readFileSync } from 'node:fs'
import { expect } from '@playwright/test'
import { BACKEND } from './ports.js'

const content = (name) => JSON.parse(readFileSync(new URL(`../../backend/app/content/${name}`, import.meta.url), 'utf8'))
export const emotions = content('emotions.json')
export const tales = content('tales.json')
export const topicIds = Object.keys(emotions)

export const PIN = '2580'
export const STORAGE_KEY = 'maeum-forest.walk.v1'
export const DEVICE_KEY = 'maeum-forest.child-id.v1'
export const GUARDIAN_KEY = 'maeum-forest.guardian.v1'

// Korean date, as the app (Asia/Seoul in the test browser) and the backend count days.
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())

// '라온과', '보리와': the talk title is '<friend>와/과 나누는 이야기'.
export function withFriend(name) {
  const code = name.charCodeAt(name.length - 1) - 0xac00
  return name + (code >= 0 && code < 11172 && code % 28 !== 0 ? '과' : '와')
}
export const talkTitle = (name = '라온') => withFriend(name) + ' 나누는 이야기'
// Talk questions name the friend with {친구} (라온 → 라온이), as the screen shows them.
export const named = (text, familiar = '라온이') => text.replaceAll('{친구}', familiar)

// --- Fakes installed before the app loads ---
// Narration: recordings and the speech voice "finish" at once, so the scenes that move on after the
// narration (emotion introductions) do so after their usual 2 second hold, not after a real recording.
// Speech recognition: an on-device recogniser (available() and processLocally, as voiceSupported() needs).
// Each start() takes the next plan from window.__voicePlan: { transcript } or { error }, with optional delay.
function installFakes({ voice }) {
  class FakeAudio {
    constructor(src) { this.src = src }
    play() {
      setTimeout(() => { this.onplaying?.(); setTimeout(() => this.onended?.(), 20) }, 10)
      return Promise.resolve()
    }
    pause() {}
  }
  window.Audio = FakeAudio
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      speak(line) { setTimeout(() => { line.onstart?.(); setTimeout(() => line.onend?.(), 20) }, 10) },
      cancel() {},
      getVoices: () => [],
    },
  })
  if (!voice) {
    delete window.SpeechRecognition
    delete window.webkitSpeechRecognition
    return
  }
  window.__voicePlan = []
  window.__voiceStarts = 0
  class FakeRecognition {
    static available() { return Promise.resolve('available') }
    start() {
      window.__voiceStarts += 1
      const plan = window.__voicePlan.shift() || { error: 'no-speech' }
      setTimeout(() => {
        this.onstart?.()
        setTimeout(() => {
          if (plan.transcript) this.onresult?.({ resultIndex: 0, results: [[{ transcript: plan.transcript }]] })
          else this.onerror?.({ error: plan.error })
        }, plan.delay ?? 50)
      }, 10)
    }
    abort() {}
    stop() {}
  }
  FakeRecognition.prototype.processLocally = false
  window.SpeechRecognition = FakeRecognition
  delete window.webkitSpeechRecognition
}

export async function prepare(page, { voice = true } = {}) {
  await page.addInitScript(installFakes, { voice })
}

// The next recognised sentence(s) or failure for '말로 답하기'.
export async function planVoice(page, ...plans) {
  await page.evaluate((list) => window.__voicePlan.push(...list), plans)
}

// --- Seeded state: start a test at a later scene without walking there again ---
// Written only when nothing is stored, so a reload keeps what the app saved.
export async function seedSession(page, { topicId, activity, walkId = null, deviceId = null, level = 'basic' }) {
  const session = {
    version: 1, day: today(), topicId, reviewTopicId: null, reviewReturn: null, page: 'lesson',
    friendId: 'lion', cardPortrait: 'boy', friendCharm: null, friendHeadwear: null, friendNickname: '',
    onboarded: true, level, step: 2, placement: null, activity: { step: 2, topic: topicId, ...activity },
    retestReturn: null, walkId, records: [],
  }
  await page.addInitScript(({ key, value, deviceKey, device }) => {
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, value)
    if (device) localStorage.setItem(deviceKey, device)
  }, { key: STORAGE_KEY, value: JSON.stringify(session), deviceKey: DEVICE_KEY, device: deviceId })
}

export const newDeviceId = () => 'device-' + crypto.randomUUID()

// A walk on the backend for a device child (what the app does when a lesson starts).
export async function startWalk(request, { deviceId, topicId }) {
  const response = await request.post(BACKEND + '/walks', {
    data: { child_id: deviceId, topic_id: topicId, level: 'basic', day: today() },
  })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).id
}

export async function readStored(page, key) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), key)
}

// --- Walking through the app with taps, as a child and a guardian would ---
const button = (page, name) => page.getByRole('button', { name, exact: true })
const heading = (page, name) => page.getByRole('heading', { name, exact: true })
const dialog = (page, name) => page.getByRole('dialog', { name })

// First visit: start → with a parent → parent email → guardian PIN → face cards → friend → hello.
export async function onboard(page, { email = 'parent@example.com' } = {}) {
  await button(page, '시작하기').click()
  await dialog(page, '부모님과 함께 있나요?').getByRole('button', { name: '함께 있어요' }).click()
  const signup = dialog(page, '부모님 이메일')
  await signup.getByRole('textbox', { name: '보호자 이메일' }).fill(email)
  await signup.getByRole('button', { name: '다음' }).click()
  const gate = dialog(page, '보호자 비밀번호')
  await gate.getByLabel('새 비밀번호 (숫자 4자리)').fill(PIN)
  await gate.getByLabel('비밀번호 한 번 더').fill(PIN)
  await gate.getByRole('button', { name: '비밀번호 저장' }).click()
  await dialog(page, '어떤 얼굴로 연습할까요?').getByRole('button', { name: '남자아이' }).click()
  await dialog(page, '어떤 친구와 함께할까요?').getByRole('button', { name: '사자 라온' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '함께 시작하기' }).click()
}

// Level test: the two introductions move on by themselves. hint: tap a wrong face first (basic level).
export async function placement(page, { hint = false } = {}) {
  await expect(heading(page, '기쁜 얼굴을 눌러 보아요.')).toBeVisible({ timeout: 20_000 })
  if (hint) {
    await button(page, emotions.sad.clue).click()
    await expect(page.getByRole('status').filter({ hasText: '입꼬리' })).toBeVisible()
  }
  await button(page, emotions.joy.clue).click()
  await expect(heading(page, '놀란 얼굴을 눌러 보아요.')).toBeVisible({ timeout: 20_000 })
  await button(page, emotions.surprise.clue).click()
  await expect(heading(page, '학습 진단을 마쳤어요')).toBeVisible()
  await button(page, '학습 시작하기').click()
}

// Lesson 1. basic: one wrong word, then the right one. expand: the word and its similar word.
export async function emotionLesson(page, topicId, level) {
  const e = emotions[topicId]
  const p = e.practice
  await expect(heading(page, p.beforeTitle)).toBeVisible({ timeout: 20_000 })
  await button(page, p.action).click()
  await expect(heading(page, p.afterTitle)).toBeVisible()
  await button(page, p.target).click()
  await expect(heading(page, '어떤 마음일까요?')).toBeVisible()
  if (level === 'expand') {
    await button(page, e.word).click()
    await page.getByRole('button', { name: e.kin }).click()
    await button(page, '선택 확인하기').click()
  } else {
    await button(page, e.opposite).click()
    await expect(page.locator('.edu-feedback')).toHaveText(e.clue)
    await button(page, e.word).click()
  }
  await expect(heading(page, '감정 탐색을 마쳤어요')).toBeVisible()
  await button(page, '다음 학습 시작').click()
}

// Lesson 2. camera: turn the fake camera on before finishing.
export async function mirrorLesson(page, topicId, { camera = false } = {}) {
  const way = emotions[topicId].practice.expression[0]
  await expect(heading(page, '표정을 따라 해 봐요')).toBeVisible()
  if (camera) {
    await button(page, '카메라로 내 모습 보기').click()
    await expect(button(page, '카메라 끄기')).toBeVisible({ timeout: 15_000 })
  }
  await button(page, '표정 연습 마쳤어요').click()
  await expect(heading(page, '내 마음을 전해 봐요')).toBeVisible()
  await button(page, way.action).click()
  await expect(page.locator('.edu-response-copy')).toHaveText(way.answer)
  await button(page, '연습 마치기').click()
  await expect(heading(page, '표정 거울을 마쳤어요')).toBeVisible()
  await button(page, '다음 학습 시작').click()
}

// Lesson 3 up to the talk question: three pages, the scene, one action and its result.
export async function storyToTalk(page, topicId, branch = 0) {
  const tale = tales[topicId]
  await expect(heading(page, tale.title)).toBeVisible()
  await button(page, '다음 장').click()
  await button(page, '다음 장').click()
  await button(page, '장면 살펴보기').click()
  await expect(heading(page, tale.situation)).toBeVisible()
  await button(page, '내가 해 보기').click()
  await expect(heading(page, '이때 어떻게 할까요?')).toBeVisible()
  await button(page, tale.actions[branch].label).click()
  await expect(heading(page, tale.actions[branch].title)).toBeVisible()
  await button(page, '친구와 대화하기').click()
  await expect(heading(page, talkTitle())).toBeVisible()
}

export const replyButtons = (page) => page.getByRole('group', { name: '친구에게 보낼 말' }).getByRole('button')
export const replyButton = (page, text) => page.getByRole('group', { name: '친구에게 보낼 말' }).getByRole('button', { name: text, exact: true })
// The friend's words (an action's result line, the friend's reply): the speech bubble by the friend.
export const friendLine = (page) => page.locator('.tale-speech')
// Narration in the card (the ending of the talk).
export const storyLine = (page) => page.locator('.edu-story[role="status"]')
export const saidNote = (page) => page.locator('p.edu-note', { hasText: '내가 한 말' })
export const voiceNote = (page) => page.locator('.edu-story-voice .edu-note')
export const friendFace = (page) => page.locator('.tale-cast [data-feeling][data-gesture]')

// After the talk's first reply: one more line, then the ending and the sticker board.
export async function finishTalk(page, topicId, extraChoice = 0) {
  const talk = tales[topicId].talk
  await button(page, '조금 더 이야기하기').click()
  await expect(page.locator('.edu-prompt')).toHaveText(named(talk.again))
  await replyButton(page, talk.extra[extraChoice]).click()
  await expect(heading(page, '이야기를 마쳤어요')).toBeVisible()
  await expect(storyLine(page)).toHaveText(talk.ends[extraChoice])
  await button(page, '산책 마무리하기').click()
  await expect(heading(page, '동화 놀이를 마쳤어요')).toBeVisible()
  await button(page, '스티커판 보기').click()
  await expect(heading(page, '마음숲 스티커판')).toBeVisible()
}

// Guardian menu behind the PIN.
export async function openGuardian(page) {
  await page.getByRole('button', { name: '보호자', exact: true }).click()
  const gate = dialog(page, '보호자 비밀번호')
  await gate.getByLabel('비밀번호 (숫자 4자리)').fill(PIN)
  await gate.getByRole('button', { name: '열기' }).click()
  await expect(dialog(page, '보호자 설정')).toBeVisible()
}

// --- Lesson 3 layout: where the friend, each prop and the card are drawn ---
// Boxes are the visible (non-transparent) part of each picture on screen, not the element's box:
// every prop and the friend picture has transparent margins. Hidden props (opacity 0 / display none) are left out.
export async function taleBoxes(page) {
  return page.evaluate(async () => {
    const opaque = new Map()
    async function alphaBox(url) { // [x0, y0, x1, y1] as fractions of the picture
      if (opaque.has(url)) return opaque.get(url)
      const img = new Image()
      img.src = url
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const g = c.getContext('2d')
      g.drawImage(img, 0, 0)
      const { data } = g.getImageData(0, 0, c.width, c.height)
      let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0
      for (let y = 0; y < c.height; y += 2) {
        for (let x = 0; x < c.width; x += 2) {
          if (data[(y * c.width + x) * 4 + 3] > 24) {
            if (x < x0) x0 = x
            if (x > x1) x1 = x
            if (y < y0) y0 = y
            if (y > y1) y1 = y
          }
        }
      }
      const box = [x0 / c.width, y0 / c.height, (x1 + 2) / c.width, (y1 + 2) / c.height]
      opaque.set(url, { box, w: img.naturalWidth, h: img.naturalHeight })
      return opaque.get(url)
    }
    const rect = (r) => ({ x: r.left, y: r.top, width: r.width, height: r.height })
    // The drawn part of a background picture inside an element (size contain or 100% 100%, any position),
    // mapped onto the element's on-screen box (which includes its transforms).
    async function drawn(el) {
      const cs = getComputedStyle(el)
      const screen = el.getBoundingClientRect()
      const url = (cs.backgroundImage.match(/url\("?(.*?)"?\)/) || [])[1]
      if (!url) return rect(screen)
      const { box, w, h } = await alphaBox(url)
      const W = el.offsetWidth, H = el.offsetHeight
      let dw = W, dh = H
      if (cs.backgroundSize === 'contain') {
        const s = Math.min(W / w, H / h)
        dw = w * s
        dh = h * s
      }
      const [px, py] = cs.backgroundPosition.split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5))
      const ox = (W - dw) * px, oy = (H - dh) * py
      const fx0 = (ox + box[0] * dw) / W, fx1 = (ox + box[2] * dw) / W
      const fy0 = (oy + box[1] * dh) / H, fy1 = (oy + box[3] * dh) / H
      return { x: screen.left + fx0 * screen.width, y: screen.top + fy0 * screen.height,
        width: (fx1 - fx0) * screen.width, height: (fy1 - fy0) * screen.height }
    }
    const items = []
    const head = document.querySelector('.tale-cast .edu-character-head')
    const friendImage = document.querySelector('.tale-cast image')
    const { box } = await alphaBox(friendImage.href.baseVal)
    const f = head.getBoundingClientRect()
    items.push({ name: 'friend', x: f.left + box[0] * f.width, y: f.top + box[1] * f.height,
      width: (box[2] - box[0]) * f.width, height: (box[3] - box[1]) * f.height })
    for (const el of document.querySelectorAll('.tale-props > span, .tale-props .tale-pinwheel')) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || Number(cs.opacity) === 0 || el.offsetWidth === 0) continue
      items.push({ name: [...el.classList].filter((c) => c !== 'tale-turn').join(' '), ...(await drawn(el)) })
    }
    // The friend's speech bubble, with its tail below it (::before, 18px).
    const speech = document.querySelector('.tale-speech')
    if (speech) {
      const r = speech.getBoundingClientRect()
      items.push({ name: 'speech', x: r.left, y: r.top, width: r.width, height: r.height + 18 })
    }
    return { card: rect(document.querySelector('.edu-paper').getBoundingClientRect()), items }
  })
}

export const boxOverlap = (a, b) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))

// Overlapping pairs (area > 1px²) among the friend and the props.
export function propOverlaps({ items }, allowed = () => false) {
  const pairs = []
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const area = boxOverlap(items[i], items[j])
      if (area > 1 && !allowed(items[i].name, items[j].name)) pairs.push(`${items[i].name} × ${items[j].name}: ${Math.round(area)}`)
    }
  }
  return pairs
}
