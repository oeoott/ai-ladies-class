// Azure Speech client with a fake SDK (no network, no microphone). Real Azure and iPad behaviour are not
// verified here (docs/ai/HANDOFF-AI.md).
import assert from 'node:assert/strict'
import test from 'node:test'
import { createAzureSpeech } from '../src/azureSpeech.js'
import { readSpeechSetting, saveSpeechSetting } from '../src/speechSettings.js'
import { createApi } from '../src/api.js'

function fakeSdk() {
  const log = []
  const sdk = {
    log,
    ResultReason: { RecognizedSpeech: 3, NoMatch: 0, SynthesizingAudioCompleted: 10 },
    SpeechConfig: { fromAuthorizationToken: (token, region) => { log.push(['config', token, region]); return {} } },
    AudioConfig: {
      fromDefaultMicrophoneInput: () => { log.push(['mic']); return {} },
      fromSpeakerOutput: () => ({}),
    },
    next: { recognize: null, synth: null },
    SpeechRecognizer: class {
      constructor(config) { this.config = config; sdk.recognizer = this; log.push(['recognizer', config.speechRecognitionLanguage]) }
      recognizeOnceAsync(ok, fail) { this.sessionStarted?.(); sdk.finish = (r) => (r instanceof Error ? fail(r.message) : ok(r)) }
      close() { log.push(['recognizer.close']) }
    },
    SpeakerAudioDestination: class {
      constructor() { sdk.player = this }
      pause() { log.push(['player.pause']) }
      close() { log.push(['player.close']) }
    },
    SpeechSynthesizer: class {
      constructor(config) { this.config = config; log.push(['synth', config.speechSynthesisVoiceName]) }
      speakTextAsync(text, ok, fail) { log.push(['speak', text]); sdk.synthDone = (r) => (r instanceof Error ? fail('x') : ok(r)) }
      close() { log.push(['synth.close']) }
    },
  }
  return sdk
}

const tick = () => new Promise((r) => setTimeout(r, 0))
function engine({ sdk = fakeSdk(), token = { token: 't1', region: 'koreacentral', voice: 'ko-KR-SunHiNeural', expiresIn: 540 }, clock = { t: 0 } } = {}) {
  const calls = []
  const speech = createAzureSpeech({
    getToken: async () => { calls.push(clock.t); return typeof token === 'function' ? token() : token },
    loadSdk: async () => sdk,
    now: () => clock.t,
  })
  return { speech, sdk, calls, clock }
}

test('listen: token → ko-KR recognizer on the default microphone → the recognised sentence', async () => {
  const { speech, sdk } = engine()
  let started = false
  const run = speech.listen({ onStart: () => { started = true } })
  await tick(); await tick()
  assert.ok(started)
  assert.deepEqual(sdk.log.slice(0, 3), [['config', 't1', 'koreacentral'], ['mic'], ['recognizer', 'ko-KR']])
  sdk.finish({ reason: 3, text: ' 같이 놀자 ' })
  assert.equal(await run.result, '같이 놀자')
  assert.equal(speech.listening, false)
  assert.ok(sdk.log.some(([k]) => k === 'recognizer.close'))
})

test('nothing heard, an error, no token or a refused microphone give null (back to the choices)', async () => {
  const a = engine()
  const run = a.speech.listen()
  await tick(); await tick()
  a.sdk.finish({ reason: 0, text: '' })
  assert.equal(await run.result, null)

  const b = engine()
  const run2 = b.speech.listen()
  await tick(); await tick()
  b.sdk.finish(new Error('network'))
  assert.equal(await run2.result, null)

  const c = engine({ token: null })
  assert.equal(await c.speech.listen().result, null)

  const sdk = fakeSdk()
  sdk.AudioConfig.fromDefaultMicrophoneInput = () => { throw new Error('NotAllowedError') }
  assert.equal(await engine({ sdk }).speech.listen().result, null)
})

test('cancel ignores a late result and closes the recognizer', async () => {
  const { speech, sdk } = engine()
  const run = speech.listen()
  await tick(); await tick()
  run.cancel()
  assert.equal(await run.result, null)
  sdk.finish({ reason: 3, text: '늦게 온 말' }) // arrives after cancel: ignored
  assert.equal(await run.result, null)
  assert.ok(sdk.log.some(([k]) => k === 'recognizer.close'))
})

