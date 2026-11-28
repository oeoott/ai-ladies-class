import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createMirrorScorer, featureGroup, fromMediaPipe, normalizeStars } from '../src/mirrorScore.js'

const baseline = JSON.parse(readFileSync(new URL('../src/mirrorBaseline.json', import.meta.url)))
const emotions = JSON.parse(readFileSync(new URL('../../backend/app/content/emotions.json', import.meta.url)))

// A small config so the numbers in these tests are easy to follow.
const config = (over = {}) => ({
  version: 'err-test', method: 'err', calibrationMs: 3000, lockMs: 3000, smoothing: 1, minTarget: 0.05, nearRatio: 0.8,
  neutralCap: 0.2, unstable: { maxGapMs: 500, maxJump: 0.5 },
  emotions: {
    joy: { features: { mouthSmileLeft: 0.5, mouthSmileRight: 0.5 }, stars: [40, 60, 80] },
    neutral: { features: {}, stars: [50, 70, 85] },
  },
  feedback: { mouthSmile: '입꼬리를 위로 올려 봐요.', relax: '얼굴에 힘을 빼 봐요.' },
  ...over,
})
const face = (smile, rest = {}) => ({ faces: [{ mouthSmileLeft: smile, mouthSmileRight: smile, jawOpen: 0, ...rest }] })

// Feeds frames every 100 ms from `from` and returns the last view and the time after.
function run(scorer, frame, from, ms) {
  let view
  let t = from
  for (; t <= from + ms; t += 100) view = scorer.update(typeof frame === 'function' ? frame(t) : frame, t)
  return { view, t }
}

function calibrated(over = {}, at = 0, rest = 0.1) {
  const scorer = createMirrorScorer(config(over))
  scorer.setTarget('joy')
  scorer.startCalibration(at)
  const { t } = run(scorer, face(rest), at, 3000)
  return { scorer, t }
}

test('MediaPipe results become one blendshape map per face, faces without blendshapes still count', () => {
  const result = {
    faceLandmarks: [[{}], [{}]],
    faceBlendshapes: [{ categories: [{ categoryName: 'mouthSmileLeft', score: 0.7 }, { categoryName: '_neutral', score: 0.1 }] }],
  }
  assert.deepEqual(fromMediaPipe(result), { faces: [{ mouthSmileLeft: 0.7, _neutral: 0.1 }, {}] })
  assert.deepEqual(fromMediaPipe(null), { faces: [] })
  assert.equal(featureGroup('mouthSmileLeft'), 'mouthSmile')
  assert.equal(featureGroup('browInnerUp'), 'browInnerUp')
})

test('calibration takes 3 seconds of a steady face, then the resting face is subtracted', () => {
  const scorer = createMirrorScorer(config())
  scorer.setTarget('joy')
  scorer.startCalibration(0)
  assert.equal(scorer.update(face(0.1), 0).phase, 'calibrating')
  assert.equal(run(scorer, face(0.1), 100, 2800).view.phase, 'calibrating')
  assert.equal(scorer.update(face(0.1), 3000).phase, 'scoring')
  // resting 0.1 + target 0.5 → calibrated 0.5 = target → 100
  assert.equal(scorer.update(face(0.6), 3100).score, 100)
  // without subtracting, 0.1 + 0.3 = 0.4 would be at 80% of the target; calibrated 0.3 is 60% → error 0.4
  assert.equal(scorer.update(face(0.4), 3200).score, 60)
})

test('error method: 80% of the target counts as reached, less is the relative distance', () => {
  const { scorer, t } = calibrated({}, 0, 0)
  assert.equal(scorer.update(face(0.4), t).score, 100) // 0.4 ≥ 0.8 × 0.5
  assert.equal(scorer.update(face(0.7), t + 100).score, 100) // over the target is not punished
  assert.equal(scorer.update(face(0.25), t + 200).score, 50) // |0.25 − 0.5| ÷ 0.5
  assert.equal(scorer.update(face(0), t + 300).score, 0)
})

test('targets near 0 are left out with a warning, a target with nothing usable is refused', () => {
  const scorer = createMirrorScorer(config({
    emotions: { joy: { features: { mouthSmileLeft: 0.5, jawOpen: 0.01 }, stars: [40, 60, 80] } },
  }))
  assert.match(scorer.warnings.join(), /jawOpen 기준값 0.01이 너무 작아/)
  assert.throws(() => createMirrorScorer(config({ emotions: { joy: { features: { jawOpen: 0 }, stars: [1, 2, 3] } } })),
    /쓸 수 있는 특징 기준값이 없어요/)
})

