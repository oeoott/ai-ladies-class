// Adding emotions only means adding entries to backend/app/content/{emotions,tales}.json.
// Three fake emotions exist only inside this test file (node --test runs each file in its own process).
import assert from 'node:assert/strict'
import test from 'node:test'
import emotions from '../../backend/app/content/emotions.json' with { type: 'json' }
import tales from '../../backend/app/content/tales.json' with { type: 'json' }

const FAKES = { fake1: '가짜하나', fake2: '가짜둘', fake3: '가짜셋' }
for (const [id, label] of Object.entries(FAKES)) {
  emotions[id] = { ...structuredClone(emotions.joy), label, phrase: label + ' 마음', aliases: [], oppositeFirst: false }
  tales[id] = structuredClone(tales.joy)
}
// Load the app modules only after the shared data has the fakes.
const { topics, forToday, emptySession, beginWalk, finishWalk, nextStickerTopic } = await import('../src/session.js')
const { forestTales } = await import('../src/forestTales.js')
const { emotionRows, practiceEmotion } = await import('../src/dashboard.js')

test('topics come from the shared JSON, in its order', () => {
  assert.deepEqual(topics.map((t) => t.id), ['joy', 'surprise', 'sad', 'anger', 'fake1', 'fake2', 'fake3'])
  assert.equal(topics[5].label, '가짜둘')
  assert.equal(forestTales.fake2.title, forestTales.joy.title) // 동화도 같은 id로 열림
})

test('the daily rotation goes through all seven and wraps around', () => {
  const start = { ...emptySession('2026-11-01'), onboarded: true }
  const seen = []
  for (let day = 1; day <= 8; day++) {
    const date = '2026-11-' + String(day).padStart(2, '0')
    seen.push(forToday(start, date).topicId)
  }
  assert.deepEqual(seen, ['joy', 'surprise', 'sad', 'anger', 'fake1', 'fake2', 'fake3', 'joy'])
})

test('a fake emotion gets a sticker and the next sticker topic follows the order', () => {
  let session = { ...emptySession('2026-11-06'), onboarded: true, topicId: 'fake2' }
  session = finishWalk(beginWalk(session, '2026-11-06'))
  assert.deepEqual(session.records, [{ date: '2026-11-06', topic: '가짜둘' }])
  assert.equal(nextStickerTopic(session).id, 'fake3')
  session = { ...session, records: [{ date: '2026-11-07', topic: '가짜셋' }] }
  assert.equal(nextStickerTopic(session).id, 'joy') // 마지막 다음은 처음으로
})

test('the dashboard shows one row per emotion (7)', () => {
  const stats = topics.map((t, i) => ({ topicId: t.id, label: t.label, answers: 2, accuracy: i === 5 ? 0.5 : 1 }))
  const rows = emotionRows(stats)
  assert.equal(rows.length, 7)
  assert.equal(rows[6].label, '가짜셋')
  assert.equal(practiceEmotion(stats), '가짜둘')
})
