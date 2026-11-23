import assert from 'node:assert/strict'
import test from 'node:test'
import { api, createApi } from '../src/api.js'

test('api returns null without a server address and never sends', async () => {
  let sent = 0
  const offline = createApi('', { send: async () => { sent += 1 } })
  assert.equal(offline.enabled, false)
  assert.equal(await offline.startWalk({ childId: 'c', topicId: 'joy', level: 'basic' }), null)
  assert.equal(await offline.sendTalkTurn('t1', { choiceIndex: 0 }), null)
  assert.equal(sent, 0)
  assert.equal(api.enabled, false)
})

test('api sends snake_case and returns camelCase', async () => {
  const calls = []
  const online = createApi('http://server/', { send: async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) })
    return { ok: true, json: async () => ({ reply: '고마워요.', finished: false, fallback_to_picture: true }) }
  } })
  const result = await online.sendTalkTurn('t 1', { text: '같이 놀자', inputMode: 'voice' })
  assert.deepEqual(calls[0], {
    url: 'http://server/conversations/t%201/turn',
    body: { choice_index: null, text: '같이 놀자', input_mode: 'voice' },
  })
  assert.deepEqual(result, { reply: '고마워요.', finished: false, fallbackToPicture: true })
})

test('api returns null on error status, network failure and timeout', async () => {
  const failing = createApi('http://server', { send: async () => ({ ok: false, json: async () => ({}) }) })
  assert.equal(await failing.completeWalk('w1'), null)
  const broken = createApi('http://server', { send: async () => { throw new TypeError('offline') } })
  assert.equal(await broken.completeWalk('w1'), null)
  const slow = createApi('http://server', { timeout: 10, send: (url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  }) })
  assert.equal(await slow.completeWalk('w1'), null)
})