test('star lines that go down are raised and reported; wrong counts are refused', () => {
  assert.deepEqual(normalizeStars([60, 40, 80], 'joy').lines, [60, 60, 80])
  assert.equal(normalizeStars([60, 40, 80], 'joy').warnings.length, 1)
  assert.throws(() => normalizeStars([40, 60], 'joy'), /3개/)
  const scorer = createMirrorScorer(config({ emotions: { joy: { features: { mouthSmileLeft: 0.5 }, stars: [70, 50, 90] } } }))
  assert.match(scorer.warnings[0], /별 2 기준/)
})

test('stars follow the lines and the hint names the feature that is furthest off', () => {
  const { scorer, t } = calibrated({}, 0, 0)
  const view = scorer.update(face(0.2), t) // error 0.6 → 40
  assert.deepEqual([view.score, view.stars, view.feedbackKey, view.hint], [40, 1, 'mouthSmile', '입꼬리를 위로 올려 봐요.'])
  assert.equal(scorer.update(face(0.1), t + 100).stars, 0)
  const full = scorer.update(face(0.5), t + 200)
  assert.deepEqual([full.stars, full.feedbackKey, full.hint], [3, null, null]) // no hint at 3 stars
})

test('holding one star or more for 3 seconds locks the best score of that hold', () => {
  const { scorer, t } = calibrated({}, 0, 0)
  const scores = (time) => face(time < t + 1000 ? 0.25 : time < t + 2000 ? 0.45 : 0.3) // 50, 100, 60
  const before = run(scorer, scores, t, 2900).view
  assert.equal(before.phase, 'scoring')
  const locked = scorer.update(face(0.3), t + 3000)
  assert.deepEqual([locked.phase, locked.locked, locked.score, locked.stars], ['locked', true, 100, 3])
  assert.equal(scorer.update(face(0), t + 3100).score, 100) // stays locked
  assert.deepEqual(scorer.summary(), { score: 100, stars: 3, locked: true, trackedSec: 6.1 })
})

test('dropping below one star restarts the 3 seconds', () => {
  const { scorer, t } = calibrated({}, 0, 0)
  run(scorer, face(0.3), t, 2000)
  scorer.update(face(0.05), t + 2100) // 10 → 0 stars
  assert.equal(run(scorer, face(0.3), t + 2200, 2700).view.phase, 'scoring')
  assert.equal(scorer.update(face(0.3), t + 5200).phase, 'locked')
})

test('no face, two faces and unstable tracking pause scoring with a reason and restart the hold', () => {
  const { scorer, t } = calibrated({}, 0, 0)
  run(scorer, face(0.3), t, 2000)
  assert.deepEqual(scorer.update({ faces: [] }, t + 2100), {
    phase: 'paused', reason: 'noFace', score: null, stars: 0, locked: false, feedbackKey: null, hint: null })
  assert.equal(scorer.update({ faces: [{}, {}] }, t + 2200).reason, 'multiFace')
  run(scorer, face(0.3), t + 2300, 2000)
  assert.equal(scorer.update(face(0.3), t + 5000).reason, 'unstable') // 700 ms without frames
  assert.equal(scorer.update(face(0.3), t + 5100).phase, 'scoring')
  assert.equal(scorer.update(face(1), t + 5200).reason, 'unstable') // jumped by 0.7
  assert.equal(run(scorer, face(1), t + 5300, 2900).view.phase, 'scoring') // the hold started again
  assert.equal(scorer.update(face(1), t + 8300).phase, 'locked')
})

test('a pause during calibration starts the calibration again', () => {
  const scorer = createMirrorScorer(config())
  scorer.setTarget('joy')
  scorer.startCalibration(0)
  run(scorer, face(0.1), 0, 2000)
  scorer.update({ faces: [] }, 2100)
  assert.equal(run(scorer, face(0.1), 2200, 2900).view.phase, 'calibrating')
  assert.equal(scorer.update(face(0.1), 5200).phase, 'scoring')
})

test('neutral scores the overall change from the resting face, blinks and gaze do not count', () => {
  const scorer = createMirrorScorer(config())
  scorer.setTarget('neutral')
  scorer.startCalibration(0)
  const { t } = run(scorer, face(0.1), 0, 3000)
  assert.equal(scorer.update(face(0.1, { eyeBlinkLeft: 1, eyeLookUpLeft: 1 }), t).score, 100)
  // two of three expression values moved by 0.2 → mean change 0.133 → 100 × (1 − 0.133 ÷ 0.2)
  const view = scorer.update(face(0.3), t + 100)
  assert.deepEqual([view.score, view.feedbackKey, view.hint], [33, 'relax', '얼굴에 힘을 빼 봐요.'])
})

