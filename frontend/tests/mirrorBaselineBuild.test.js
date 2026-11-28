import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  FEELINGS, MIN_STAR_PERSONS, MIN_TARGET_PERSONS, REST, approveBaseline, buildBaseline, buildTargets, byPerson, checkData,
  computeStars, percentile,
} from '../src/mirrorBaselineBuild.js'
import { baselineApproved } from '../src/mirrorSession.js'
import { createMirrorScorer } from '../src/mirrorScore.js'

const template = JSON.parse(readFileSync(new URL('../src/mirrorBaseline.json', import.meta.url)))
const ALL = [...new Set(Object.values(template.emotions).flatMap((e) => Object.keys(e.features)))]

// Synthetic test data only (not reference photos): each person's rest face plus that feeling's features × strength.
// neutral (무표정 평가 사진) differs slightly from rest (보정 사진): they must be different photos.
function person(id, strength = 1, offset = 0.05, { same = false } = {}) {
  const rest = Object.fromEntries([...ALL, 'eyeBlinkLeft'].map((n) => [n, offset]))
  const rows = [{ person: id, emotion: REST, faces: 1, blendshapes: rest, file: `${id}_rest.png` }]
  for (const emotion of FEELINGS) {
    const values = { ...rest }
    if (emotion === 'neutral') values.jawOpen = offset + 0.01
    // same: every feeling makes the same face (indistinguishable expressions)
    const features = same ? template.emotions.joy.features : template.emotions[emotion].features
    for (const [name, t] of Object.entries(features)) values[name] = offset + t * strength
    rows.push({ person: id, emotion, faces: 1, blendshapes: values, file: `${id}_${emotion}.png` })
  }
  return rows
}
const TARGET = ['p1', 'p2', 'p3', 'p4', 'p5']
const STAR = ['p6', 'p7', 'p8']
const EVAL = ['p9', 'team1']
const records = [
  ...TARGET.flatMap((p, i) => person(p, 0.9 + i * 0.05)),
  ...STAR.flatMap((p, i) => person(p, 0.7 + i * 0.2, 0.08)),
  ...EVAL.flatMap((p, i) => person(p, 0.85 + i * 0.1, 0.06)),
]
const roles = { targetPersons: TARGET, starPersons: STAR, evalPersons: EVAL }
const build = (rows = records, r = roles) => buildBaseline(template, rows, { ...r, version: 'err-v1', builtAt: '2026-11-28T00:00:00Z' })

test('percentile interpolates and handles empty lists', () => {
  assert.equal(percentile([], 0.5), null)
  assert.equal(percentile([0, 10], 0.9), 9)
  assert.equal(percentile([3, 1, 2], 0.5), 2)
})

test('photos without exactly one face are left out and listed', () => {
  const { people, skipped } = byPerson([
    ...person('a'), { person: 'b', emotion: 'joy', faces: 2, blendshapes: {}, file: 'b_joy.png' },
    { person: 'c', emotion: 'joy', faces: 0, blendshapes: null, file: 'c_joy.png' },
  ])
  assert.deepEqual(Object.keys(people), ['a'])
  assert.deepEqual(skipped, ['b_joy.png', 'c_joy.png'])
})

test('targets are the mean of (expression − rest) over the target persons', () => {
  const { people } = byPerson(records)
  const { features, counts } = buildTargets(people, TARGET, { joy: ['mouthSmileLeft'] })
  assert.equal(features.joy.mouthSmileLeft, 0.6) // strengths 0.9..1.1 → mean 1.0 × 0.6
  assert.equal(counts.joy, 5)
})

test('star lines: ★1 from other expressions, ★2·★3 from the same, in order; fear and disgust lower', () => {
  const { people } = byPerson(records)
  const { lines, stats } = computeStars({ ...template, method: 'err' }, people, STAR)
  for (const [id, l] of Object.entries(lines)) assert.ok(l[0] <= l[1] && l[1] <= l[2], `${id} ${l}`)
  assert.equal(stats.joy.same, 3)
  assert.equal(stats.joy.other, 18) // 3 persons × 6 other feelings (the rest photo is not scored)
  assert.ok(stats.neutral.same === 3) // neutral is evaluated too (its own photo against rest)
  const lowered = computeStars({ ...template, method: 'err' }, people, STAR, { lower: 0.5 }).lines.fear
  assert.ok(lowered[1] <= lines.fear[1])
})

test('clean, complete, separate data is measured — but not approved, and the child screen stays off', () => {
  const { baseline, issues, compare, evaluation } = build()
  assert.deepEqual(issues, [])
  assert.equal(baseline.status, 'measured')
  for (const spec of Object.values(baseline.emotions)) assert.equal(spec.status, 'measured')
  assert.deepEqual(baseline.approval, { approved: false, by: null, at: null, version: null, note: null })
  assert.equal(baselineApproved(baseline), false)
  assert.deepEqual(baseline.built.data.targetPersons, TARGET)
  assert.deepEqual(baseline.built.data.starAndComparePersons, STAR)
  assert.deepEqual(baseline.built.data.evalPersons, EVAL)
  assert.match(baseline.built.scope, /아동 대상 검증이 아니다/)
  for (const method of ['err', 'cos']) {
    assert.deepEqual(createMirrorScorer({ ...baseline, method }).warnings, [], method)
    assert.ok(compare[method].top1 >= 0.8, `${method} top1 ${compare[method].top1}`)
    assert.deepEqual(Object.keys(evaluation[method]).sort(), [...FEELINGS].sort()) // neutral included
  }
  assert.match(compare.scope, /neutral/)
  const approved = approveBaseline(baseline, { by: '검토자', at: '2026-11-29' })
  assert.equal(baselineApproved(approved), true)
  assert.equal(baselineApproved({ ...approved, version: 'err-v2' }), false)
})

