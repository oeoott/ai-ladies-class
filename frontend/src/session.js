export const STORAGE_KEY = 'maeum-forest.walk.v1'
export const topics = [
  { id: 'joy', label: '기쁨', phrase: '기쁜 마음' },
  { id: 'surprise', label: '놀람', phrase: '놀란 마음' },
  { id: 'sad', label: '슬픔', phrase: '슬픈 마음' },
  { id: 'anger', label: '화남', phrase: '화난 마음' },
]
const topicIds = topics.map((topic) => topic.id)
const pages = ['welcome', 'placement', 'ready', 'lesson', 'praise', 'stickers']

export function localDay(now = new Date()) {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

export function emptySession(day = localDay()) {
  return {
    version: 1,
    day,
    topicId: 'joy',
    reviewTopicId: null,
    reviewReturn: null,
    page: 'welcome',
    friendId: 'lion',
    friendCharm: null,
    friendHeadwear: null,
    friendNickname: '',
    onboarded: false,
    level: 'basic',
    step: 0,
    placement: null,
    activity: null,
    retestReturn: null,
    records: [],
  }
}

function dayValue(day) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? Date.parse(day + 'T00:00:00Z') : NaN
}

// A walk that is already open keeps its date and topic until it finishes.
export function forToday(session, today = localDay()) {
  const difference = Math.round((dayValue(today) - dayValue(session.day)) / 86400000)
  if (!(difference > 0) || session.page !== 'welcome') return session
  const topicId = topicIds[(topicIds.indexOf(session.topicId) + difference) % topics.length]
  return {
    ...session,
    day: today,
    topicId,
    page: 'welcome',
    step: 0,
    placement: null,
    activity: null,
    retestReturn: null,
  }
}

export function readSession(raw, today = localDay()) {
  try {
    const saved = JSON.parse(raw)
    if (saved?.version !== 1 || !Number.isFinite(dayValue(saved.day))) return emptySession(today)
    const defaults = emptySession(today)
    const state = {
      ...defaults,
      day: saved.day,
      page: pages.includes(saved.page) ? saved.page : 'welcome',
      topicId: topicIds.includes(saved.topicId) ? saved.topicId : 'joy',
      reviewTopicId: ['lesson', 'placement'].includes(saved.page) && topicIds.includes(saved.reviewTopicId)
        ? saved.reviewTopicId : null,
      friendId: ['lion', 'rabbit', 'bear'].includes(saved.friendId) ? saved.friendId : 'lion',
      friendCharm: ['leaf', 'star', 'flower'].includes(saved.friendCharm)
        ? saved.friendCharm
        : null,
      friendHeadwear: ['sky-hat', 'flower-pin'].includes(saved.friendHeadwear)
        ? saved.friendHeadwear
        : null,
      friendNickname:
        typeof saved.friendNickname === 'string' ? saved.friendNickname.trim().slice(0, 12) : '',
      onboarded: saved.onboarded === true,
      level: saved.level === 'expand' ? 'expand' : 'basic',
      step: [0, 1, 2].includes(saved.step) ? saved.step : 0,
      placement: saved.placement && typeof saved.placement === 'object' ? saved.placement : null,
      activity: saved.activity && typeof saved.activity === 'object' ? saved.activity : null,
      retestReturn: pages.includes(saved.retestReturn) ? saved.retestReturn : null,
      records: Array.isArray(saved.records)
        ? saved.records.filter(
            (r) =>
              r && Number.isFinite(dayValue(r.date)) && topics.some((t) => t.label === r.topic),
          )
        : [],
    }
    const back = saved.reviewReturn
    if (state.reviewTopicId && back && pages.includes(back.page)) {
      state.reviewReturn = {
        page: back.page,
        step: [0, 1, 2].includes(back.step) ? back.step : 0,
        activity: back.activity && typeof back.activity === 'object' ? back.activity : null,
        placement: back.placement && typeof back.placement === 'object' ? back.placement : null,
        retestReturn: pages.includes(back.retestReturn) ? back.retestReturn : null,
      }
    }
    return forToday(state, today)
  } catch {
    return emptySession(today)
  }
}

// A second tab can be finishing a different, previously opened walk.
export function withRecordedStickers(session, savedRecords) {
  const seen = new Set(session.records.map((record) => record.date))
  const additional = savedRecords.filter((record) => !seen.has(record.date))
  if (!additional.length) return session
  const records = [...session.records, ...additional].sort((a, b) => a.date.localeCompare(b.date))
  return { ...session, records }
}

export function beginWalk(session, today = localDay()) {
  if (['placement', 'ready', 'lesson'].includes(session.page)) return session
  const current = forToday({ ...session, page: 'welcome' }, today)
  if (!current.onboarded) return current
  return {
    ...current,
    page: 'lesson',
    step: 0,
    activity: null,
    placement: null,
    retestReturn: null,
  }
}

export function reviewSticker(session, record, fromGuardian = false) {
  const topic = topics.find((item) => item.label === record.topic)
  if (!topic) return session
  const { page, step, activity, placement, retestReturn } = session
  const reviewReturn = session.reviewReturn || (fromGuardian && !session.reviewTopicId
    ? { page, step, activity, placement, retestReturn }
    : null)
  return { ...session, page: 'lesson', step: 0, activity: null, placement: null, retestReturn: null, reviewTopicId: topic.id, reviewReturn }
}

export function finishWalk(session) {
  if (session.reviewTopicId) {
    return { ...session, page: 'stickers', step: 2, activity: null, ...session.reviewReturn, reviewTopicId: null, reviewReturn: null }
  }
  const topic = topics.find((entry) => entry.id === session.topicId)
  const records = session.records.some((record) => record.date === session.day)
    ? session.records
    : [...session.records, { date: session.day, topic: topic.label }]
  return { ...session, page: 'praise', records, activity: null, step: 2 }
}
