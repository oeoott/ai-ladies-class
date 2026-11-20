import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emptySession,
  forToday,
  finishWalk,
  readSession,
  withRecordedStickers,
} from '../src/session.js'

const date = '2026-11-20'
const tomorrow = '2026-11-21'

test('a fresh or unreadable saved walk starts quietly with the lion and joy', () => {
  for (const value of [null, 'not-json', '{}', '{"version":1,"day":"bad"}']) {
    assert.deepEqual(readSession(value, date), emptySession(date))
  }
})
test('a level test or lesson resumes with its choices even on a later day', () => {
  const placement = {
    ...emptySession(date),
    page: 'placement',
    placement: { index: 1, usedHint: true },
  }
  assert.deepEqual(readSession(JSON.stringify(placement), tomorrow), placement)
  const lesson = {
    ...placement,
    page: 'lesson',
    step: 2,
    activity: { step: 2, phase: 'question' },
    friendId: 'bear',
  }
  assert.deepEqual(readSession(JSON.stringify(lesson), tomorrow), lesson)
})
test('repeated completion and reopening the sticker board award a single daily sticker', () => {
  const done = finishWalk({ ...emptySession(date), page: 'lesson', step: 2 })
  assert.deepEqual(done.records, [{ date, topic: '기쁨' }])
  assert.deepEqual(finishWalk(done).records, done.records)
  assert.equal(forToday({ ...done, page: 'stickers' }, tomorrow).page, 'stickers')
})
test('next day starts one new topic, maintaining the friend, level and collected stickers', () => {
  const completed = finishWalk({
    ...emptySession(date),
    friendId: 'rabbit',
    onboarded: true,
    level: 'expand',
  })
  const next = forToday({ ...completed, page: 'welcome' }, tomorrow)
  assert.equal(next.topicId, 'surprise')
  assert.equal(next.step, 0)
  assert.equal(next.day, tomorrow)
  assert.equal(next.level, 'expand')
  assert.equal(next.friendId, 'rabbit')
  assert.deepEqual(next.records, completed.records)
  assert.equal(forToday(next, tomorrow), next)
})

test('saving from an older tab preserves stickers earned in a second tab', () => {
  const first = finishWalk(emptySession(date))
  const next = finishWalk(forToday({ ...first, page: 'welcome' }, tomorrow))
  const reconciled = withRecordedStickers(first, next.records)
  assert.deepEqual(reconciled.records, next.records)
  assert.equal(withRecordedStickers(reconciled, next.records), reconciled)
})
