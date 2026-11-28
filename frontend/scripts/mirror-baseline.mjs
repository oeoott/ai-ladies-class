#!/usr/bin/env node
// 표정 거울 기준값 만들기. 기준 사진의 blendshape(ai/mirror/extract_blendshapes.py 결과)로
// 감정별 목표값과 별 기준을 계산해 src/mirrorBaseline.json 모양으로 저장하고, err·cos 비교 보고서를 쓴다.
//
//   node scripts/mirror-baseline.mjs --input ../docs/ai/mirror/blendshapes.json \
//     --target-persons p01,p02,p03,p04,p05 --star-persons p06,p07,p08,team1 \
//     [--method err] [--version err-v1] [--out src/mirrorBaseline.json] [--report ../docs/ai/mirror/compare.json]
//
// --out을 주지 않으면 결과를 화면에만 보여 준다 (src/mirrorBaseline.json을 덮어쓰지 않음).
import { readFileSync, writeFileSync } from 'node:fs'
import { buildBaseline } from '../src/mirrorBaselineBuild.js'

function args(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1]
  return out
}

const a = args(process.argv.slice(2))
if (!a.input || !a['target-persons'] || !a['star-persons']) {
  console.error('필요: --input, --target-persons, --star-persons (쉼표로 구분)')
  process.exit(2)
}
const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)
const template = JSON.parse(readFileSync(new URL('../src/mirrorBaseline.json', import.meta.url)))
const input = JSON.parse(readFileSync(a.input, 'utf8'))
const records = Array.isArray(input) ? input : input.records
const method = a.method ?? template.method
const { baseline, warnings, compare } = buildBaseline({ ...template, method }, records, {
  targetPersons: list(a['target-persons']), starPersons: list(a['star-persons']),
  version: a.version, builtAt: new Date().toISOString(),
})
for (const w of warnings) console.error('주의:', w)
console.error('비교:', JSON.stringify(Object.fromEntries(Object.entries(compare).map(([m, r]) => [m, r.top1]))))
const text = JSON.stringify(baseline, null, 1) + '\n'
if (a.out) writeFileSync(a.out, text)
else process.stdout.write(text)
if (a.report) writeFileSync(a.report, JSON.stringify({ method, compare, warnings }, null, 1) + '\n')