test('cosine method: direction and size both count, a still face is 0 not an error', () => {
  const cos = {
    method: 'cos',
    emotions: { joy: { features: { mouthSmileLeft: 0.5, cheekSquintLeft: 0.5 }, stars: { err: [1, 2, 3], cos: [35, 55, 75] } } },
  }
  const scorer = createMirrorScorer(config(cos))
  scorer.setTarget('joy')
  scorer.startCalibration(0)
  const resting = { faces: [{ mouthSmileLeft: 0, cheekSquintLeft: 0 }] }
  const { t } = run(scorer, resting, 0, 3000)
  assert.equal(scorer.update(resting, t).score, 0) // measured zero vector, not missing features
  const both = { faces: [{ mouthSmileLeft: 0.4, cheekSquintLeft: 0.4 }] }
  assert.equal(scorer.update(both, t + 100).score, 100) // same direction, 80% size
  const half = { faces: [{ mouthSmileLeft: 0.2, cheekSquintLeft: 0.2 }] }
  assert.equal(scorer.update(half, t + 200).score, 50)
  const oneSide = { faces: [{ mouthSmileLeft: 0.4, cheekSquintLeft: 0 }] }
  const view = scorer.update(oneSide, t + 300)
  assert.equal(view.score, 50) // cos 0.707 × size 0.707
  assert.equal(view.feedbackKey, 'cheekSquint')
  assert.deepEqual(createMirrorScorer(config(cos)).warnings, [])
})

test('reset clears everything; the summary has no blendshape values', () => {
  const { scorer, t } = calibrated({}, 0, 0)
  scorer.update(face(0.3), t)
  assert.deepEqual(Object.keys(scorer.summary()).sort(), ['locked', 'score', 'stars', 'trackedSec'])
  scorer.reset()
  assert.deepEqual(scorer.summary(), { score: null, stars: null, locked: false, trackedSec: 0 })
  assert.equal(scorer.update(face(0.3), 10000).phase, 'calibrating')
})

test('unknown target and missing target are refused', () => {
  const scorer = createMirrorScorer(config())
  assert.throws(() => scorer.update(face(0), 0), /setTarget/)
  assert.throws(() => scorer.setTarget('calm'), /없는 감정/)
  assert.throws(() => createMirrorScorer({ ...config(), method: 'l2' }), /method/)
})

test('the shipped baseline covers the seven feelings with real MediaPipe names and is marked provisional', () => {
  const names = new Set(['browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
    'cheekSquintLeft', 'cheekSquintRight', 'eyeSquintLeft', 'eyeSquintRight', 'eyeWideLeft', 'eyeWideRight', 'jawOpen',
    'mouthFrownLeft', 'mouthFrownRight', 'mouthPressLeft', 'mouthPressRight', 'mouthSmileLeft', 'mouthSmileRight',
    'mouthStretchLeft', 'mouthStretchRight', 'mouthUpperUpLeft', 'mouthUpperUpRight', 'noseSneerLeft', 'noseSneerRight'])
  assert.deepEqual(Object.keys(baseline.emotions).sort(), ['anger', 'disgust', 'fear', 'joy', 'neutral', 'sad', 'surprise'])
  for (const [id, spec] of Object.entries(baseline.emotions)) {
    for (const name of Object.keys(spec.features)) assert.ok(names.has(name), `${id}.${name}`)
    assert.equal(spec.status, 'provisional', id)
  }
  for (const id of Object.keys(emotions)) assert.ok(baseline.emotions[id], `콘텐츠 감정 ${id}의 기준값`)
  assert.equal(baseline.status, 'provisional')
  for (const method of ['err', 'cos']) {
    const scorer = createMirrorScorer({ ...baseline, method })
    assert.deepEqual(scorer.warnings, [], method)
    for (const id of Object.keys(baseline.emotions)) scorer.setTarget(id)
  }
  assert.match(baseline.version, /^[A-Za-z0-9._-]{1,32}$/) // server score_version pattern
  for (const group of new Set([...names].map(featureGroup))) assert.ok(baseline.feedback[group], group)
  // fear and disgust lines are lower (계획서: fear·disgust는 낮게)
  assert.ok(baseline.emotions.fear.stars.err[2] < baseline.emotions.joy.stars.err[2])
})