test('the same person in two roles is refused', () => {
  for (const r of [
    { ...roles, starPersons: ['p1', 'p7', 'p8'] }, // 기준과 별 기준에 같은 사람
    { ...roles, evalPersons: ['p6'] }, // 별 기준과 최종 평가에 같은 사람
    { ...roles, targetPersons: ['p1', 'p1', 'p2', 'p3', 'p4', 'p5'] },
  ]) {
    const { baseline, issues } = build(records, r)
    assert.notEqual(baseline.status, 'measured', JSON.stringify(r))
    assert.ok(issues.some((x) => /같은 사람/.test(x)), issues.join('\n'))
    assert.throws(() => approveBaseline(baseline, { by: '검토자' }), /승인할 수 없어요/)
  }
})

test('too few people or missing photos are not measured', () => {
  assert.equal(MIN_TARGET_PERSONS, 5)
  assert.equal(MIN_STAR_PERSONS, 3)
  const few = build(records, { ...roles, targetPersons: TARGET.slice(0, 4) })
  assert.ok(few.issues.some((x) => /기준 인원이 부족/.test(x)))
  assert.notEqual(few.baseline.status, 'measured')
  const fewStars = build(records, { ...roles, starPersons: STAR.slice(0, 2) })
  assert.ok(fewStars.issues.some((x) => /별 기준 인원이 부족/.test(x)))
  // one person misses one feeling → that person is incomplete, so only 4 complete target persons
  const missing = build(records.filter((r) => !(r.person === 'p2' && r.emotion === 'fear')))
  assert.deepEqual(missing.baseline.built.data.incomplete, { p2: ['fear'] })
  assert.notEqual(missing.baseline.status, 'measured')
  // a feeling missing for everyone keeps its provisional values
  const noDisgust = build(records.filter((r) => r.emotion !== 'disgust'))
  assert.equal(noDisgust.baseline.status, 'incomplete')
  assert.equal(noDisgust.baseline.emotions.disgust.status, 'provisional')
  assert.deepEqual(noDisgust.baseline.emotions.disgust.features, template.emotions.disgust.features)
})

test('a neutral photo that is the rest photo is refused (neutral would score itself)', () => {
  const copied = records.map((r) => (r.person === 'p7' && r.emotion === 'neutral'
    ? { ...r, blendshapes: records.find((o) => o.person === 'p7' && o.emotion === REST).blendshapes } : r))
  const { issues, baseline } = build(copied)
  assert.ok(issues.some((x) => /p7: neutral 사진이 rest/.test(x)))
  assert.notEqual(baseline.status, 'measured')
  const sameFile = records.map((r) => (r.person === 'p3' && r.emotion === 'neutral' ? { ...r, file: 'p3_rest.png' } : r))
  assert.ok(checkData(sameFile, roles).problems.some((x) => /p3: neutral과 rest가 같은 파일/.test(x)))
})

test('indistinguishable expressions are reported as weak and never measured', () => {
  const same = [
    ...TARGET.flatMap((p, i) => person(p, 0.9 + i * 0.05)),
    ...STAR.flatMap((p, i) => person(p, 0.7 + i * 0.2, 0.08, { same: true })), // star persons make one face for all
    ...EVAL.flatMap((p) => person(p, 1, 0.06, { same: true })),
  ]
  const { issues, baseline } = build(same)
  assert.ok(issues.some((x) => /구분이 약/.test(x)), issues.join('\n'))
  assert.equal(baseline.status, 'measured-with-issues')
  assert.throws(() => approveBaseline(baseline, { by: '검토자' }), /measured-with-issues/)
})

test('approval needs a reviewer and a held-out evaluation', () => {
  const { baseline } = build()
  assert.throws(() => approveBaseline(baseline, {}), /이름/)
  const noEval = build(records, { targetPersons: TARGET, starPersons: STAR })
  assert.equal(noEval.evaluation, null)
  assert.ok(noEval.warnings.some((x) => /최종 평가 인원/.test(x)))
  assert.throws(() => approveBaseline(noEval.baseline, { by: '검토자' }), /최종 평가/)
})

test('the command builds without approving, and approve refuses a baseline with problems', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-'))
  const script = new URL('../scripts/mirror-baseline.mjs', import.meta.url).pathname
  writeFileSync(join(dir, 'in.json'), JSON.stringify({ records }))
  const run = (...argv) => execFileSync(process.execPath, [script, ...argv], { stdio: 'pipe' })
  run('build', '--input', join(dir, 'in.json'), '--target-persons', TARGET.join(','), '--star-persons', STAR.join(','),
    '--eval-persons', EVAL.join(','), '--out', join(dir, 'out.json'), '--report', join(dir, 'report.json'))
  const out = JSON.parse(readFileSync(join(dir, 'out.json')))
  const report = JSON.parse(readFileSync(join(dir, 'report.json')))
  assert.equal(out.status, 'measured')
  assert.equal(out.approval.approved, false)
  assert.ok(report.compare.err && report.compare.cos && report.evaluation.err)
  run('approve', '--file', join(dir, 'out.json'), '--by', '검토자')
  assert.equal(JSON.parse(readFileSync(join(dir, 'out.json'))).approval.approved, true)

  run('build', '--input', join(dir, 'in.json'), '--target-persons', 'p1,p2', '--star-persons', STAR.join(','),
    '--eval-persons', EVAL.join(','), '--out', join(dir, 'bad.json'))
  assert.throws(() => run('approve', '--file', join(dir, 'bad.json'), '--by', '검토자'))
  assert.equal(JSON.parse(readFileSync(join(dir, 'bad.json'))).approval.approved, false)
})
