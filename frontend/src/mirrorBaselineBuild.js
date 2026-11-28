// Builds the mirror baseline (mirrorBaseline.json) from measured blendshapes of reference photos.
// Used by scripts/mirror-baseline.mjs; pure functions so they are unit-tested (tests/mirrorBaselineBuild.test.js).
//
// records: [{ person, emotion, blendshapes: { name: score } | null, faces }] (ai/mirror/extract_blendshapes.py)
//   emotion: one of the 7 feelings, or 'rest' for the resting face (무표정) every expression is compared with.
// Targets (계획서): mean over the target persons of (expression − rest) for each feature of that feeling.
// Star lines (계획서), from other persons (star persons):
//   ★1 = 90th percentile of the scores of OTHER expressions against this target (a different face rarely reaches it)
//   ★2 = median, ★3 = 75th percentile of the scores of the SAME expression
//   fear and disgust ★2·★3 are lowered (계획서: 낮게) by `lower` (default 0.9), never below ★1.
import { checkConfig, normalizeStars, scoreAgainst } from './mirrorScore.js'

export const REST = 'rest'
export const FEELINGS = ['joy', 'sad', 'surprise', 'anger', 'fear', 'disgust', 'neutral']
const round = (x, digits = 3) => Math.round(x * 10 ** digits) / 10 ** digits

export function percentile(values, p) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const i = (sorted.length - 1) * p
  const lo = Math.floor(i)
  const hi = Math.ceil(i)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
}

// person → emotion → blendshapes, only photos with exactly one face and blendshapes.
export function byPerson(records) {
  const out = {}
  const skipped = []
  for (const r of records) {
    if (!r.blendshapes || r.faces !== 1) {
      skipped.push(r.file ?? `${r.person}_${r.emotion}`)
      continue
    }
    ;(out[r.person] ??= {})[r.emotion] = r.blendshapes
  }
  return { people: out, skipped }
}

export function buildTargets(people, persons, featureNames) {
  const features = {}
  const counts = {}
  for (const emotion of FEELINGS) {
    if (emotion === 'neutral') {
      features.neutral = {}
      counts.neutral = persons.filter((p) => people[p]?.neutral && people[p]?.[REST]).length
      continue
    }
    const usable = persons.filter((p) => people[p]?.[emotion] && people[p]?.[REST])
    counts[emotion] = usable.length
    if (!usable.length) continue
    features[emotion] = Object.fromEntries((featureNames[emotion] ?? []).map((name) => [name, round(
      usable.reduce((sum, p) => sum + ((people[p][emotion][name] ?? 0) - (people[p][REST][name] ?? 0)), 0) / usable.length)]))
  }
  return { features, counts }
}

// Scores of each star person's photos against one target (rest photo as the calibration).
function scoresFor(config, emotions, target, people, persons) {
  const same = []
  const other = []
  for (const p of persons) {
    const rest = people[p]?.[REST]
    if (!rest) continue
    for (const [emotion, values] of Object.entries(people[p])) {
      if (emotion === REST) continue
      const { score } = scoreAgainst(config, emotions[target], target, values, rest)
      ;(emotion === target ? same : other).push(score)
    }
  }
  return { same, other }
}

export function computeStars(config, people, persons, { lower = 0.9 } = {}) {
  const { emotions } = checkConfig(config)
  const lines = {}
  const warnings = []
  const stats = {}
  for (const target of Object.keys(emotions)) {
    const { same, other } = scoresFor(config, emotions, target, people, persons)
    stats[target] = { same: same.length, other: other.length }
    if (!same.length || !other.length) {
      warnings.push(`${target}: 별 기준을 정할 사진이 부족해요 (같은 표정 ${same.length}장, 다른 표정 ${other.length}장)`)
      continue
    }
    const s1 = percentile(other, 0.9)
    let s2 = percentile(same, 0.5)
    let s3 = percentile(same, 0.75)
    if (s2 < s1) warnings.push(`${target}: 같은 표정 중간값(${round(s2, 1)})이 다른 표정 상위 10%(${round(s1, 1)})보다 낮아요. 구분이 약해요`)
    if (target === 'fear' || target === 'disgust') [s2, s3] = [Math.max(s1, s2 * lower), Math.max(s1, s3 * lower)]
    const fixed = normalizeStars([s1, s2, s3].map((x) => round(x, 1)), target)
    warnings.push(...fixed.warnings)
    lines[target] = fixed.lines
    Object.assign(stats[target], { otherP90: round(s1, 1), sameMedian: round(percentile(same, 0.5), 1), sameP75: round(percentile(same, 0.75), 1) })
  }
  return { lines, warnings, stats }
}

