// Lesson 2 (표정 거울) scoring. Runs on the device only: blendshape values never leave this module.
// The server gets a summary only (score, score_version, stars, tracked_sec, attempts, end_reason).
//
// createMirrorScorer(config) → { setTarget, startCalibration, update, reset, summary, version, warnings }
//   config: the baseline JSON (mirrorBaseline.json): method, per-emotion target features and star lines.
//   update(frame, now) with frame = { faces: [{ blendshapeName: score, ... }, ...] } (see fromMediaPipe)
//   returns { phase, reason, score, stars, locked, feedbackKey, hint }:
//     phase: calibrating | scoring | locked | paused, reason (paused only): noFace | multiFace | unstable
//
// Method 'err' (default): per feature, error = |calibrated − target| ÷ target clipped to 0..1, and 0 once the
// calibrated value reaches nearRatio (80%) of the target. score = 100 × (1 − mean error).
// Method 'cos': cosine between the calibrated feature vector and the target vector, times a magnitude factor
// min(1, |calibrated| ÷ (nearRatio × |target|)) so a tiny movement in the right direction does not score high.
// neutral (both methods): 100 × (1 − overall change ÷ neutralCap), change = mean |value − calibration| over
// the expression blendshapes (blinks and gaze excluded).
// Calibration: the first calibrationMs (3 s) of steady single-face frames are averaged and subtracted later.
// Lock: stars ≥ 1 held for lockMs (3 s) locks the result at the best score in that hold. There is no countdown
// and no failure: the child can finish the practice at any time (AGENTS.md: 시간 제한·압박 없음).

export const PHASES = ['calibrating', 'scoring', 'locked', 'paused']
export const REASONS = ['noFace', 'multiFace', 'unstable']

const clamp01 = (x) => Math.min(1, Math.max(0, x))
// 'mouthSmileLeft' → 'mouthSmile', 'browInnerUp' → 'browInnerUp'
export const featureGroup = (name) => name.replace(/(Left|Right)$/, '')

export function fromMediaPipe(result) {
  const faces = (result?.faceBlendshapes ?? []).map((face) =>
    Object.fromEntries((face.categories ?? []).map((c) => [c.categoryName, c.score])))
  // A face found by the landmarker without blendshapes still counts as a face (for noFace / multiFace).
  const extra = Math.max(0, (result?.faceLandmarks?.length ?? 0) - faces.length)
  return { faces: [...faces, ...Array.from({ length: extra }, () => ({}))] }
}

// Star lines must not go down (★1 ≤ ★2 ≤ ★3). Inverted lines are raised to the previous one and reported.
export function normalizeStars(lines, label = '') {
  const warnings = []
  const fixed = []
  for (const [i, raw] of (lines ?? []).entries()) {
    const value = Number(raw)
    if (!Number.isFinite(value)) throw new Error(`${label} 별 기준 ${i + 1}이 숫자가 아니에요`)
    const prev = fixed.length ? fixed[fixed.length - 1] : -Infinity
    if (value < prev) warnings.push(`${label} 별 ${i + 1} 기준(${value})이 앞 기준(${prev})보다 낮아 ${prev}로 맞춤`)
    fixed.push(Math.max(value, prev))
  }
  if (fixed.length !== 3) throw new Error(`${label} 별 기준은 3개여야 해요`)
  return { lines: fixed, warnings }
}

