#!/usr/bin/env node
// 표정 거울 기준값 만들기와 승인. 두 단계는 따로다.
//
// 1) 계산·측정: 기준 사진의 blendshape(ai/mirror/extract_blendshapes.py 결과)로 목표값·별 기준을 계산하고
//    err·cos 비교, 최종 평가(eval 인원), 자료 문제를 보고한다. 승인하지 않는다.
//   node scripts/mirror-baseline.mjs build --input ../docs/ai/mirror/blendshapes.json \
//     --target-persons p01,p02,p03,p04,p05 --star-persons p06,p07,p08,team1 --eval-persons p09,team2 \
//     [--method err] [--version err-v1] [--out src/mirrorBaseline.json] [--report ../docs/ai/mirror/report.json]
//   역할마다 다른 사람이어야 하고, 기준 5명·별 기준 3명 이상, 사람마다 rest + 7감정 사진이 있어야 한다.
//
// 2) 검토 후 사용 승인: status가 measured(문제 없음)이고 eval 평가가 있을 때만. 그 버전에만 적용된다.
//   node scripts/mirror-baseline.mjs approve --file src/mirrorBaseline.json --by 이름 [--note 메모]
//
// --out을 주지 않으면 결과를 화면에만 보여 준다 (src/mirrorBaseline.json을 덮어쓰지 않음).
import { readFileSync, writeFileSync } from 'node:fs'
import { approveBaseline, buildBaseline } from '../src/mirrorBaselineBuild.js'

function args(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1]
  return out
}

const [command, ...rest] = process.argv.slice(2)
const a = args(rest)
const list = (s) => (s ?? '').split(',').map((x) => x.trim()).filter(Boolean)

if (command === 'approve') {
  if (!a.file || !a.by) {
    console.error('필요: approve --file, --by')
    process.exit(2)
  }
  const baseline = JSON.parse(readFileSync(a.file, 'utf8'))
  try {
    writeFileSync(a.file, JSON.stringify(approveBaseline(baseline, { by: a.by, note: a.note }), null, 1) + '\n')
  } catch (error) {
    console.error('승인하지 않음:', error.message)
    process.exit(1)
  }
  console.error('승인:', baseline.version)
  process.exit(0)
}

if (command !== 'build' || !a.input || !a['target-persons'] || !a['star-persons']) {
  console.error('사용: build --input --target-persons --star-persons [--eval-persons] ... | approve --file --by')
  process.exit(2)
}
const template = JSON.parse(readFileSync(new URL('../src/mirrorBaseline.json', import.meta.url)))
const input = JSON.parse(readFileSync(a.input, 'utf8'))
const records = Array.isArray(input) ? input : input.records
const method = a.method ?? template.method
const result = buildBaseline({ ...template, method }, records, {
  targetPersons: list(a['target-persons']), starPersons: list(a['star-persons']), evalPersons: list(a['eval-persons']),
  version: a.version, builtAt: new Date().toISOString(),
})
for (const w of result.issues) console.error('문제:', w)
for (const w of result.warnings) console.error('주의:', w)
console.error('상태:', result.baseline.status, '(승인 전. 아이 화면 채점은 approve 후에만 켜짐)')
const text = JSON.stringify(result.baseline, null, 1) + '\n'
if (a.out) writeFileSync(a.out, text)
else process.stdout.write(text)
if (a.report) {
  writeFileSync(a.report, JSON.stringify({ method, status: result.baseline.status, issues: result.issues,
    warnings: result.warnings, data: result.baseline.built.data, compare: result.compare,
    evaluation: result.evaluation }, null, 1) + '\n')
}
