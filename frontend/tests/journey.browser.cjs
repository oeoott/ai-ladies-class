// Start Vite and run with Playwright installed locally or available through NODE_PATH.
// QA_URL, QA_ENGINES (comma-separated), QA_SCREENSHOTS and QA_{WEBKIT,CHROMIUM}_PATH are optional.
const assert = require('node:assert/strict')
const { mkdir } = require('node:fs/promises')
const path = require('node:path')
const playwright = require('playwright')

const url = process.env.QA_URL || 'http://127.0.0.1:4178/'
const output = process.env.QA_SCREENSHOTS
const cases = [
  { engine: 'webkit', width: 1194, height: 834, basic: false, next: 'sad', days: 2 },
  { engine: 'webkit', width: 834, height: 1194, basic: true, next: 'surprise', days: 1 },
  { engine: 'chromium', width: 1024, height: 768, basic: true, next: 'anger', days: 3 },
  { engine: 'chromium', width: 768, height: 1024, basic: false, next: 'surprise', days: 1 },
]
const topics = {
  joy: ['기쁨', '물 주기', '입꼬리', '기뻐요', '슬퍼요', '즐거워요'],
  surprise: ['놀람', '상자 열기', '눈과 입', '놀랐어요', '슬퍼요', '깜짝 놀랐어요'],
  sad: ['슬픔', '그림 펼치기', '입꼬리', '슬퍼요', '기뻐요', '속상해요'],
  anger: ['화남', '수레 밀기', '눈썹', '화나요', '기뻐요', '화가 나요'],
}