// The score of one face (values) against a target, with the resting face (baseline) subtracted.
// Shared by the live scorer and the baseline tool (frontend/scripts/mirror-baseline.mjs), so star lines are
// computed with the same formula. spec: { features } of that emotion after checkConfig.
// Returns { score: 0..100, worst: feature name, 'relax' or null }.
export function scoreAgainst(config, spec, target, values, baseline) {
  const nearRatio = config.nearRatio ?? 0.8
  const neutralCap = config.neutralCap ?? 0.15
  const excluded = (name) => (config.neutralExclude ?? ['_neutral', 'eyeBlink', 'eyeLook']).some((p) => name.startsWith(p))
  const calibrated = (name) => Math.max(0, (values[name] ?? 0) - (baseline[name] ?? 0))
  if (target === 'neutral') {
    const names = Object.keys(values).filter((n) => !excluded(n))
    const change = names.length
      ? names.reduce((sum, n) => sum + Math.abs((values[n] ?? 0) - (baseline[n] ?? 0)), 0) / names.length
      : 0
    return { score: 100 * (1 - clamp01(change / neutralCap)), worst: change > 0 ? 'relax' : null }
  }
  const entries = Object.entries(spec.features)
  if (config.method === 'cos') {
    let dot = 0, cc = 0, tt = 0, worst = null, worstGap = -Infinity
    for (const [name, t] of entries) {
      const c = calibrated(name)
      dot += c * t
      cc += c * c
      tt += t * t
      const gap = (t - c) / t
      if (gap > worstGap) [worst, worstGap] = [name, gap]
    }
    if (cc === 0 || tt === 0) return { score: 0, worst } // zero vector: no movement yet
    const cos = dot / Math.sqrt(cc * tt)
    const magnitude = Math.min(1, Math.sqrt(cc) / (nearRatio * Math.sqrt(tt)))
    return { score: 100 * Math.max(0, cos) * magnitude, worst: worstGap > 1 - nearRatio ? worst : null }
  }
  let total = 0, worst = null, worstErr = 0
  for (const [name, t] of entries) {
    const c = calibrated(name)
    const err = c >= nearRatio * t ? 0 : clamp01(Math.abs(c - t) / t)
    total += err
    if (err > worstErr) [worst, worstErr] = [name, err]
  }
  return { score: 100 * (1 - total / entries.length), worst }
}

// Checks the baseline JSON: star lines in order, targets near 0 left out. Exported for the baseline tool.
export function checkConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('기준값 JSON이 없어요')
  if (!['err', 'cos'].includes(config.method)) throw new Error('method는 err 또는 cos여야 해요')
  const warnings = []
  const emotions = {}
  for (const [id, spec] of Object.entries(config.emotions ?? {})) {
    const stars = normalizeStars(spec.stars?.[config.method] ?? spec.stars, id)
    warnings.push(...stars.warnings)
    const features = Object.fromEntries(Object.entries(spec.features ?? {}).map(([k, v]) => [k, Number(v)]))
    // Targets near 0 cannot be divided by: they are left out of the error (and reported).
    const usable = Object.entries(features).filter(([, v]) => Number.isFinite(v) && v >= config.minTarget)
    for (const [k, v] of Object.entries(features)) {
      if (!(Number.isFinite(v) && v >= config.minTarget)) warnings.push(`${id}.${k} 기준값 ${v}이 너무 작아 빼고 계산`)
    }
    if (id !== 'neutral' && !usable.length) throw new Error(`${id}: 쓸 수 있는 특징 기준값이 없어요`)
    emotions[id] = { features: Object.fromEntries(usable), stars: stars.lines }
  }
  return { emotions, warnings }
}

