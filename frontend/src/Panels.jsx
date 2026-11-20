import React, { useId, useLayoutEffect, useRef, useState } from 'react'
import './panels.css'

const paths = {
  close: <path d="m6 6 12 12M18 6 6 18" />,
  prev: <path d="m14.5 5.5-6 6.5 6 6.5" />,
  next: <path d="m9.5 5.5 6 6.5-6 6.5" />,
  paw: (
    <>
      <path d="M6.3 15.6c1.3-1.7 2-4.3 5.7-4.3s4.4 2.6 5.7 4.3c1.8 2.4-.5 5.3-3.1 4.4-1.7-.6-3.5-.6-5.2 0-2.6.9-4.9-2-3.1-4.4Z" />
      <ellipse cx="4.7" cy="10.2" rx="1.7" ry="2.3" transform="rotate(-24 4.7 10.2)" />
      <ellipse cx="9.2" cy="6.5" rx="1.7" ry="2.3" />
      <ellipse cx="14.8" cy="6.5" rx="1.7" ry="2.3" />
      <ellipse cx="19.3" cy="10.2" rx="1.7" ry="2.3" transform="rotate(24 19.3 10.2)" />
    </>
  ),
  leaf: (
    <>
      <path d="M4 18C1.7 9.4 7 4 20 3c.1 11-3.8 17.6-12.2 15.5M3 21c2.4-4.8 6.5-8.7 11.5-12.2" />
    </>
  ),
  speaker: (
    <>
      <path d="M4 9h3.5L13 5v14l-5.5-4H4zM16.5 9a4.2 4.2 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  stamp: (
    <>
      <path d="M7 14h10l3 3v2H4v-2l3-3ZM9 14l.9-4a3.4 3.4 0 1 1 4.2 0l.9 4M5.5 21h13" />
    </>
  ),
  book: (
    <>
      <path d="M12 6c-2.2-2.1-6-2.4-9-1.2V18c3-1.2 6.8-.9 9 1.2 2.2-2.1 6-2.4 9-1.2V4.8c-3-1.2-6.8-.9-9 1.2Zm0 0v13" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
    </>
  ),
  check: <path d="m5 12 4.4 4.4L19 7" />,
}
function Icon({ name, size = 22 }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

function FriendPicker({ friend, friends, onFriend }) {
  const [id, setId] = useState(friend?.id)
  const index = Math.max(
    0,
    friends.findIndex((item) => item.id === id),
  )
  const current = friends[index]
  if (!current)
    return (
      <p className="forest-panel-note" role="status">
        친구 그림을 준비하고 있어요.
      </p>
    )
  const choose = (offset) => setId(friends[(index + offset + friends.length) % friends.length].id)
  return (
    <>
      <div className={'forest-friend-portrait variant-' + current.id}>
        {friends.length > 1 && (
          <button
            className="forest-panel-iconbtn prev"
            type="button"
            onClick={() => choose(-1)}
            aria-label="이전 친구"
          >
            <Icon name="prev" />
          </button>
        )}
        <div className="forest-friend-center" aria-live="polite" aria-atomic="true">
          <img key={current.id} src={current.image} alt="" />
          <span className="forest-friend-label">
            {current.species} <strong>{current.name}</strong>
          </span>
        </div>
        {friends.length > 1 && (
          <button
            className="forest-panel-iconbtn next"
            type="button"
            onClick={() => choose(1)}
            aria-label="다음 친구"
          >
            <Icon name="next" />
          </button>
        )}
      </div>
      <div
        className="forest-friend-count"
        aria-label={`전체 ${friends.length}명 중 ${index + 1}번째 친구`}
      >
        {friends.map((item, i) => (
          <i key={item.id} className={i === index ? 'chosen' : ''} />
        ))}
      </div>
      <button className="forest-panel-primary" type="button" onClick={() => onFriend(current.id)}>
        이 친구와 함께하기 <Icon name="next" size={18} />
      </button>
    </>
  )
}

function MenuRow({ icon, children, detail, onClick }) {
  return (
    <button type="button" className="forest-panel-row" onClick={onClick}>
      <span className="forest-panel-row-icon">
        <Icon name={icon} />
      </span>
      <span className="forest-panel-row-title">{children}</span>
      {detail && <span className="forest-panel-row-detail">{detail}</span>}
      <Icon name="next" size={16} />
    </button>
  )
}

function Guardian({ friend, settings, onSettings, onOpen, soundNotice }) {
  return (
    <div className="forest-panel-menu">
      <MenuRow icon="paw" detail={friend?.name} onClick={() => onOpen('friends')}>
        학습 친구 바꾸기
      </MenuRow>
      <MenuRow icon="book" onClick={() => onOpen('retest')}>
        준비 산책 다시 하기
      </MenuRow>
      <MenuRow icon="stamp" onClick={() => onOpen('records')}>
        스티커 기록
      </MenuRow>
      <button
        type="button"
        role="switch"
        aria-label="소리 안내"
        aria-checked={!!settings.sound}
        className="forest-panel-row"
        onClick={() => onSettings({ sound: !settings.sound })}
      >
        <span className="forest-panel-row-icon">
          <Icon name="speaker" />
        </span>
        <span className="forest-panel-row-title">소리 안내</span>
        <span className="forest-panel-row-detail">{settings.sound ? '켜짐' : '꺼짐'}</span>
        <span className={'forest-panel-switch' + (settings.sound ? ' on' : '')} aria-hidden="true">
          <i />
        </span>
      </button>
      {soundNotice && (
        <p className="forest-panel-note" role="status">
          {soundNotice}
        </p>
      )}
      <MenuRow icon="person" onClick={() => onOpen('account')}>
        이메일 계정 체험
      </MenuRow>
    </div>
  )
}

function Account({ mode, onOpen, onAccountDone }) {
  const [email, setEmail] = useState('forest@example.com')
  const [error, setError] = useState('')
  const input = useRef(null)
  const fieldId = useId()
  const isSignup = mode === 'signup'
  function submit(event) {
    event.preventDefault()
    if (!input.current.validity.valid) {
      setError('이메일 주소에 @와 도메인을 넣어 주세요.')
      input.current.focus()
      return
    }
    onAccountDone()
  }
  return (
    <>
      <p className="forest-panel-note">
        예시 이메일로 {isSignup ? '회원가입' : '로그인'} 화면을 체험해요. 입력한 주소는 저장하거나
        전송하지 않아요.
      </p>
      <form className="forest-account-form" noValidate onSubmit={submit}>
        <label htmlFor={fieldId}>보호자 이메일</label>
        <input
          id={fieldId}
          ref={input}
          type="email"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck="false"
          required
          value={email}
          aria-invalid={!!error}
          aria-describedby={error ? fieldId + '-error' : undefined}
          onChange={(event) => {
            setEmail(event.target.value)
            setError('')
          }}
        />
        {error && (
          <p className="forest-field-error" role="alert" id={fieldId + '-error'}>
            {error}
          </p>
        )}
        <button type="submit" className="forest-panel-primary">
          {isSignup ? '회원가입 체험하기' : '로그인 체험하기'} <Icon name="next" size={18} />
        </button>
      </form>
      <div className="forest-panel-actions">
        <button type="button" className="forest-panel-secondary" onClick={onAccountDone}>
          계정 없이 체험하기
        </button>
        <button
          type="button"
          className="forest-panel-link"
          onClick={() => onOpen(isSignup ? 'account' : 'signup')}
        >
          {isSignup ? '로그인 화면으로' : '회원가입 화면으로'}
        </button>
      </div>
    </>
  )
}

function dateLabel(value) {
  const date = new Date(String(value) + 'T12:00:00')
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

function RecordBook({ records, onOpen }) {
  const ordered = [...records].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return (
    <>
      <p className="forest-panel-note">이 기기에서 마친 마음 산책을 모았어요.</p>
      {ordered.length ? (
        <ul className="forest-stamp-list">
          {ordered.map((record, index) => (
            <li key={record.date + '-' + index}>
              <span className="forest-stamp-icon">
                <Icon name="leaf" size={20} />
              </span>
              <span>{record.topic} 스티커</span>
              <time dateTime={record.date}>{dateLabel(record.date)}</time>
            </li>
          ))}
        </ul>
      ) : (
        <div className="forest-stamp-empty">
          <span className="forest-stamp-icon">
            <Icon name="stamp" size={26} />
          </span>
          <p>첫 산책을 마치면 스티커가 생겨요.</p>
        </div>
      )}
      <button className="forest-panel-secondary" type="button" onClick={() => onOpen('guardian')}>
        설정으로 돌아가기
      </button>
    </>
  )
}

const titles = {
  guardian: '보호자 설정',
  friends: '함께할 친구를 골라요',
  account: '보호자 로그인 체험',
  signup: '보호자 회원가입 체험',
  records: '스티커 기록',
  rest: '잠깐 쉬어 가요',
  retest: '준비 산책을 다시 할까요?',
}

export function Panel(props) {
  if (!titles[props.mode]) return null
  return <PanelDialog {...props} />
}

function PanelDialog({
  mode,
  onClose,
  friend,
  friends = [],
  onFriend,
  settings = {},
  onSettings,
  onRetest,
  records = [],
  soundNotice,
  onOpen,
  onAccountDone = onClose,
  returnFocusRef,
}) {
  const dialog = useRef(null)
  const heading = useRef(null)
  const titleId = useId()
  useLayoutEffect(() => {
    const element = dialog.current
    const trigger = document.activeElement
    const oldOverflow = document.body.style.overflow
    if (!element.open) element.showModal()
    document.body.style.overflow = 'hidden'
    return () => {
      element.close()
      document.body.style.overflow = oldOverflow
      const target = returnFocusRef?.current || trigger
      if (target?.isConnected && typeof target.focus === 'function')
        target.focus({ preventScroll: true })
    }
  }, [returnFocusRef])
  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true })
    dialog.current.scrollTop = 0
  }, [mode])

  function wrapFocus(event) {
    if (event.key !== 'Tab') return
    const controls = Array.from(
      dialog.current.querySelectorAll('button:enabled, input:enabled, a[href], [tabindex="0"]'),
    ).filter((control) => control.getClientRects().length > 0)
    if (!controls.length) return
    // Safari's default Tab order can skip buttons, including the first one after the heading.
    const current = controls.indexOf(document.activeElement)
    const next = event.shiftKey
      ? current <= 0
        ? controls.length - 1
        : current - 1
      : (current + 1) % controls.length
    event.preventDefault()
    controls[next].focus()
  }
  return (
    <dialog
      ref={dialog}
      className={'forest-panel is-' + mode}
      aria-labelledby={titleId}
      onKeyDown={wrapFocus}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="forest-panel-head">
        <h2 ref={heading} id={titleId} tabIndex="-1">
          {titles[mode]}
        </h2>
        {mode !== 'rest' && (
          <button
            className="forest-panel-iconbtn"
            type="button"
            onClick={onClose}
            aria-label="닫기"
          >
            <Icon name="close" />
          </button>
        )}
      </div>
      {mode === 'friends' && <FriendPicker friend={friend} friends={friends} onFriend={onFriend} />}
      {mode === 'guardian' && (
        <Guardian {...{ friend, settings, onSettings, onOpen, soundNotice }} />
      )}
      {(mode === 'account' || mode === 'signup') && (
        <Account key={mode} {...{ mode, onOpen, onAccountDone }} />
      )}
      {mode === 'records' && <RecordBook records={records} onOpen={onOpen} />}
      {mode === 'retest' && (
        <>
          <p className="forest-panel-note">
            그림을 보고 감정 단어를 골라요. 놀이가 끝나면 다음 학습의 단어 난이도가 달라질 수
            있어요.
          </p>
          <button className="forest-panel-primary" type="button" onClick={onRetest}>
            준비 산책 하기 <Icon name="next" size={18} />
          </button>
          <button className="forest-panel-link" type="button" onClick={() => onOpen('guardian')}>
            설정으로 돌아가기
          </button>
        </>
      )}
      {mode === 'rest' && (
        <>
          <div className="forest-rest-symbol" aria-hidden="true">
            <Icon name="leaf" size={40} />
          </div>
          <p className="forest-panel-note">준비되면 하던 곳에서 이어 가요.</p>
          <button className="forest-panel-primary" type="button" onClick={onClose}>
            이어서 하기 <Icon name="next" size={18} />
          </button>
        </>
      )}
    </dialog>
  )
}

export default Panel