async function walk(browser, config) {
  const { engine, width, height, basic, next, days } = config
  const run = engine + '-' + width
  const ctx = await browser.newContext({
    viewport: { width, height }, hasTouch: true, isMobile: true,
    locale: 'ko-KR', timezoneId: 'Asia/Seoul', reducedMotion: basic ? 'reduce' : 'no-preference',
  })
  // Control only hardware outcomes. The app still owns permission requests and recognition lifecycle.
  await ctx.addInitScript(({ basic }) => {
    window.qaCamera = []
    Object.defineProperty(navigator, 'mediaDevices', { value: { async getUserMedia(options) {
      window.qaCamera.push(options)
      throw new DOMException('Test camera permission declined', 'NotAllowedError')
    } } })
    class LocalVoice {
      static async available() { return 'available' }
      start() {
        if (!this.processLocally || this.lang !== 'ko-KR') throw Error('Unexpected recognition request')
        window.qaListening = this
        this.onstart()
      }
      abort() { window.qaListening = null }
    }
    LocalVoice.prototype.processLocally = false
    Object.defineProperty(window, 'SpeechRecognition', { configurable: true, value: basic ? undefined : LocalVoice })
    Object.defineProperty(window, 'webkitSpeechRecognition', { configurable: true, value: undefined })
  }, { basic })
  const p = await ctx.newPage()
  p.setDefaultTimeout(45000)
  await p.clock.setFixedTime(new Date('2026-11-14T03:00:00Z'))
  const problems = []
  const logs = new Set()
  const errors = []
  p.on('pageerror', error => errors.push(error.message))
  p.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith(url)) errors.push(response.status() + ' ' + response.url())
  })
  const button = name => p.getByRole('button', { name, exact: true })
  const click = name => button(name).click()
  const heading = name => p.getByRole('heading', { name, exact: true }).waitFor()
  const group = name => p.getByRole('group', { name, exact: true }).getByRole('button')
  const state = () => p.evaluate(() => JSON.parse(localStorage.getItem('maeum-forest.walk.v1')))
  let stage = 'entrance'
  async function inspect(label) {
    stage = label
    await p.evaluate(() => document.fonts.ready)
    const issues = await p.evaluate(() => {
      const dialog = document.querySelector('dialog[open]')
      const content = dialog || document.querySelector('main')
      const found = []
      if (document.documentElement.scrollWidth > innerWidth + 1 || (dialog && dialog.scrollWidth > dialog.clientWidth + 1)) found.push('horizontal overflow')
      for (const el of content.querySelectorAll('button, input, a[href]')) {
        const box = el.getBoundingClientRect()
        if (box.width && box.height && (box.width < 47.5 || box.height < 47.5)) found.push((el.getAttribute('aria-label') || el.textContent.trim()) + ' touch ' + Math.round(box.width) + 'x' + Math.round(box.height))
      }
      if (!dialog && content.querySelector('.edu-board') && !content.querySelector('.scene-content .edu-portrait')) found.push('missing guide')
      return found
    })
    for (const issue of issues) problems.push(label + ': ' + issue)
    logs.add(label)
    if (output) await p.screenshot({ path: path.join(output, run + '-' + label + '.jpg'), type: 'jpeg', quality: 55 })
  }
  async function unlock(testWrong = false) {
    await click('보호자')
    const pin = p.locator('input[name=pin]')
    if (testWrong) {
      await pin.fill('3210')
      await click('열기')
      await p.getByRole('alert').waitFor()
    }
    await pin.fill('0123')
    await click('열기')
    await heading('보호자 설정')
  }
  async function diagnosis(wantHint) {
    await heading('기쁨')
    await inspect('diagnosis-intro')
    const meaning = await p.locator('.edu-intro-guide .edu-paper > p').innerText()
    await click('다음')
    assert.notEqual(await p.locator('.edu-intro-guide .edu-paper > p').innerText(), meaning)
    await click('다음')
    await heading('기쁜 얼굴을 눌러 보아요.')
    if (wantHint) {
      await p.locator('.edu-picture-choice').nth(1).click()
      await heading('아까워요! 다시 생각해 볼까요?')
      await p.getByText('웃으면서 입꼬리가 올라간 얼굴을 찾아봐요.').waitFor()
      await click('다시 골라 보기')
    }
    await inspect('diagnosis-choice')
    await p.locator('.edu-picture-choice').first().click()
    await heading('딩동댕! 맞았어요!')
    await click('다음 얼굴 보기')
    await heading('놀람')
    await click('다음')
    await click('다음')
    await heading('놀란 얼굴을 눌러 보아요.')
    await p.locator('.edu-picture-choice').nth(1).click()
    await heading('딩동댕! 맞았어요!')
    await click('진단 마치기')
    assert.equal((await state()).level, wantHint ? 'basic' : 'expand')
  }
  async function lesson(id, full, wantHint) {
    const [emotion, action, cue, word, wrong, kin] = topics[id]
    const review = Boolean((await state()).reviewTopicId)
    await heading(emotion)
    await inspect(id + '-intro')
    assert.equal(await p.locator('.edu-intro-guide .edu-paper > p').count(), 1)
    await click('다음')
    await inspect(id + '-example')
    if (full) {
      const example = await p.locator('.edu-intro-guide .edu-paper > p').innerText()
      await click('이전')
      await click('다음')
      await p.reload()
      await click('산책 이어가기')
      assert.equal(await p.locator('.edu-intro-guide .edu-paper > p').innerText(), example)
    }
    await click('다음')
    await inspect(id + '-experiment')
    await click(action)
    await inspect(id + '-reaction')
    assert.equal(await group('표정 단서').count(), 0)
    await click('표정 살펴보기')
    await inspect(id + '-discovery')
    assert.ok(await p.locator('.face-detail').evaluate(el => parseFloat(getComputedStyle(el).borderTopWidth) > 0))
    if (full) {
      await click('이전')
      await click('표정 살펴보기')
      const other = (await group('표정 단서').allTextContents()).find(s => !s.includes(cue))
      await click(other.trim())
      await heading('아까워요! 다시 생각해 볼까요?')
      await inspect(id + '-cue-retry')
      await click('다시 골라 보기')
    }
    await click(cue)
    await heading('딩동댕! 맞았어요!')
    await click('마음 낱말 고르기')
    await heading('어떤 마음일까요?')
    await inspect(id + '-words')
    if (full) {
      await click(wrong)
      if (!wantHint) await click('선택 확인하기')
      await heading('아까워요! 다시 생각해 볼까요?')
      await inspect(id + '-word-retry')
      await click('다시 골라 보기')
    }
    await click(word)
    if (!wantHint) { await click(kin); await click('선택 확인하기') }
    await heading('딩동댕! 맞았어요!')
    await click('감정 탐색 마치기')
    await heading('감정 탐색을 마쳤어요')
    await inspect(id + '-search-done')
    await click('다음 학습 시작')
    await heading('표정을 따라 해 봐요')
    await inspect(id + '-mirror')
    assert.equal(await p.locator('.journey-stop.is-complete').count(), 1)
    assert.equal(await p.locator('.journey-stop.is-complete').evaluate(el => getComputedStyle(el, '::after').borderTopStyle), 'solid')
    assert.equal(await button('카메라로 내 모습 보기').innerText(), '')
    if (full) {
      const layout = await p.locator('.edu-mirror-actions').evaluate(row => {
        const [camera, done] = [...row.querySelectorAll('button')].map(el => el.getBoundingClientRect())
        return { camera: camera.height, done: done.height, top: Math.abs(camera.top - done.top),
          left: Math.abs(camera.left - row.getBoundingClientRect().left), right: Math.abs(done.right - row.getBoundingClientRect().right) }
      })
      console.log(run, 'mirror', JSON.stringify(layout))
      if (Math.abs(layout.camera - layout.done) > 1 || layout.top > 1 || layout.left > 1 || layout.right > 1) problems.push('mirror pair ' + JSON.stringify(layout))
      await click('표정 크게 보기')
      await click('얼굴 전체 보기')
      await click('카메라로 내 모습 보기')
      await button('카메라 다시 켜기').waitFor()
      const requests = await p.evaluate(() => window.qaCamera)
      assert.equal(requests.length, 1)
      assert.equal(requests[0].audio, false)
      assert.ok(requests[0].video)
      await click('쉬어 가기')
      await heading('잠깐 쉬어 가요')
      await inspect('rest')
      const resume = p.getByRole('dialog').getByRole('button', { name: '이어서 하기' })
      assert.equal(await resume.locator('svg.lucide-play').count(), 1)
      await resume.click()
      await p.getByRole('status').filter({ hasText: '이제 다시 이어가 볼까요?' }).waitFor()
    }
    await click('표정 연습 마쳤어요')
    await inspect(id + '-express')
    await group('마음을 전하는 방법').nth(Number(wantHint)).click()
    await inspect(id + '-response')
    await click('친구의 답 보기')
    await click('연습 마치기')
    await heading('표정 거울을 마쳤어요')
    await inspect(id + '-mirror-done')
    await click('다음 학습 시작')
    for (let n = 1; n <= 2; n++) {
      await inspect(id + '-story-' + n)
      await click('다음 장')
      if (n === 1 && full) {
        const text = await p.locator('.edu-story').innerText()
        await p.reload()
        await click('산책 이어가기')
        assert.equal(await p.locator('.edu-story').innerText(), text)
      }
    }
    await inspect(id + '-story-3')
    if (id === 'surprise') {
      assert.equal(await p.locator('.edu-story').innerText(), '나비가 팔랑 날아올랐어요.')
      await click('다음 문장')
      assert.match(await p.locator('.edu-story').innerText(), /^깜짝 놀란 .+는 한 걸음 물러났어요\.$/)
      await click('이전')
      assert.equal(await p.locator('.edu-story').innerText(), '나비가 팔랑 날아올랐어요.')
      await click('다음 문장')
    }
    await click('장면 살펴보기')
    await inspect(id + '-situation')
    await click('내가 해 보기')
    await inspect(id + '-actions')
    await p.locator('.tale-action').first().click()
    await click('친구의 말 듣기')
    const first = await p.locator('blockquote').innerText()
    await inspect(id + '-outcome-1')
    await click('다른 방법 해 보기')
    await p.locator('.tale-action').nth(1).click()
    await click('친구의 말 듣기')
    assert.notEqual(await p.locator('blockquote').innerText(), first)
    await inspect(id + '-outcome-2')
    await click('친구와 대화하기')
    await inspect(id + '-dialogue')
    if (!basic) {
      await click('말로 답하기')
      await button('듣기 멈추기').waitFor()
      await click('쉬어 가기')
      assert.equal(await p.evaluate(() => Boolean(window.qaListening)), false)
      await p.getByRole('dialog').getByRole('button', { name: '이어서 하기' }).click()
      await click('말로 답하기')
      await button('듣기 멈추기').waitFor()
      const answer = await group('친구에게 보낼 말').first().textContent()
      await p.evaluate(transcript => window.qaListening.onresult({ resultIndex: 0, results: [[{ transcript }]] }), answer)
    } else {
      assert.equal(await button('말로 답하기').count(), 0)
      await group('친구에게 보낼 말').nth(1).click()
    }
    await inspect(id + '-reply')
    await click('조금 더 이야기하기')
    await group('친구에게 보낼 말').nth(1).click()
    await heading('이야기를 마쳤어요')
    await inspect(id + '-ending')
    await click('산책 마무리하기')
    if (!review) {
      await heading('동화 놀이를 마쳤어요')
      await inspect(id + '-praise')
      await click('스티커판 보기')
    }
    await heading('마음숲 스티커판')
    await inspect(id + '-stickers')
  }
  try {
    await p.goto(url)
    await inspect('entrance')
    await click('시작하기')
    await inspect('parents')
    if (basic) { await click('혼자 있어요'); await click('부모님이 오셨어요') }
    else await click('함께 있어요')
    await inspect('email')
    await click('다음')
    await p.getByRole('alert').waitFor()
    await p.getByRole('textbox', { name: '보호자 이메일' }).fill('forest-qa@example.invalid')
    await click('다음')
    await inspect('pin')
    await p.locator('input[name=pin]').fill('0123')
    await p.locator('input[name=confirm]').fill('2222')
    await click('비밀번호 저장')
    await p.getByRole('alert').waitFor()
    await p.locator('input[name=confirm]').fill('0123')
    await click('비밀번호 저장')
    await inspect('cards')
    await click(basic ? '여자아이' : '남자아이')
    await inspect('friend')
    if (await button('이 친구와 함께하기').count()) {
      await click(basic ? '토끼' : '사자')
      await click('이 친구와 함께하기')
    } else await click(basic ? '토끼 보리' : '사자 라온')
    await heading(basic ? '안녕! 나는 보리야. 나랑 같이 놀자!' : '안녕! 나는 라온이야. 나랑 같이 놀자!')
    await inspect('hello')
    await click('함께 시작하기')
    const src = await p.locator('.edu-emotion-card').first().getAttribute('src')
    assert.ok(src.endsWith(basic ? '/girl-joy.webp' : '/joy.webp'))
    await diagnosis(basic)
    await inspect('ready')
    await unlock(true)
    await inspect('guardian')
    await click('숲 친구')
    await inspect('studio')
    await click('곰')
    await click('꽃 머리핀')
    await click('별')
    await click('꾸미기 완료')
    await click('닫기')
    assert.equal((await state()).friendId, 'bear')
    assert.equal((await state()).friendCharm, 'star')
    await click('학습 시작하기')
    await lesson('joy', true, basic)
    assert.equal((await state()).records.length, 1)
    await unlock()
    await click('학습 리포트')
    const mail = await p.getByRole('link', { name: '메일 앱에서 리포트 열기' }).getAttribute('href')
    assert.match(decodeURIComponent(mail), /forest-qa@example.invalid.*기쁨/s)
    await click('닫기')
    await click('닫기')
    await p.getByRole('button', { name: /^기쁨 다시 하기/ }).click()
    await heading('기쁨')
    await p.reload()
    await click('산책 이어가기')
    assert.equal((await state()).reviewTopicId, 'joy')
    // Continue a saved review through completion to check that the daily reward stays unique.
    await lesson('joy', false, basic)
    assert.equal((await state()).records.length, 1)
    await click('놀람 학습 시작')
    await heading('놀람')
    assert.equal((await state()).reviewTopicId, 'surprise')
    await lesson('surprise', false, basic)
    assert.equal((await state()).records.length, 1)
    await click('산책 마치기')
    await button('오늘 학습 다시 하기').waitFor()
    await p.clock.setFixedTime(new Date(Date.UTC(2026, 10, 14 + days, 3)))
    await p.reload()
    await p.locator('.entrance-button').click()
    await lesson(next, false, basic)
    assert.equal((await state()).records.length, 2)
    assert.deepEqual(errors, [])
    console.log(run, 'PASS', logs.size, 'distinct screens', 'stickers', (await state()).records.map(r => r.topic))
    console.log(run, 'layout', [...new Set(problems)])
    assert.deepEqual([...new Set(problems)], [], run + ' layout issues')
  } catch (error) {
    throw new Error(run + ' near ' + stage + ': ' + error.message + '\n' + (await p.locator('body').innerText().catch(() => '')), { cause: error })
  } finally { await ctx.close() }
}

async function main() {
  if (output) await mkdir(output, { recursive: true })
  const engines = (process.env.QA_ENGINES || 'webkit,chromium').split(',')
  const results = await Promise.allSettled(engines.map(async engine => {
    assert.ok(['webkit', 'chromium'].includes(engine), 'Unknown browser ' + engine)
    const browser = await playwright[engine].launch({ executablePath: process.env['QA_' + engine.toUpperCase() + '_PATH'] })
    try {
      const runs = await Promise.allSettled(cases.filter(c => c.engine === engine).map(c => walk(browser, c)))
      const failures = runs.filter(r => r.status === 'rejected').map(r => r.reason.message)
      assert.deepEqual(failures, [])
    } finally { await browser.close() }
  }))
  for (const result of results) if (result.status === 'rejected') { console.error(result.reason); process.exitCode = 1 }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
