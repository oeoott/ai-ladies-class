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
  narrate('함께 해요.')
  const first = lines[0]
  assert.equal(first.voice, korean)
  assert.equal(dataset.talking, undefined)
  first.onstart()
  assert.equal(dataset.talking, 'true')
  narrate('반가워요.')
  const second = lines[1]
  second.onstart()
  first.onend()
  assert.equal(dataset.talking, 'true')
  second.onpause()
  assert.equal(dataset.talking, undefined)
  second.onresume()
  assert.equal(dataset.talking, 'true')
  stopNarration()
  second.onresume()
  assert.equal(dataset.talking, undefined)
  document.hidden = true
  narrate('쉬어요.')
  assert.equal(lines.length, 2)
})