test('provisional joy: a strong mouth smile can reach three stars without forcing strong cheek squint', () => {
  const scorer = createMirrorScorer({ ...baseline, smoothing: 1 })
  scorer.setTarget('joy')
  scorer.startCalibration(0)
  run(scorer, face(0, { cheekSquintLeft: 0, cheekSquintRight: 0 }), 0, 3000)
  const result = scorer.update(face(0.6, { cheekSquintLeft: 0, cheekSquintRight: 0 }), 3100)
  assert.equal(result.score, 80)
  assert.equal(result.stars, 3)
  assert.equal(baseline.status, 'provisional')
  assert.equal(baseline.approval.approved, false)
})

test('provisional joy: cheeks alone and a tiny smile do not earn a passing star', () => {
  for (const smile of [0, 0.1]) {
    const scorer = createMirrorScorer({ ...baseline, smoothing: 1 })
    scorer.setTarget('joy')
    scorer.startCalibration(0)
    run(scorer, face(0), 0, 3000)
    const result = scorer.update(face(smile, { cheekSquintLeft: 0.2, cheekSquintRight: 0.2 }), 3100)
    assert.equal(result.stars, 0)
  }
})

test('completed one-star success can improve to three, without losing success on a weaker or missing face', () => {
  const { scorer, t } = calibrated({}, 0, 0)
  run(scorer, face(0.25), t, 3000) // one star is held long enough to complete
  assert.equal(scorer.update(face(0.25), t + 3100).stars, 1)
  const better = scorer.update(face(0.5), t + 3200)
  assert.deepEqual([better.phase, better.stars], ['locked', 3])
  assert.equal(scorer.update(face(0), t + 3300).stars, 3)
  assert.equal(scorer.update({ faces: [] }, t + 3400).phase, 'locked')
  assert.equal(scorer.summary().stars, 3)
})

test('feature weights must be positive finite values', () => {
  for (const bad of [-1, 0, NaN, Infinity]) {
    assert.throws(() => createMirrorScorer(config({ emotions: {
      joy: { features: { mouthSmileLeft: .5 }, weights: { mouthSmileLeft: bad }, stars: [40, 60, 80] },
    } })), /가중치/)
  }
})


test('missing or invalid expression data never calibrates or awards neutral stars', () => {
  for (const target of ['neutral', 'joy']) {
    for (const raw of [{}, { eyeBlinkLeft: 0 }, { mouthSmileLeft: 0 },
      { mouthSmileLeft: NaN, mouthSmileRight: 0 },
      { mouthSmileLeft: 0, mouthSmileRight: Infinity },
      { mouthSmileLeft: -0.1, mouthSmileRight: 0 },
      { mouthSmileLeft: 0, mouthSmileRight: 1.1 }]) {
      const scorer = createMirrorScorer(config())
      scorer.setTarget(target)
      scorer.startCalibration(0)
      const { view } = run(scorer, { faces: [raw] }, 0, 7000)
      assert.deepEqual([view.phase, view.reason, view.score, view.stars], ['paused', 'missingData', null, 0])
      assert.deepEqual(scorer.summary(), { score: null, stars: null, locked: false, trackedSec: 0 })
      assert.equal(scorer.update(face(0), 7100).phase, 'calibrating')
      assert.equal(scorer.update(face(0), 7200).phase, 'calibrating')
    }
  }
})

test('missing data or a detector failure interrupts the hold and resumes from valid frames only', () => {
  for (const invalid of [{ faces: [{}] }, { faces: [], analysisUnavailable: true }]) {
    const { scorer, t } = calibrated({}, 0, 0)
    run(scorer, face(0.3), t, 2000)
    const paused = scorer.update(invalid, t + 2100)
    assert.equal(paused.phase, 'paused')
    assert.equal(paused.score, null)
    assert.equal(scorer.summary().locked, false)
    assert.equal(run(scorer, face(0.3), t + 2200, 2900).view.phase, 'scoring')
    assert.equal(scorer.update(face(0.3), t + 5200).phase, 'locked')
  }
})

test('missing data cannot inflate an already completed neutral result', () => {
  const scorer = createMirrorScorer(config({ smoothing: 1 }))
  scorer.setTarget('neutral')
  scorer.startCalibration(0)
  run(scorer, face(0), 0, 3000)
  const { view, t } = run(scorer, face(0.1), 3100, 3000)
  assert.equal(view.phase, 'locked')
  const prior = scorer.summary()
  run(scorer, { faces: [{}] }, t, 1000)
  scorer.update({ faces: [], analysisUnavailable: true }, t + 1100)
  assert.deepEqual(scorer.summary(), prior)
})
