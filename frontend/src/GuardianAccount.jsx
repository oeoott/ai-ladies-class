// Guardian account screens inside the existing guardian panel: sign-in, account, dashboard.
// One guardian account has one child; it is set automatically on sign-up and sign-in (App.jsx).
// They only appear when VITE_API_URL is set. Children never see them; the PIN gate comes first.
import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './PanelIcon.jsx'
import { api } from './api.js'
import {
  PERIODS, barWidth, emotionRows, hasRecords, monthCalendar, monthChart, monthKey, monthTotals, periodFor, practiceEmotion,
  stickerDots, storyLine, walkLine,
} from './dashboard.js'

const OFFLINE = '지금은 연결할 수 없어요. 잠시 뒤 다시 해 주세요.'
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function Field({ id, label, error, ...props }) {
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={Boolean(error)} {...props} />
    </>
  )
}

// --- 보호자 로그인 · 보호자 계정 만들기 ---
export function GuardianSignIn({ signup, initialEmail, onOpen, onSignedIn }) {
  const [email, setEmail] = useState(initialEmail || '')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const id = useId()
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const address = email.trim()
    if (!EMAIL.test(address)) return setError('이메일 주소를 확인해 주세요.')
    if (password.length < 8) return setError('비밀번호를 8자 이상 입력해 주세요.')
    setBusy(true)
    const result = await (signup ? api.signup(address, password) : api.login(address, password))
    if (!alive.current) return
    setBusy(false)
    if (result.data?.token) return onSignedIn({ token: result.data.token, email: result.data.guardian.email })
    if (signup && result.status === 409) return setError('이미 가입한 이메일이에요. 로그인해 주세요.')
    if (!signup && result.status === 401) return setError('이메일과 비밀번호를 확인해 주세요.')
    if (result.status === 422) return setError('이메일 주소와 비밀번호를 확인해 주세요.')
    setError(OFFLINE)
  }

  return (
    <>
      <p className="forest-panel-note">
        {signup ? '이 기기의 학습 기록을 계정에 보관해요.' : '로그인하면 학습 기록을 모아 대시보드로 볼 수 있어요.'}
      </p>
      <form className="forest-account-form" noValidate onSubmit={submit}>
        <Field id={id + '-email'} label="이메일 주소" error={error} type="email" inputMode="email" autoComplete="email"
          autoCapitalize="none" spellCheck="false" maxLength={254} value={email}
          onChange={(event) => { setEmail(event.target.value); setError('') }} />
        <Field id={id + '-password'} label={signup ? '비밀번호 (8자 이상)' : '비밀번호'} error={error} type="password"
          autoComplete={signup ? 'new-password' : 'current-password'} maxLength={128} value={password}
          onChange={(event) => { setPassword(event.target.value); setError('') }} />
        {error && <p className="forest-field-error" role="alert">{error}</p>}
        <button type="submit" className="forest-panel-primary" disabled={busy}>
          {busy ? '확인하고 있어요' : signup ? '가입하기' : '로그인'} <Icon name="next" size={18} />
        </button>
      </form>
      <button type="button" className="forest-panel-link" onClick={() => onOpen(signup ? 'login' : 'signupAccount')}>
        {signup ? '이미 계정이 있어요' : '계정 만들기'}
      </button>
    </>
  )
}

// --- 보호자 계정 (로그인 후): 이메일, 아이 별명, 로그아웃, 계정과 기록 삭제 ---
export function GuardianAccountInfo({ guardian, linkNote, onSignOut, onOpen }) {
  return (
    <>
      {linkNote && <p className="forest-panel-note" role="status">{linkNote}</p>}
      <p className="report-recipient">
        이메일 <strong>{guardian.email}</strong>
      </p>
      <p className="report-recipient">
        아이 별명 <strong>{guardian.profileName || '불러오고 있어요'}</strong>
      </p>
      <button type="button" className="forest-panel-secondary" onClick={onSignOut}>로그아웃</button>
      <button type="button" className="forest-panel-secondary" onClick={() => onOpen('deleteAccount')}>계정과 기록 삭제</button>
    </>
  )
}

