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

// ---------- 자료 확인과 승인 ----------
// 계획서: 기준 5명, 별 기준 3명 이상(팀원 웹캠 포함). 가상 성인 사진·팀원 얼굴이므로 아동 대상 검증이 아니다.
export const MIN_TARGET_PERSONS = 5
export const MIN_STAR_PERSONS = 3
// 같은 표정 중간값이 다른 표정 상위 10%보다 이만큼 높지 않으면 '구분이 약함'으로 보고한다.
export const MIN_GAP = 5
export const REQUIRED = [REST, ...FEELINGS] // 사람마다 있어야 하는 사진 (rest는 보정용 자료, 감정이 아니다)

const sameValues = (a, b) => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 1e-6)
}

// 역할별 사람 목록 확인: 겹침, 최소 인원, 사람마다 사진 8장(rest + 7감정) 완전성, rest와 neutral이 같은 사진인지.
export function checkData(records, { targetPersons = [], starPersons = [], evalPersons = [] } = {}) {
  const { people, skipped } = byPerson(records)
  const problems = []
  const roles = { target: targetPersons, star: starPersons, eval: evalPersons }
  for (const [name, list] of Object.entries(roles)) {
    const dup = list.filter((p, i) => list.indexOf(p) !== i)
    if (dup.length) problems.push(`${name} 목록에 같은 사람이 두 번: ${[...new Set(dup)].join(', ')}`)
  }
  for (const [a, b] of [['target', 'star'], ['target', 'eval'], ['star', 'eval']]) {
    const both = roles[a].filter((p) => roles[b].includes(p))
    if (both.length) problems.push(`${a}와 ${b}에 같은 사람: ${both.join(', ')} (역할마다 다른 사람이어야 해요)`)
  }
  const files = new Map()
  for (const r of records) {
    if (!r.file) continue
    if (files.has(r.file)) problems.push(`같은 파일이 두 번: ${r.file}`)
    files.set(r.file, r)
  }
  const incomplete = {}
  for (const p of [...targetPersons, ...starPersons, ...evalPersons]) {
    const missing = REQUIRED.filter((e) => !people[p]?.[e])
    if (missing.length) incomplete[p] = missing
    const rest = people[p]?.[REST]
    const neutral = people[p]?.neutral
    if (rest && neutral && sameValues(rest, neutral)) {
      problems.push(`${p}: neutral 사진이 rest(보정용) 사진과 같아요. neutral 평가가 저절로 높아지므로 다른 사진이 필요해요`)
    }
  }
  const sameFile = records.filter((r) => r.emotion === 'neutral' && records.some((o) =>
    o.emotion === REST && o.person === r.person && o.file && o.file === r.file))
  for (const r of sameFile) problems.push(`${r.person}: neutral과 rest가 같은 파일(${r.file})`)
  for (const p of Object.keys(incomplete)) problems.push(`${p}: 빠진 사진 ${incomplete[p].join(', ')}`)
  const complete = (list) => list.filter((p) => !incomplete[p])
  if (complete(targetPersons).length < MIN_TARGET_PERSONS) {
    problems.push(`기준 인원이 부족해요: 완전한 사람 ${complete(targetPersons).length}명 (최소 ${MIN_TARGET_PERSONS}명)`)
  }
  if (complete(starPersons).length < MIN_STAR_PERSONS) {
    problems.push(`별 기준 인원이 부족해요: 완전한 사람 ${complete(starPersons).length}명 (최소 ${MIN_STAR_PERSONS}명)`)
  }
  return { people, skipped, incomplete, problems }
}

// 최종 성능 평가 (기준값·별 기준에 쓰지 않은 eval 사람만). 감정마다 같은 표정 점수와 별 수, 다른 표정이 별 1에 닿는 비율.
export function evaluate(config, people, evalPersons) {
  const { emotions } = checkConfig(config)
  const out = {}
  for (const target of Object.keys(emotions)) {
    const { same, other } = scoresFor(config, emotions, target, people, evalPersons)
    const lines = emotions[target].stars
    const star = (x) => lines.filter((l) => x >= l).length
    out[target] = {
      photos: same.length,
      sameMedian: same.length ? round(percentile(same, 0.5), 1) : null,
      sameReachStar1: same.length ? round(same.filter((x) => star(x) >= 1).length / same.length) : null,
      otherReachStar1: other.length ? round(other.filter((x) => star(x) >= 1).length / other.length) : null,
    }
  }
  return out
}