test('a newer listen cancels the older one', async () => {
  const { speech, sdk } = engine()
  const first = speech.listen()
  await tick(); await tick()
  const firstRecognizer = sdk.finish
  const second = speech.listen()
  assert.equal(await first.result, null)
  await tick(); await tick()
  firstRecognizer({ reason: 3, text: '첫 번째' })
  sdk.finish({ reason: 3, text: '두 번째' })
  assert.equal(await second.result, '두 번째')
})

test('listening stops playback first, and nothing is spoken while the microphone is open (echo)', async () => {
  const { speech, sdk } = engine()
  speech.speak('안녕')
  await tick(); await tick()
  assert.ok(sdk.log.some(([k, v]) => k === 'speak' && v === '안녕'))
  speech.listen()
  assert.ok(sdk.log.some(([k]) => k === 'player.pause') && sdk.log.some(([k]) => k === 'player.close'))
  const count = sdk.log.filter(([k]) => k === 'speak').length
  speech.speak('들리면 안 돼')
  await tick(); await tick()
  assert.equal(sdk.log.filter(([k]) => k === 'speak').length, count)
})

test('speak uses the server voice, reports start and end, and falls back on failure', async () => {
  const { speech, sdk } = engine()
  const seen = []
  speech.speak('동화를 읽어요', { onStart: () => seen.push('start'), onEnd: () => seen.push('end'), onError: () => seen.push('error') })
  await tick(); await tick()
  assert.ok(sdk.log.some(([k, v]) => k === 'synth' && v === 'ko-KR-SunHiNeural'))
  sdk.player.onAudioStart()
  sdk.synthDone({ reason: 10 })
  sdk.player.onAudioEnd()
  assert.deepEqual(seen, ['start', 'end'])

  const failed = []
  speech.speak('실패', { onError: () => failed.push('error') })
  await tick(); await tick()
  sdk.synthDone(new Error('x'))
  assert.deepEqual(failed, ['error'])

  const noToken = engine({ token: null })
  const fallback = []
  noToken.speech.speak('토큰 없음', { onError: () => fallback.push('error') })
  await tick(); await tick()
  assert.deepEqual(fallback, ['error'])
})

test('the token is reused until 30 s before it expires', async () => {
  const clock = { t: 0 }
  const { speech, sdk, calls } = engine({ clock })
  for (const at of [0, 400_000, 509_000, 511_000]) {
    clock.t = at
    speech.listen()
    await tick(); await tick()
    sdk.finish({ reason: 0 })
  }
  assert.deepEqual(calls, [0, 511_000]) // 540 s − 30 s = 510 s
})

test('the guardian choice: device by default, Azure only with consent', () => {
  const store = new Map()
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  assert.deepEqual(readSpeechSetting(storage), { provider: 'device', consentAt: null })
  assert.throws(() => saveSpeechSetting('azure', { storage }), /동의/)
  saveSpeechSetting('azure', { consent: true, now: new Date('2026-11-28T00:00:00Z'), storage })
  assert.deepEqual(readSpeechSetting(storage), { provider: 'azure', consentAt: '2026-11-28T00:00:00.000Z' })
  store.set('maeum-forest.speech.v1', JSON.stringify({ provider: 'azure' })) // no consent recorded
  assert.equal(readSpeechSetting(storage).provider, 'device')
  saveSpeechSetting('device', { storage })
  assert.equal(readSpeechSetting(storage).provider, 'device')
})

test('api: status without a server is null; the token request uses the learner child id', async () => {
  assert.equal(await createApi('').speechStatus(), null)
  const sent = []
  const api = createApi('http://server', {
    send: async (url, init) => {
      sent.push([url, init.method, init.body && JSON.parse(init.body)])
      return { ok: true, status: 200, json: async () => ({ token: 't', region: 'koreacentral', expires_in: 540 }) }
    },
    learner: () => ({ childId: 'device-1', token: null }),
  })
  assert.deepEqual(await api.speechToken(), { token: 't', region: 'koreacentral', expiresIn: 540 })
  await api.speechStatus()
  assert.deepEqual(sent, [['http://server/speech/token', 'POST', { child_id: 'device-1' }], ['http://server/speech/status', 'GET', undefined]])
})