// --- 계정과 기록 삭제: 비밀번호를 다시 받는 확인 단계 한 번 ---
// After it works the account is gone (App.jsx forgets it and makes a new device id); this panel shows the result.
export function GuardianDeleteAccount({ guardian, onOpen, onDeleted, onExpired }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const id = useId()
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    if (!password) return setError('비밀번호를 입력해 주세요.')
    setBusy(true)
    const result = await api.deleteAccount(guardian.token, password)
    if (!alive.current) return
    setBusy(false)
    if (result.data) {
      setDone(true)
      return onDeleted()
    }
    if (result.status === 401) return onExpired()
    if (result.status === 403) return setError('비밀번호를 확인해 주세요.')
    setError(OFFLINE)
  }

  if (done) {
    return (
      <>
        <p className="forest-panel-note" role="status">계정과 학습 기록을 지웠어요.</p>
        <button type="button" className="forest-panel-secondary" onClick={() => onOpen('guardian')}>설정으로 돌아가기</button>
      </>
    )
  }
  return (
    <>
      <p className="forest-panel-note">보호자 계정과 아이의 학습 기록을 모두 지워요. 지운 기록은 되돌릴 수 없어요.</p>
      <form className="forest-account-form" noValidate onSubmit={submit}>
        <Field id={id + '-password'} label="비밀번호" error={error} type="password" autoComplete="current-password"
          maxLength={128} value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} />
        {error && <p className="forest-field-error" role="alert">{error}</p>}
        <button type="submit" className="forest-panel-primary" disabled={busy}>
          {busy ? '지우고 있어요' : '삭제하기'}
        </button>
      </form>
      <button type="button" className="forest-panel-link" onClick={() => onOpen('guardianAccount')}>취소</button>
    </>
  )
}

// --- 학습 대시보드 ---
// One column, three questions: how much (walks + sticker dots), which feeling is hard, did they talk.
function Bar({ ratio }) {
  return (
    <span className="dashboard-bar" aria-hidden="true">
      <span style={{ width: barWidth(ratio) + '%' }} />
    </span>
  )
}

// Two-part period switch in the panel title row (next to close). Shaped unlike the number line:
// a pill with a check and border on the selected part, 48px tall for touch.
export function PeriodToggle({ kind, onChange }) {
  return (
    <div className="dashboard-toggle" role="group" aria-label="기간">
      {PERIODS.map((period) => (
        <button key={period.kind} type="button" aria-pressed={kind === period.kind} onClick={() => onChange(period.kind)}>
          {kind === period.kind && <span aria-hidden="true">✓</span>}
          {period.label}
        </button>
      ))}
    </div>
  )
}

// Panels.jsx renders this with key={kind}, so switching 주간/월간 starts again from this week/month.
export function GuardianDashboard({ guardian, onOpen, onExpired, onEnsureChild, kind = 'week' }) {
  const [offset, setOffset] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ loading: true, report: null })
  const ready = Boolean(guardian.token && guardian.profileId)
  const period = periodFor(kind, offset)
  useEffect(() => {
    if (!ready) return undefined
    let alive = true
    setState({ loading: true, report: null, months: null })
    const shown = periodFor(kind, offset)
    // 월간 also loads walks per month for the last six months; if that fails the totals use the report
    // and the chart is hidden.
    const monthly = kind === 'month'
      ? api.monthly(guardian.token, guardian.profileId, { to: monthKey(shown), months: 6 })
      : Promise.resolve(null)
    Promise.all([api.report(guardian.token, guardian.profileId, shown), monthly]).then(([result, perMonth]) => {
      if (!alive) return
      if (result.status === 401) return onExpired()
      setState({ loading: false, report: result.data, months: perMonth?.data?.months ?? null })
    })
    return () => { alive = false }
  }, [ready, guardian.token, guardian.profileId, kind, offset, attempt, onExpired])

  if (!guardian.token) {
    return (
      <>
        <p className="forest-panel-note">로그인하면 볼 수 있어요.</p>
        <button type="button" className="forest-panel-primary" onClick={() => onOpen('login')}>
          로그인하기 <Icon name="next" size={18} />
        </button>
      </>
    )
  }
  if (!guardian.profileId) {
    return (
      <>
        <p className="forest-panel-note">지금은 아이 정보를 불러올 수 없어요.</p>
        <button type="button" className="forest-panel-secondary" onClick={onEnsureChild}>다시 불러오기</button>
      </>
    )
  }

  const r = state.report
  return (
    <div className="dashboard">
      <div className="dashboard-nav">
        <button type="button" aria-label={kind === 'month' ? '이전 달' : '이전 주'} onClick={() => setOffset(offset - 1)}>
          <span className="dashboard-prev"><Icon name="next" size={20} /></span>
        </button>
        <span aria-live="polite">{period.name}</span>
        <button type="button" aria-label={kind === 'month' ? '다음 달' : '다음 주'} disabled={period.current}
          onClick={() => setOffset(offset + 1)}>
          <Icon name="next" size={20} />
        </button>
      </div>
      {state.loading && <p className="forest-panel-note" role="status">불러오고 있어요.</p>}
      {!state.loading && !r && (
        <>
          <p className="forest-panel-note" role="alert">지금은 기록을 불러올 수 없어요.</p>
          <button type="button" className="forest-panel-secondary" onClick={() => setAttempt(attempt + 1)}>다시 불러오기</button>
        </>
      )}
      {r && !hasRecords(r) && <p className="forest-panel-note">이 기간에는 기록이 없어요.</p>}
      {r && hasRecords(r) && <DashboardParts period={period} report={r} months={state.months} />}
    </div>
  )
}

