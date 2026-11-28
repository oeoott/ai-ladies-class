import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { FEELINGS, REST, buildBaseline, buildTargets, byPerson, computeStars, percentile } from '../src/mirrorBaselineBuild.js'
import { createMirrorScorer } from '../src/mirrorScore.js'

const template = JSON.parse(readFileSync(new URL('../src/mirrorBaseline.json', import.meta.url)))
const ALL = [...new Set(Object.values(template.emotions).flatMap((e) => Object.keys(e.features)))]

// Synthetic test data only (not reference photos): each person's rest face plus that feeling's features × strength.
function person(id, strength = 1, offset = 0.05) {
  const rest = Object.fromEntries([...ALL, 'eyeBlinkLeft'].map((n) => [n, offset]))
  const rows = [{ person: id, emotion: REST, faces: 1, blendshapes: rest, file: `${id}_rest.png` }]
  for (const emotion of FEELINGS) {
    const values = { ...rest }
    for (const [name, t] of Object.entries(template.emotions[emotion].features)) values[name] = offset + t * strength
    rows.push({ person: id, emotion, faces: 1, blendshapes: values, file: `${id}_${emotion}.png` })
  }
  return rows
}
const TARGET = ['p1', 'p2', 'p3', 'p4', 'p5']
const STAR = ['p6', 'p7', 'p8']
const records = [
  ...TARGET.flatMap((p, i) => person(p, 0.9 + i * 0.05)),
  ...STAR.flatMap((p, i) => person(p, 0.7 + i * 0.2, 0.08)),
]

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
  // strengths 0.9..1.1 → mean 1.0 × 0.6
  assert.equal(features.joy.mouthSmileLeft, 0.6)
  assert.equal(counts.joy, 5)
})

test('star lines: ★1 from other expressions, ★2·★3 from the same, in order; fear and disgust lower', () => {
  const { people } = byPerson(records)
  const { lines, warnings, stats } = computeStars({ ...template, method: 'err' }, people, STAR)
  for (const [id, l] of Object.entries(lines)) assert.ok(l[0] <= l[1] && l[1] <= l[2], `${id} ${l}`)
  assert.equal(stats.joy.same, 3)
  assert.equal(stats.joy.other, 18) // 3 persons × 6 other feelings (the rest photo is not scored)
  const lowered = computeStars({ ...template, method: 'err' }, people, STAR, { lower: 0.5 }).lines.fear
  assert.ok(lowered[1] <= lines.fear[1])
  assert.ok(Array.isArray(warnings))
})

test('the built baseline is measured, loads in the scorer and separates feelings in both methods', () => {
  const { baseline, warnings, compare } = buildBaseline(template, records, {
    targetPersons: TARGET, starPersons: STAR, version: 'err-v1', builtAt: '2026-11-28T00:00:00Z' })
  assert.equal(baseline.status, 'measured')
  for (const spec of Object.values(baseline.emotions)) assert.equal(spec.status, 'measured')
  assert.equal(baseline.version, 'err-v1')
  assert.deepEqual(baseline.built.targetPersons, TARGET)
  for (const method of ['err', 'cos']) {
    assert.deepEqual(createMirrorScorer({ ...baseline, method }).warnings, [], method)
    assert.ok(compare[method].top1 >= 0.8, `${method} top1 ${compare[method].top1}`)
  }
  assert.ok(warnings.every((w) => typeof w === 'string'))
})

test('missing photos keep the provisional values and say so', () => {
  const partial = records.filter((r) => r.emotion !== 'disgust')
  const { baseline, warnings } = buildBaseline(template, partial, { targetPersons: TARGET, starPersons: STAR })
  assert.equal(baseline.emotions.disgust.status, 'provisional')
  assert.deepEqual(baseline.emotions.disgust.features, template.emotions.disgust.features)
  assert.equal(baseline.status, 'partial')
  assert.ok(warnings.some((w) => w.startsWith('disgust: 기준 사진이 없어')))
})

test('the command writes the baseline and the comparison report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mirror-'))
  writeFileSync(join(dir, 'in.json'), JSON.stringify({ records }))
  execFileSync(process.execPath, [new URL('../scripts/mirror-baseline.mjs', import.meta.url).pathname,
    '--input', join(dir, 'in.json'), '--target-persons', TARGET.join(','), '--star-persons', STAR.join(','),
    '--out', join(dir, 'out.json'), '--report', join(dir, 'report.json')], { stdio: 'pipe' })
  const out = JSON.parse(readFileSync(join(dir, 'out.json')))
  const report = JSON.parse(readFileSync(join(dir, 'report.json')))
  assert.equal(out.status, 'measured')
  assert.deepEqual(Object.keys(report.compare), ['err', 'cos'])
})