// err와 cos 비교: 같은 표정 점수와 다른 표정 점수의 간격, 그리고 사진마다 가장 높은 점수의 목표가 맞는 감정인지(top-1).
export function compareMethods(config, people, persons) {
  const report = {}
  for (const method of ['err', 'cos']) {
    const cfg = { ...config, method }
    const { emotions } = checkConfig(cfg)
    const targets = Object.keys(emotions).filter((t) => t !== 'neutral')
    let right = 0
    let total = 0
    const perEmotion = {}
    for (const target of Object.keys(emotions)) {
      const { same, other } = scoresFor(cfg, emotions, target, people, persons)
      perEmotion[target] = {
        sameMedian: same.length ? round(percentile(same, 0.5), 1) : null,
        otherP90: other.length ? round(percentile(other, 0.9), 1) : null,
        gap: same.length && other.length ? round(percentile(same, 0.5) - percentile(other, 0.9), 1) : null,
      }
    }
    for (const p of persons) {
      const rest = people[p]?.[REST]
      if (!rest) continue
      for (const truth of targets) {
        const values = people[p][truth]
        if (!values) continue
        const ranked = targets.map((t) => [t, scoreAgainst(cfg, emotions[t], t, values, rest).score]).sort((a, b) => b[1] - a[1])
        total += 1
        if (ranked[0][0] === truth) right += 1
      }
    }
    report[method] = { top1: total ? round(right / total) : null, photos: total, perEmotion }
  }
  return report
}

// The new baseline JSON. Lines are per method; the chosen method is `config.method`.
export function buildBaseline(template, records, { targetPersons, starPersons, version, builtAt, lower } = {}) {
  const { people, skipped } = byPerson(records)
  const featureNames = Object.fromEntries(Object.entries(template.emotions).map(([id, spec]) => [id, Object.keys(spec.features)]))
  const { features, counts } = buildTargets(people, targetPersons, featureNames)
  const warnings = []
  const draft = {
    ...template,
    emotions: Object.fromEntries(Object.entries(template.emotions).map(([id, spec]) => [id, {
      ...spec, features: features[id] ?? spec.features,
      ...(features[id] ? {} : { status: spec.status }),
    }])),
  }
  for (const id of Object.keys(template.emotions)) {
    if (!features[id]) warnings.push(`${id}: 기준 사진이 없어 기준값을 그대로 둠 (${template.emotions[id].status})`)
  }
  const stars = {}
  for (const method of ['err', 'cos']) {
    const result = computeStars({ ...draft, method }, people, starPersons, { lower })
    stars[method] = result
    warnings.push(...result.warnings.map((w) => `[${method}] ${w}`))
  }
  const emotions = {}
  for (const [id, spec] of Object.entries(draft.emotions)) {
    const measuredFeatures = Boolean(features[id]) && counts[id] > 0
    const measuredStars = Boolean(stars.err.lines[id] && stars.cos.lines[id])
    emotions[id] = {
      ...spec,
      stars: {
        err: stars.err.lines[id] ?? spec.stars.err ?? spec.stars,
        cos: stars.cos.lines[id] ?? spec.stars.cos ?? spec.stars,
      },
      // measured only when both the targets and the star lines come from photos
      status: measuredFeatures && measuredStars ? 'measured' : 'provisional',
      source: measuredFeatures && measuredStars ? 'photos' : spec.source,
      counts: { targetPersons: counts[id] ?? 0, starPhotos: stars.err.stats[id] ?? null },
    }
  }
  const allMeasured = Object.values(emotions).every((e) => e.status === 'measured')
  return {
    baseline: {
      ...draft,
      version: version ?? `${draft.method}-v1`,
      status: allMeasured ? 'measured' : 'partial',
      built: { at: builtAt ?? null, targetPersons, starPersons, photos: records.length, skipped },
      emotions,
    },
    warnings,
    compare: compareMethods(draft, people, starPersons),
  }
}
