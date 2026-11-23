// Numbers for the guardian dashboard. The report API sends only counts and ratios, never sentences.
// The screen answers three questions only: how much, which feeling is hard, did they talk.
// The report still has more (mirror, hints, reviews, fallbacks, blocked); the screen leaves them out.
import { localDay } from './session.js'

// 주간 = Monday to Sunday, 월간 = the 1st to the last day of the month.
export const PERIODS = [
  { kind: 'week', label: '주간' },
  { kind: 'month', label: '월간' },
]

const at = (day) => new Date(day + 'T12:00:00')
const shift = (day, days) => { const d = at(day); d.setDate(d.getDate() + days); return localDay(d) }
const monday = (day) => shift(day, -((at(day).getDay() + 6) % 7))
const md = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일`

// The period `offset` steps back from the one holding `today` (0 = this week/month, -1 = the one before).
// `current` is true for this week/month: the next arrow is disabled there.
export function periodFor(kind, offset = 0, today = localDay()) {
  if (kind === 'month') {
    const t = at(today)
    const first = new Date(t.getFullYear(), t.getMonth() + offset, 1, 12)
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12)
    return {
      kind, from: localDay(first), to: localDay(last), current: offset >= 0,
      month: first.getMonth() + 1, name: `${first.getFullYear()}년 ${first.getMonth() + 1}월`,
    }
  }
  const from = shift(monday(today), offset * 7)
  const to = shift(from, 6)
  const [start, end] = [at(from), at(to)]
  let name = `${md(start)} ~ ${start.getMonth() === end.getMonth() ? end.getDate() + '일' : md(end)}`
  if (start.getFullYear() !== end.getFullYear()) name = `${start.getFullYear()}년 ${md(start)} ~ ${end.getFullYear()}년 ${md(end)}`
  return { kind, from, to, current: offset >= 0, name }
}

// 월간 calendar, Monday first. Cells outside the month are null (drawn empty).
// A day counts as walked when it has a sticker: a sticker comes with each day's completed walk.
export function monthCalendar(period, stickerDays, today = localDay()) {
  const walked = new Set(stickerDays)
  const blanks = (at(period.from).getDay() + 6) % 7
  const cells = Array.from({ length: blanks }, () => null)
  for (let date = period.from; date <= period.to; date = shift(date, 1)) {
    const d = at(date)
    cells.push({ date, day: d.getDate(), name: md(d), walked: walked.has(date), today: date === today })
  }
  while (cells.length % 7) cells.push(null)
  return { weekdays: ['월', '화', '수', '목', '금', '토', '일'], cells }
}

// "하늘이의 학습 대시보드": add 이 when the last Hangul syllable has a final consonant (받침).
// Non-Hangul endings (English, digits) keep the name as is; no name gives the plain title.
export function dashboardTitle(name) {
  const nickname = (name || '').trim()
  if (!nickname) return '학습 대시보드'
  const code = nickname.charCodeAt(nickname.length - 1)
  const batchim = code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 !== 0
  return `${nickname}${batchim ? '이' : ''}의 학습 대시보드`
}

export const percent = (ratio) => (ratio === null || ratio === undefined ? null : Math.round(ratio * 100))

// Width of a bar, 0~100. Empty data draws an empty track.
export const barWidth = (ratio) => Math.max(0, Math.min(100, percent(ratio) ?? 0))

// Anything recorded in the period. Without it the screen shows one line instead of the three parts.
export function hasRecords(report) {
  return Boolean(
    report.walks.completed || report.walks.reviews || report.stickerDays.length
    || report.story.conversations || report.emotion.some((stat) => stat.answers),
  )
}

// "이번 주 4번 산책했어요" as [before, number, after]; only the number is drawn large.
export function walkLine(period, report) {
  const before = period.kind === 'month' ? `${period.month}월에` : period.current ? '이번 주' : '이 주에'
  return [before, `${report.walks.completed}번`, '산책했어요']
}

// "2026-11" for the month being viewed (the monthly API's `to`).
export const monthKey = (period) => period.from.slice(0, 7)

// Two lines beside the small calendar: the viewed month and the month before, from the monthly API
// (walked days = sticker days, same as the calendar). Without it only the viewed month, from the report.
export function monthTotals(period, months, report) {
  const current = period.current ? '이번 달' : '이 달'
  if (!months?.length) return [[current, `${report.stickerDays.length}번`]]
  const last = months[months.length - 1]
  const before = months[months.length - 2]
  return [[current, `${last.walks}번`], ...(before ? [['지난달', `${before.walks}번`]] : [])]
}

// Points for the small line chart (SVG units). The viewed month is last (rightmost).
// Room is left above the points for the numbers and below for the month names.
export function monthChart(months, { width = 520, height = 62, side = 24, top = 18, bottom = 18 } = {}) {
  const max = Math.max(1, ...months.map((m) => m.walks))
  const step = months.length > 1 ? (width - 2 * side) / (months.length - 1) : 0
  const points = months.map((m, i) => ({
    x: Math.round(side + i * step),
    y: Math.round(top + (1 - m.walks / max) * (height - top - bottom)),
    value: m.walks,
    label: `${Number(m.month.slice(5))}월`,
    current: i === months.length - 1,
  }))
  return { width, height, points, line: points.map((pt) => `${pt.x},${pt.y}`).join(' ') }
}

// Name and percent for each feeling. percent is null when the feeling has no answers yet.
export function emotionRows(emotion) {
  return emotion.map((stat) => ({
    topicId: stat.topicId,
    label: stat.label,
    ratio: stat.answers ? stat.accuracy : null,
    percent: stat.answers ? percent(stat.accuracy) : null,
  }))
}

// The feeling(s) with the lowest accuracy among those with answers.
// null (line hidden) when nothing is recorded or every recorded feeling has the same accuracy.
export function practiceEmotion(emotion) {
  const rows = emotionRows(emotion).filter((row) => row.percent !== null)
  if (!rows.length) return null
  const low = Math.min(...rows.map((row) => row.percent))
  if (rows.every((row) => row.percent === low)) return null
  return rows.filter((row) => row.percent === low).map((row) => row.label).join(', ')
}

// "4번 이야기했어요 · 말로 답한 비율 0%" as parts; the two numbers are drawn large.
export function storyLine(story) {
  return { count: `${story.conversations}번`, voice: `${percent(story.voiceRatio) ?? 0}%` }
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// One mark per day of the period, oldest first, with its weekday and a readable name.
export function stickerDots(from, to, stickerDays) {
  const got = new Set(stickerDays)
  const end = new Date(to + 'T12:00:00')
  const days = []
  for (const d = new Date(from + 'T12:00:00'); d <= end; d.setDate(d.getDate() + 1)) {
    const date = localDay(d)
    days.push({ date, weekday: WEEKDAYS[d.getDay()], name: `${d.getMonth() + 1}월 ${d.getDate()}일`, got: got.has(date) })
  }
  return days
}