export function createMirrorScorer(config) {
  const { emotions, warnings } = checkConfig(config)
  const calibrationMs = config.calibrationMs ?? 3000
  const lockMs = config.lockMs ?? 3000
  const alpha = config.smoothing ?? 0.5
  const maxGapMs = config.unstable?.maxGapMs ?? 500
  const maxJump = config.unstable?.maxJump ?? 0.35

  let target = null
  let s // per-session state

  function fresh() {
    return {
      calibrating: true, calibStart: null, calibSum: {}, calibCount: 0, baseline: null,
      smooth: null, last: null, lastAt: null, holdStart: null, holdBest: null,
      locked: null, best: null, trackedMs: 0,
    }
  }
  s = fresh()

  function setTarget(emotionId) {
    if (!emotions[emotionId]) throw new Error(`기준값에 없는 감정: ${emotionId}`)
    target = emotionId
    s.holdStart = null
    s.holdBest = null
    s.locked = null
    s.best = null
  }

  function reset() {
    s = fresh()
  }

  function startCalibration(now) {
    s = fresh()
    s.calibStart = now
  }

  function starsFor(score) {
    if (score == null) return 0
    const lines = emotions[target].stars
    return lines.filter((line) => score >= line).length
  }

  function scoreOf(values) {
    return scoreAgainst(config, emotions[target], target, values, s.baseline)
  }

  function view(phase, extra = {}) {
    return { phase, reason: null, score: null, stars: 0, locked: phase === 'locked', feedbackKey: null, hint: null, ...extra }
  }

  function feedback(worst) {
    if (!worst) return { feedbackKey: null, hint: null }
    const key = worst === 'relax' ? 'relax' : featureGroup(worst)
    return { feedbackKey: key, hint: config.feedback?.[key] ?? null }
  }

  function pause(reason, now) {
    s.holdStart = null // holding is interrupted: the 3 s start again
    s.holdBest = null
    s.smooth = null
    s.last = null
    s.lastAt = now
    if (s.calibrating) { // calibration needs steady frames: start it again
      s.calibStart = null
      s.calibSum = {}
      s.calibCount = 0
    }
    return view('paused', { reason })
  }

  function update(frame, now) {
    if (!target) throw new Error('setTarget을 먼저 불러 주세요')
    if (s.locked) return view('locked', { score: s.locked.score, stars: s.locked.stars })
    const faces = frame?.faces ?? []
    if (faces.length === 0) return pause('noFace', now)
    if (faces.length > 1) return pause('multiFace', now)
    const raw = faces[0]
    const gap = s.lastAt == null ? 0 : now - s.lastAt
    const tracked = Object.keys(emotions[target].features)
    const jump = s.last && tracked.length
      ? tracked.reduce((sum, n) => sum + Math.abs((raw[n] ?? 0) - (s.last[n] ?? 0)), 0) / tracked.length
      : 0
    if (s.lastAt != null && (gap > maxGapMs || jump > maxJump)) {
      const paused = pause('unstable', now)
      s.last = raw
      return paused
    }
    if (s.lastAt != null) s.trackedMs += gap
    s.last = raw
    s.lastAt = now

    if (s.calibrating) {
      if (s.calibStart == null) s.calibStart = now
      for (const [k, v] of Object.entries(raw)) s.calibSum[k] = (s.calibSum[k] ?? 0) + v
      s.calibCount += 1
      if (now - s.calibStart < calibrationMs) return view('calibrating')
      s.baseline = Object.fromEntries(Object.entries(s.calibSum).map(([k, v]) => [k, v / s.calibCount]))
      s.calibrating = false
      return view('scoring', { score: null })
    }

    s.smooth = s.smooth
      ? Object.fromEntries(Object.keys({ ...s.smooth, ...raw }).map((k) => [k, alpha * (raw[k] ?? 0) + (1 - alpha) * (s.smooth[k] ?? 0)]))
      : { ...raw }
    const { score: rawScore, worst } = scoreOf(s.smooth)
    const score = Math.round(rawScore)
    const stars = starsFor(score)
    if (!s.best || score > s.best.score) s.best = { score, stars }
    if (stars >= 1) {
      if (s.holdStart == null) [s.holdStart, s.holdBest] = [now, { score, stars }]
      else if (score > s.holdBest.score) s.holdBest = { score, stars }
      if (now - s.holdStart >= lockMs) {
        s.locked = s.holdBest
        return view('locked', { score: s.locked.score, stars: s.locked.stars })
      }
    } else {
      s.holdStart = null
      s.holdBest = null
    }
    return view('scoring', { score, stars, ...(stars < 3 ? feedback(worst) : {}) })
  }

  // What the server may receive (no blendshape values). score/stars: the locked result, otherwise the best
  // score seen while scoring (null if scoring never started).
  function summary() {
    const result = s.locked ?? s.best
    return {
      score: result ? result.score : null,
      stars: result ? result.stars : null,
      locked: Boolean(s.locked),
      trackedSec: Math.round(s.trackedMs / 100) / 10,
    }
  }

  return {
    setTarget, startCalibration, update, reset, summary, warnings,
    get version() { return config.version },
    get target() { return target },
  }
}
