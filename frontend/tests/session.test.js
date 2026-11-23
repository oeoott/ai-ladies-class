import test from 'node:test'
import assert from 'node:assert/strict'
import {
  beginWalk,
  emptySession,
  forToday,
  finishWalk,
  readSession,
  reviewSticker,
  nextStickerTopic,
  startNextStickerLesson,
  withRecordedStickers,
} from '../src/session.js'

const date = '2026-11-20'
const tomorrow = '2026-11-21'

test('the first empty sticker opens the next lesson without duplicating a daily award', () => {
  const book = {
    ...emptySession(date),
    onboarded: true,
    page: 'stickers',
    topicId: 'surprise',
    records: [{ date, topic: '놀람' }],
  }
  assert.equal(nextStickerTopic(book).id, 'sad')
  const preview = startNextStickerLesson(book, date)
  assert.equal(preview.page, 'lesson')
  assert.equal(preview.step, 0)
  assert.equal(preview.reviewTopicId, 'sad')
  assert.deepEqual(finishWalk(readSession(JSON.stringify(preview), date)).records, book.records)

  const nextDay = startNextStickerLesson(book, tomorrow)
  assert.equal(nextDay.topicId, 'sad')
  assert.equal(nextDay.day, tomorrow)
  assert.deepEqual(finishWalk(nextDay).records.at(-1), { date: tomorrow, topic: '슬픔' })
})

test('a fresh or unreadable saved walk starts quietly with the lion and joy', () => {
  for (const value of [null, 'not-json', '{}', '{"version":1,"day":"bad"}']) {
    assert.deepEqual(readSession(value, date), emptySession(date))
  }
})
test('a made friend keeps its name and accessories across sessions and replays', () => {
  const made = {
    ...emptySession(date),
    onboarded: true,
    friendId: 'rabbit',
    cardPortrait: 'girl',
    friendCharm: 'star',
    friendHeadwear: 'sky-hat',
    friendNickname: '여름',
  }
  const restored = readSession(JSON.stringify(made), date)
  assert.deepEqual(restored, made)
  const replay = beginWalk({ ...finishWalk(restored), page: 'welcome' }, tomorrow)
  for (const field of ['friendId', 'cardPortrait', 'friendCharm', 'friendHeadwear', 'friendNickname']) {
    assert.equal(replay[field], made[field])
  }
  const old = readSession(JSON.stringify({ version: 1, day: date, friendId: 'bear' }), date)
  assert.equal(old.friendId, 'bear')
  assert.equal(old.cardPortrait, 'boy')
  assert.equal(old.friendCharm, null)
  assert.equal(old.friendHeadwear, null)
  assert.equal(old.friendNickname, '')
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
test('a completed walk can be practiced again at the same level without another sticker', () => {
  const done = finishWalk({
    ...emptySession(date),
    onboarded: true,
    topicId: 'sad',
    friendId: 'rabbit',
    level: 'expand',
  })
  for (const page of ['welcome', 'stickers', 'praise']) {
    const saved = readSession(JSON.stringify({ ...done, page, settings: { sound: false } }), date)
    const replay = beginWalk(saved, date)
    assert.equal(replay.page, 'lesson')
    assert.equal(replay.step, 0)
    assert.equal(replay.activity, null)
    assert.equal(replay.topicId, 'sad')
    assert.equal(replay.friendId, 'rabbit')
    assert.equal(replay.level, 'expand')
    assert.deepEqual(finishWalk(replay).records, done.records)
  }
})
test('an unfinished replay resumes and a past completed walk starts today’s topic', () => {
  const done = finishWalk({ ...emptySession(date), onboarded: true })
  const replay = { ...beginWalk(done, date), step: 1 }
  assert.equal(beginWalk(replay, tomorrow), replay)
  const next = beginWalk({ ...done, page: 'stickers' }, tomorrow)
  assert.equal(next.day, tomorrow)
  assert.equal(next.topicId, 'surprise')
  assert.equal(next.step, 0)
  assert.deepEqual(next.records, done.records)
  assert.equal(beginWalk(emptySession(date), date).page, 'welcome')
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

test('an older sticker resumes its own lesson and returns without changing the daily walk', () => {
  const first = finishWalk({ ...emptySession(date), onboarded: true })
  const daily = beginWalk(first, tomorrow)
  const done = finishWalk(daily)
  const review = reviewSticker(done, first.records[0])
  assert.equal(review.reviewTopicId, 'joy')
  assert.equal(review.topicId, 'surprise')
  assert.equal(review.step, 0)
  const midway = { ...review, step: 1 }
  const restored = beginWalk(readSession(JSON.stringify(midway), tomorrow), tomorrow)
  assert.deepEqual(restored, midway)
  const book = finishWalk(restored)
  assert.equal(book.page, 'stickers')
  assert.equal(book.reviewTopicId, null)
  assert.deepEqual(book.records, done.records)
  assert.equal(beginWalk(book, tomorrow).topicId, 'surprise')
})

test('guardian sticker review preserves the unfinished lesson after a reload', () => {
  const daily = { ...beginWalk({ ...emptySession(date), onboarded: true }, date),
    step: 2, activity: { phase: 'book', bookPage: 1 }, records: [{ date: '2026-11-19', topic: '슬픔' }] }
  const review = reviewSticker(daily, daily.records[0], true)
  assert.equal(review.reviewTopicId, 'sad')
  assert.deepEqual(finishWalk(readSession(JSON.stringify(review), date)), daily)
})

test('a server walk id survives reloads, pauses for a guardian review and clears when the walk ends', () => {
  const daily = { ...beginWalk({ ...emptySession(date), onboarded: true }, date), step: 1, walkId: 'w-daily' }
  assert.equal(readSession(JSON.stringify(daily), date).walkId, 'w-daily')
  assert.equal(readSession(JSON.stringify({ ...daily, walkId: 7 }), date).walkId, null)
  const review = { ...reviewSticker(daily, { topic: '슬픔' }, true), walkId: 'w-review' }
  const back = finishWalk(readSession(JSON.stringify(review), date))
  assert.equal(back.walkId, 'w-daily')
  assert.equal(finishWalk(back).walkId, null)
  assert.equal(finishWalk(reviewSticker(finishWalk(daily), { topic: '기쁨' })).walkId, null)
})
