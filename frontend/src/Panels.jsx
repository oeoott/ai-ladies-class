import React, { useId, useLayoutEffect, useRef, useState } from 'react'
import { FriendStudio } from './FriendStudio.jsx'
import './panels.css'

const paths = {
  close: <path d="m6 6 12 12M18 6 6 18" />,
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

function Guardian({ friend, onOpen }) {
  return (
    <div className="forest-panel-menu">
      <MenuRow icon="paw" detail={friend?.name} onClick={() => onOpen('friends')}>
        숲 친구 꾸미기
      </MenuRow>
      <MenuRow icon="book" onClick={() => onOpen('retest')}>
        준비 산책 다시 하기
      </MenuRow>
      <MenuRow icon="stamp" onClick={() => onOpen('records')}>
        스티커 기록
      </MenuRow>
      <MenuRow icon="person" onClick={() => onOpen('report')}>
        학습 리포트
      </MenuRow>
    </div>
  )
}

function Account({ initialEmail, signup, onAccountDone }) {
  const [email, setEmail] = useState(initialEmail)
  const [error, setError] = useState('')
  const input = useRef(null)
  const fieldId = useId()

  function submit(event) {
    event.preventDefault()
    if (!input.current.validity.valid) {
      setError('이메일 주소를 확인해 주세요. 예: hello@example.com')
      input.current.focus()
      return
    }
    onAccountDone(input.current.value.trim())
  }

  return (
    <>
      <p className="forest-panel-note" id={fieldId + '-purpose'}>
        아이가 어떤 감정을 배우고 산책을 마쳤는지 리포트로 받아 보세요.
      </p>
      <form className="forest-account-form" noValidate onSubmit={submit}>
        <label htmlFor={fieldId}>리포트를 받을 보호자 이메일</label>
        <input
          id={fieldId}
          ref={input}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck="false"
          placeholder="hello@example.com"
          required
          maxLength={254}
          value={email}
          aria-invalid={!!error}
          aria-describedby={[
            fieldId + '-purpose',
            fieldId + '-delivery',
            error && fieldId + '-error',
          ]
            .filter(Boolean)
            .join(' ')}
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
        <p className="report-delivery" id={fieldId + '-delivery'}>
          이 체험판에서는 보호자 설정에서 메일 앱을 열어 보내요. 주소는 이 탭을 닫을 때까지
          보관해요.
        </p>
        <button type="submit" className="forest-panel-primary">
          {signup ? '이 이메일로 시작하기' : '받을 주소 저장하기'} <Icon name="next" size={18} />
        </button>
      </form>
      {signup && (
        <button type="button" className="forest-panel-link" onClick={() => onAccountDone('')}>
          계정 없이 체험하기
        </button>
      )}
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

function LearningReport({ records, recipient, onOpen }) {
  const recent = [...records].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
  const title = '마음숲 학습 리포트'
  const rows = recent.map((record) => dateLabel(record.date) + ' · ' + record.topic + ' 산책 완료')
  const body = [
    title,
    '',
    '최근 마친 산책',
    ...rows,
    '',
    '각 산책에서 감정을 알아보고 표정과 몸짓을 연습한 뒤, 동화 속에서 행동을 골라 보았어요.',
  ].join('\n')
  const mail =
    'mailto:' +
    encodeURIComponent(recipient).replace('%40', '@') +
    '?subject=' +
    encodeURIComponent(title) +
    '&body=' +
    encodeURIComponent(body)
  return (
    <>
      {recent.length ? (
        <>
          <p className="forest-panel-note">최근 마친 산책 {recent.length}회의 기록이에요.</p>
          <ul className="report-walks">
            {rows.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
        </>
      ) : (
        <p className="forest-panel-note">첫 산책을 마치면 이곳에서 학습 리포트를 보낼 수 있어요.</p>
      )}
      {recipient && (
        <p className="report-recipient">
          받을 주소 <strong>{recipient}</strong>
        </p>
      )}
      {recipient && recent.length > 0 && (
        <a className="forest-panel-primary report-mail" href={mail}>
          메일 앱에서 리포트 열기
        </a>
      )}
      <button type="button" className="forest-panel-secondary" onClick={() => onOpen('account')}>
        {recipient ? '받을 주소 바꾸기' : '받을 이메일 입력하기'}
      </button>
    </>
  )
}

const titles = {
  guardian: '보호자 설정',
  friends: '나의 숲 친구 만들기',
  account: '리포트 받을 주소',
  signup: '보호자 가입',
  report: '학습 리포트',
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
  onRetest,
  records = [],
  onOpen,
  onAccountDone,
  recipient,
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
      {mode === 'friends' && <FriendStudio friend={friend} friends={friends} onFriend={onFriend} />}
      {mode === 'guardian' && <Guardian friend={friend} onOpen={onOpen} />}
      {(mode === 'account' || mode === 'signup') && (
        <Account
          key={mode}
          initialEmail={recipient}
          signup={mode === 'signup'}
          onAccountDone={onAccountDone}
        />
      )}
      {mode === 'report' && <LearningReport {...{ records, recipient, onOpen }} />}
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
