import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createMirrorSession, mirrorLine, scoringEnabled } from '../src/mirrorSession.js'
import { createApi } from '../src/api.js'

const baseline = JSON.parse(readFileSync(new URL('../src/mirrorBaseline.json', import.meta.url)))
const joyFace = (k) => ({ faces: [{ mouthSmileLeft: 0.6 * k, mouthSmileRight: 0.6 * k, cheekSquintLeft: 0.35 * k,
  cheekSquintRight: 0.35 * k }] })

function feed(session, frame, from, ms) {
  let view
  for (let t = from; t <= from + ms; t += 100) view = session.frame(frame, t)
  return view
}

test('pictures only: touch mode, skipped, nothing scored', () => {
  const session = createMirrorSession(baseline, 'joy')
  assert.deepEqual(session.record(), {
    mode: 'touch', score: null, skipped: false, scoreVersion: null, stars: null, trackedSec: null, attempts: 0,
    endReason: 'skipped' })
})

test('camera refused: touch mode with cameraDenied', () => {
  const session = createMirrorSession(baseline, 'joy')
  session.cameraFailed()
  assert.equal(session.record().endReason, 'cameraDenied')
  assert.equal(session.record().mode, 'touch')
})

test('camera, calibration, a held expression: locked result with version, stars and tracked time', () => {
  const session = createMirrorSession(baseline, 'joy', { force: true })
  assert.equal(session.frame(joyFace(0), 0), null) // camera not on yet
  session.cameraStarted(0)
  assert.equal(feed(session, joyFace(0), 0, 2900).phase, 'calibrating')
  feed(session, joyFace(0), 3000, 0)
  // ramp up in small steps (tracking would call a big jump unstable), then hold
  for (let i = 1; i <= 4; i += 1) session.frame(joyFace(i / 4), 3000 + i * 100)
  const view = feed(session, joyFace(1), 3500, 3000)
  assert.equal(view.phase, 'locked')
  const record = session.record()
  assert.deepEqual({ ...record, trackedSec: undefined }, {
    mode: 'camera', score: 100, skipped: false, scoreVersion: baseline.version, stars: 3, trackedSec: undefined,
    attempts: 1, endReason: 'locked' })
  assert.ok(record.trackedSec >= 6 && record.trackedSec <= 7, record.trackedSec)
})

test('turning the camera off clears the hold and calibration; the visit keeps the best result and adds up time', () => {
  const session = createMirrorSession(baseline, 'joy', { force: true })
  session.cameraStarted(0)
  feed(session, joyFace(0), 0, 3000)
  for (let i = 1; i <= 2; i += 1) session.frame(joyFace(i / 4), 3000 + i * 100)
  feed(session, joyFace(0.5), 3300, 1500) // some stars, not yet held for 3 s
  session.cameraStopped()
  const first = session.record()
  assert.equal(first.endReason, 'exit')
  assert.ok(first.score > 0 && first.stars >= 1)
  session.cameraStarted(10000)
  assert.equal(session.frame(joyFace(0.5), 10000).phase, 'calibrating') // calibrates again
  feed(session, joyFace(0.5), 10100, 3000)
  const again = session.record()
  assert.equal(again.attempts, 2)
  assert.ok(again.trackedSec > first.trackedSec + 2.9)
  assert.equal(again.score, first.score) // nothing better in the second try (calibrated on the same face)
})

test('a feeling without a baseline only shows presence and records no version', () => {
  const session = createMirrorSession(baseline, 'calm', { force: true })
  session.cameraStarted(0)
  assert.equal(session.supported, false)
  assert.equal(session.frame(joyFace(1), 0), null)
  assert.equal(session.record().scoreVersion, null)
})

test('child-facing lines: one short thing to do, no numbers or countdown', () => {
  const lines = [
    mirrorLine({ phase: 'calibrating' }), mirrorLine({ phase: 'paused', reason: 'noFace' }),
    mirrorLine({ phase: 'paused', reason: 'multiFace' }), mirrorLine({ phase: 'paused', reason: 'unstable' }),
    mirrorLine({ phase: 'scoring', stars: 1, hint: '입꼬리를 위로 올려 봐요.' }), mirrorLine({ phase: 'scoring', stars: 3 }),
    mirrorLine({ phase: 'locked', stars: 2 }),
  ]
  for (const line of lines) {
    assert.ok(typeof line === 'string' && !/\d/.test(line) && /요[.!]$/.test(line), line)
  }
  assert.equal(mirrorLine(null), null)
})

test('api.recordMirror sends every summary field in snake_case and nothing else', async () => {
  const sent = []
  const api = createApi('http://server', {
    send: async (url, init) => {
      sent.push(JSON.parse(init.body))
      return { ok: true, status: 200, json: async () => ({}) }
    },
    learner: () => ({ childId: 'kid', token: null }),
  })
  const session = createMirrorSession(baseline, 'joy')
  await api.recordMirror('w1', session.record())
  await api.recordMirror('w1', { mode: 'touch' }) // older callers
  assert.deepEqual(sent, [
    { mode: 'touch', score: null, skipped: false, score_version: null, stars: null, tracked_sec: null, attempts: 0,
      end_reason: 'skipped' },
    { mode: 'touch', score: null, skipped: false, score_version: null, stars: null, tracked_sec: null, attempts: null,
      end_reason: null },
  ])
})

test('with the provisional baseline nothing is scored or shown, only presence time is recorded (AGENTS.md)', () => {
  assert.equal(baseline.status, 'provisional')
  assert.equal(scoringEnabled(baseline), false)
  // 계산·측정 완료(measured)만으로는 켜지지 않는다. 그 버전에 대한 사람의 승인이 있어야 한다.
  assert.equal(scoringEnabled({ ...baseline, status: 'measured' }), false)
  const approved = { ...baseline, status: 'measured', approval: { approved: true, version: baseline.version } }
  assert.equal(scoringEnabled(approved), true)
  assert.equal(scoringEnabled({ ...approved, version: 'err-v2' }), false) // 승인은 버전에 묶인다
  assert.equal(scoringEnabled({ ...approved, status: 'measured-with-issues' }), false)
  assert.equal(scoringEnabled(baseline, true), true)
  const session = createMirrorSession(baseline, 'joy')
  assert.equal(session.scoring, false)
  session.cameraStarted(0)
  assert.equal(feed(session, joyFace(1), 0, 8000), null) // a full held smile: still no view
  session.frame({ faces: [] }, 8100)
  session.frame(joyFace(1), 9000)
  const record = session.record()
  assert.deepEqual({ ...record, trackedSec: undefined }, {
    mode: 'camera', score: null, skipped: false, scoreVersion: null, stars: null, trackedSec: undefined, attempts: 1,
    endReason: 'exit' })
  assert.equal(record.trackedSec, 8)
})

test('an approved baseline scores without the test switch', () => {
  const session = createMirrorSession({ ...baseline, status: 'measured',
    approval: { approved: true, version: baseline.version } }, 'joy')
  session.cameraStarted(0)
  assert.equal(session.frame(joyFace(0), 0).phase, 'calibrating')
})


test('one star is already enough to hold for success, so guidance does not demand a higher star', () => {
  assert.equal(mirrorLine({ phase: 'scoring', stars: 1, hint: '볼을 더 올려 봐요.' }), '그 표정으로 잠깐 있어 봐요.')
  assert.equal(mirrorLine({ phase: 'scoring', stars: 0, hint: '입꼬리를 올려 봐요.' }), '입꼬리를 올려 봐요.')
  assert.equal(mirrorLine({ phase: 'locked', stars: 1 }), '표정을 잘 따라 했어요!')
})
