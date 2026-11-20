import assert from 'node:assert/strict'
import test from 'node:test'
import { narrate, stopNarration } from '../src/narration.js'

test('only the current audible line moves the guide’s mouth', (t) => {
  const lines = []
  const dataset = {}
  const korean = { lang: 'ko-KR', name: '한국어', localService: true }
  globalThis.document = { documentElement: { dataset }, hidden: false }
  globalThis.window = {
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text } },
    speechSynthesis: {
      getVoices: () => [{ lang: 'en-US' }, korean],
      speak: line => lines.push(line),
      cancel() {},
    },
  }
  t.after(() => { delete globalThis.window; delete globalThis.document })
  let completed = 0
  const onEnd = () => { completed++ }
  narrate('함께 해요.', { onEnd })
  const first = lines[0]
  assert.equal(first.voice, korean)
  assert.equal(dataset.talking, undefined)
  first.onstart()
  assert.equal(dataset.talking, 'true')
  narrate('반가워요.', { onEnd })
  const second = lines[1]
  second.onstart()
  first.onend()
  assert.equal(completed, 0)
  assert.equal(dataset.talking, 'true')
  second.onpause()
  assert.equal(dataset.talking, undefined)
  second.onresume()
  assert.equal(dataset.talking, 'true')
  stopNarration()
  second.onresume()
  assert.equal(dataset.talking, undefined)
  second.onend()
  assert.equal(completed, 0)
  narrate('기쁨을 배워요.', { onEnd })
  lines[2].onend()
  lines[2].onend()
  assert.equal(completed, 1)
  document.hidden = true
  narrate('쉬어요.')
  assert.equal(lines.length, 3)
})

test('a recorded line animates the guide and falls back if playback is blocked', async (t) => {
  const dataset = {}
  const recordings = []
  const spoken = []
  let blocked = false
  globalThis.document = { documentElement: { dataset }, hidden: false }
  globalThis.window = {
    Audio: class {
      constructor(url) { recordings.push(this); this.url = url }
      play() { return blocked ? Promise.reject(new Error('blocked')) : Promise.resolve() }
      pause() {}
    },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text } },
    speechSynthesis: {
      getVoices: () => [],
      speak: (line) => spoken.push(line),
      cancel() {},
    },
  }
  t.after(() => { stopNarration(); delete globalThis.window; delete globalThis.document })
  let ended = 0
  narrate('안녕!', { recording: '/audio/raon/hello.mp3', onEnd: () => ended++ })
  const clip = recordings[0]
  clip.onplaying()
  assert.equal(dataset.talking, 'true')
  clip.onended()
  assert.equal(dataset.talking, undefined)
  assert.equal(ended, 1)
  blocked = true
  narrate('안녕!', { recording: clip.url })
  await Promise.resolve()
  assert.equal(spoken[0].text, '안녕!')
})