function DashboardParts({ period, report: r, months }) {
  const [before, count, after] = walkLine(period, r)
  const practice = practiceEmotion(r.emotion)
  const story = storyLine(r.story)
  return (
    <>
      {period.kind === 'week' ? (
        <section className="dashboard-section" aria-label="얼마나 했나">
          <p className="dashboard-line">{before} <strong>{count}</strong> {after}</p>
          <StickerDots days={stickerDots(r.fromDay, r.toDay, r.stickerDays)} />
        </section>
      ) : (
        // 월간: this month and last month beside a small calendar, then walks per month for six months.
        <section className="dashboard-section" aria-label="얼마나 했나">
          <div className="dashboard-month">
            <dl className="dashboard-stats">
              {monthTotals(period, months, r).map(([name, value]) => (
                <div key={name}><dt>{name}</dt><dd>{value}</dd></div>
              ))}
            </dl>
            <MonthCalendar calendar={monthCalendar(period, r.stickerDays)} />
          </div>
          {months?.length > 1 && <MonthChart months={months} />}
        </section>
      )}
      <section className="dashboard-section" aria-labelledby="dash-emotion">
        <h3 id="dash-emotion">감정별 정답률</h3>
        <ul className="dashboard-rows">
          {emotionRows(r.emotion).map((row) => (
            <li key={row.topicId}>
              <span className="dashboard-label">{row.label}</span>
              {row.percent === null
                ? <span className="dashboard-empty">기록 없음</span>
                : <><Bar ratio={row.ratio} /><strong className="dashboard-value">{row.percent}%</strong></>}
            </li>
          ))}
        </ul>
        {practice && <p className="dashboard-detail">더 연습해 볼 감정: {practice}</p>}
      </section>
      <section className="dashboard-section" aria-labelledby="dash-story">
        <h3 id="dash-story">동화 대화</h3>
        <p className="dashboard-line">
          <strong>{story.count}</strong> 이야기했어요<span className="dashboard-dot" aria-hidden="true">·</span>말로 답한 비율 <strong>{story.voice}</strong>
        </p>
      </section>
    </>
  )
}

// 주간: seven fixed-size circles, centred as a group, each with its weekday below (green with a leaf on sticker days).
function StickerDots({ days }) {
  return (
    <ol className="dashboard-week" aria-label="스티커 받은 날">
      {days.map((day) => (
        <li key={day.date} aria-label={day.name + (day.got ? ' 스티커 받음' : '')}>
          <span className={day.got ? 'dashboard-circle got' : 'dashboard-circle'} aria-hidden="true">
            {day.got && <Icon name="leaf" size={20} />}
          </span>
          <span className="dashboard-weekday" aria-hidden="true">{day.weekday}</span>
        </li>
      ))}
    </ol>
  )
}

// 월간: the 주간 circles grown into a Monday-first calendar, weekdays once on top.
// Date number inside each circle: green with a white number on walked days, a faint number otherwise,
// a thin green ring on today. Days outside the month stay empty.
function MonthCalendar({ calendar }) {
  return (
    <ol className="dashboard-calendar" aria-label="산책한 날">
      {calendar.weekdays.map((day) => <li key={day} className="dashboard-weekday" aria-hidden="true">{day}</li>)}
      {calendar.cells.map((cell, i) => (cell === null
        ? <li key={'b' + i} aria-hidden="true" />
        : (
          <li key={cell.date} aria-label={cell.name + (cell.walked ? ' 산책함' : '') + (cell.today ? ' 오늘' : '')}>
            <span aria-hidden="true"
              className={['dashboard-circle', cell.walked ? 'got' : 'is-zero', cell.today && 'is-today'].filter(Boolean).join(' ')}>
              {cell.day}
            </span>
          </li>
        )))}
    </ol>
  )
}

// 월간: walks per month for six months as a small line chart, no library. The viewed month is the
// rightmost point and the only solid one; numbers above the points, month names below.
function MonthChart({ months }) {
  const chart = monthChart(months)
  return (
    <svg className="dashboard-chart" viewBox={`0 0 ${chart.width} ${chart.height}`} role="img"
      aria-label={'월별 산책 수: ' + chart.points.map((p) => `${p.label} ${p.value}번`).join(', ')}>
      <polyline points={chart.line} />
      {chart.points.map((p) => (
        <g key={p.label} className={p.current ? 'is-current' : undefined}>
          <circle cx={p.x} cy={p.y} r={p.current ? 5 : 4} />
          <text x={p.x} y={p.y - 8} textAnchor="middle">{p.value}</text>
          <text x={p.x} y={chart.height - 2} textAnchor="middle" className="dashboard-chart-month">{p.label}</text>
        </g>
      ))}
    </svg>
  )
}
