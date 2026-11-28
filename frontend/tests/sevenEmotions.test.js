// The seven feelings (공통 7감정) connected end to end with the drafts (fear, disgust, neutral) merged, as a
// preview build (VITE_CONTENT_DRAFTS=1) does. Children's builds keep the reviewed four (checked below).
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import emotions from '../../backend/app/content/emotions.json' with { type: 'json' }
import tales from '../../backend/app/content/tales.json' with { type: 'json' }
import draftEmotions from '../../backend/app/content/drafts/emotions.json' with { type: 'json' }
import draftTales from '../../backend/app/content/drafts/tales.json' with { type: 'json' }

const reviewed = Object.keys(emotions)
const content = await import('../src/content.js')
assert.equal(content.draftsOn, false) // node tests and children's builds: no drafts
assert.deepEqual(Object.keys(content.emotions), ['joy', 'surprise', 'sad', 'anger'])
// merge the drafts into the shared data before the app modules load (like the preview build)
Object.assign(emotions, content.mergeDrafts(emotions, draftEmotions))
Object.assign(tales, content.mergeDrafts(tales, draftTales))
const { topics, forToday, emptySession } = await import('../src/session.js')
const { forestTales } = await import('../src/forestTales.js')
const { FACES } = await import('../src/storyTalk.js')
const { emotionRows } = await import('../src/dashboard.js')
const { taleBackground } = await import('../src/taleBackgrounds.js')
const { createMirrorScorer } = await import('../src/mirrorScore.js')
const baseline = JSON.parse(readFileSync(new URL('../src/mirrorBaseline.json', import.meta.url)))

const SEVEN = { anger: '화남', disgust: '혐오', fear: '두려움', joy: '기쁨', neutral: '무표정', sad: '슬픔', surprise: '놀람' }
const NEW = ['fear', 'disgust', 'neutral']
const art = (path) => new URL('../public/' + path, import.meta.url)

test('the draft ids are the three new feelings, after the reviewed four', () => {
  assert.deepEqual(content.draftIds, NEW)
  assert.deepEqual(topics.map((t) => t.id), [...reviewed, ...NEW])
  assert.deepEqual(Object.fromEntries(topics.map((t) => [t.id, t.label])), Object.fromEntries(topics.map((t) => [t.id, SEVEN[t.id]])))
})

test('the daily rotation goes through all seven', () => {
  const start = { ...emptySession('2026-11-01'), onboarded: true }
  const seen = Array.from({ length: 8 }, (_, i) => forToday(start, '2026-11-0' + (i + 1)).topicId)
  assert.deepEqual(seen, [...reviewed, ...NEW, reviewed[0]])
  assert.equal(emotionRows(topics.map((t) => ({ topicId: t.id, label: t.label, answers: 1, accuracy: 1 }))).length, 7)
})

test('every feeling has a tale, the friend can draw every face used, and the mirror has a target', () => {
  const painted = readFileSync(new URL('../src/PaintedFriend.jsx', import.meta.url), 'utf8')
  const drawn = JSON.parse(painted.match(/DRAWN_FEELINGS = new Set\((\[[^\]]+\])\)/)[1].replaceAll("'", '"'))
  assert.deepEqual([...drawn].sort(), Object.keys(SEVEN).sort())
  assert.deepEqual([...FACES].sort(), Object.keys(SEVEN).sort())
  for (const id of Object.keys(SEVEN)) {
    const tale = forestTales[id]
    assert.ok(tale && tale.pages.length === 3 && tale.actions.length === 2, id)
    for (const face of [...tale.talk.replyExpressions, ...tale.talk.endExpressions, ...tale.actions.map((a) => a.expression)]) {
      assert.ok(FACES.includes(face), `${id} ${face}`)
    }
    assert.ok(baseline.emotions[id], `mirror baseline ${id}`)
  }
  for (const method of ['err', 'cos']) {
    const scorer = createMirrorScorer({ ...baseline, method })
    for (const id of Object.keys(SEVEN)) scorer.setTarget(id)
  }
})

test('drafts have the same fields as the reviewed feelings', () => {
  for (const id of NEW) {
    assert.deepEqual(Object.keys(emotions[id]).sort(), Object.keys(emotions.joy).sort(), id)
    assert.deepEqual(Object.keys(emotions[id].practice).sort(), Object.keys(emotions.joy.practice).sort(), id)
    assert.deepEqual(Object.keys(tales[id].talk).sort(), Object.keys(tales.joy.talk).sort(), id)
  }
  assert.ok(emotions.neutral.aliases.includes('평온') && emotions.disgust.aliases.includes('싫음')) // 이전 표기
})

test('missing pictures of the drafts are listed, and the tale falls back to the forest picture', () => {
  for (const id of NEW) {
    const missing = [`art/cards/${id}.webp`, `art/cards/girl-${id}.webp`, `art/practice/${id}-before.webp`,
      `art/practice/${id}-after.webp`].filter((p) => !existsSync(art(p)))
    for (const p of missing) {
      const pattern = p.replace(id, '{id}')
      assert.ok(draftEmotions.needs.art.some((need) => need.endsWith(pattern)), `needs 목록에 ${pattern}`)
    }
    assert.equal(taleBackground(id), 'art/forest-gate.webp')
  }
  const activities = readFileSync(new URL('../src/Activities.jsx', import.meta.url), 'utf8')
  assert.match(activities, /onError=\{\(\) => setMissing\(true\)\}/) // card picture fallback
})

test('the reviewed four keep all their pictures', () => {
  for (const id of reviewed) {
    for (const p of [`art/cards/${id}.webp`, `art/cards/girl-${id}.webp`]) assert.ok(existsSync(art(p)), p)
  }
})