// The new baseline JSON. 계산·측정만 한다: status는 measured(문제 없음) / measured-with-issues / incomplete.
// 아이 화면 채점은 approveBaseline으로 사람이 따로 승인해야 켜진다(approval). 빌드는 승인하지 않는다.
export function buildBaseline(template, records, { targetPersons = [], starPersons = [], evalPersons = [], version,
  builtAt, lower } = {}) {
  const data = checkData(records, { targetPersons, starPersons, evalPersons })
  const { people, skipped } = data
  const issues = [...data.problems]
  const warnings = []
  const featureNames = Object.fromEntries(Object.entries(template.emotions).map(([id, spec]) => [id, Object.keys(spec.features)]))
  const usableTarget = targetPersons.filter((p) => !data.incomplete[p])
  const usableStar = starPersons.filter((p) => !data.incomplete[p])
  const { features, counts } = buildTargets(people, usableTarget, featureNames)
  const draft = {
    ...template,
    emotions: Object.fromEntries(Object.entries(template.emotions).map(([id, spec]) => [id, {
      ...spec, features: features[id] ?? spec.features,
    }])),
  }
  for (const id of Object.keys(template.emotions)) {
    if (!features[id]) issues.push(`${id}: 기준 사진이 없어 기준값을 계산하지 못했어요 (임시 값 유지)`)
  }
  const stars = {}
  for (const method of ['err', 'cos']) {
    const result = computeStars({ ...draft, method }, people, usableStar, { lower })
    stars[method] = result
    for (const w of result.warnings) {
      // 구분이 약하거나 기준을 정할 사진이 부족하면 문제로 본다. 순서를 맞춘 경고도 문제다(임의로 고친 값이라서).
      issues.push(`[${method}] ${w}`)
    }
    for (const [id, st] of Object.entries(result.stats)) {
      if (st.sameMedian != null && st.otherP90 != null && st.sameMedian - st.otherP90 < MIN_GAP) {
        issues.push(`[${method}] ${id}: 같은 표정 중간값(${st.sameMedian})과 다른 표정 상위 10%(${st.otherP90})의 간격이 ${MIN_GAP}점보다 작아요 (구분이 약함)`)
      }
    }
  }
  const emotions = {}
  for (const [id, spec] of Object.entries(draft.emotions)) {
    const measured = Boolean(features[id]) && counts[id] > 0 && Boolean(stars.err.lines[id] && stars.cos.lines[id])
    const own = issues.filter((x) => x.includes(`${id}:`) || x.includes(`${id} `))
    emotions[id] = {
      ...spec,
      stars: {
        err: stars.err.lines[id] ?? spec.stars.err ?? spec.stars,
        cos: stars.cos.lines[id] ?? spec.stars.cos ?? spec.stars,
      },
      status: !measured ? 'provisional' : own.length ? 'measured-with-issues' : 'measured',
      source: measured ? 'photos' : spec.source,
      counts: { targetPersons: counts[id] ?? 0, starPhotos: stars.err.stats[id] ?? null },
    }
  }
  const evalResult = evalPersons.length
    ? { err: evaluate({ ...draft, emotions, method: 'err' }, people, evalPersons.filter((p) => !data.incomplete[p])),
      cos: evaluate({ ...draft, emotions, method: 'cos' }, people, evalPersons.filter((p) => !data.incomplete[p])) }
    : null
  if (!evalPersons.length) warnings.push('최종 평가 인원(eval)이 없어요. 기준·별 기준에 쓰지 않은 사람으로 따로 평가해야 해요')
  const allMeasured = Object.values(emotions).every((e) => e.status === 'measured')
  const anyProvisional = Object.values(emotions).some((e) => e.status === 'provisional')
  return {
    baseline: {
      ...draft,
      version: version ?? `${draft.method}-v1`,
      status: !issues.length && allMeasured ? 'measured' : anyProvisional ? 'incomplete' : 'measured-with-issues',
      approval: { approved: false, by: null, at: null, version: null, note: null },
      built: {
        at: builtAt ?? null, photos: records.length, skipped,
        // 자료 역할: 기준값 계산 / 별 기준·err·cos 비교 / 최종 성능 평가. 모두 가상 성인 또는 팀원 (아동 아님).
        data: { targetPersons, starAndComparePersons: starPersons, evalPersons, incomplete: data.incomplete },
        scope: '가상 성인·팀원 얼굴로 계산했다. 아동 대상 검증이 아니다.',
        issues,
      },
      emotions,
    },
    warnings,
    issues,
    compare: { scope: 'err·cos 비교는 별 기준 인원으로 한다. neutral은 두 방법이 같은 변화량 공식을 써서 top-1 비교에서 뺀다',
      ...compareMethods(draft, people, usableStar) },
    evaluation: evalResult,
  }
}

// 검토 후 사용 승인. 문제가 남은 기준값은 승인하지 않는다. 승인은 그 버전에만 묶인다.
export function approveBaseline(baseline, { by, note = null, at } = {}) {
  if (!by) throw new Error('승인한 사람 이름이 필요해요')
  if (baseline.status !== 'measured') {
    throw new Error(`status가 ${baseline.status}라 승인할 수 없어요. 문제: ${(baseline.built?.issues ?? []).join(' / ') || '측정 전'}`)
  }
  if (!baseline.built?.data?.evalPersons?.length) throw new Error('최종 평가(eval) 없이 승인할 수 없어요')
  return { ...baseline, approval: { approved: true, by, at: at ?? new Date().toISOString(), version: baseline.version, note } }
}
