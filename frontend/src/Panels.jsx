import { useNarration } from './narration.js'
import { GuidePortrait } from './PaintedFriend.jsx'
import { FriendLook } from './FriendLook.jsx'
import { GuardianGate } from './GuardianGate.jsx'
import React, { useId, useLayoutEffect, useRef, useState } from 'react'
import { FriendStudio } from './FriendStudio.jsx'
import { Icon, MenuRow } from './PanelIcon.jsx'
import { GuardianAccountInfo, GuardianDashboard, GuardianDeleteAccount, GuardianSignIn, PeriodToggle } from './GuardianAccount.jsx'
import { dashboardTitle } from './dashboard.js'
import './panels.css'

function Guardian({ onOpen, cardPortrait, guardian, accountEnabled }) {
  return (
    <div className="forest-panel-menu">
      <MenuRow icon="paw" onClick={() => onOpen('friends')}>
        숲 친구
      </MenuRow>
      <MenuRow icon="book" onClick={() => onOpen('retest')}>
        학습 진단 다시 하기
      </MenuRow>
      <MenuRow icon="stamp" onClick={() => onOpen('records')}>
        스티커판
      </MenuRow>
      <MenuRow icon="person" onClick={() => onOpen('report')}>
        학습 리포트
      </MenuRow>
      <MenuRow icon="person" detail={cardPortrait === 'girl' ? '여자아이' : '남자아이'} onClick={() => onOpen('portrait')}>
        표정 카드
      </MenuRow>
      {accountEnabled && (
        <>
          <MenuRow icon="person" detail={guardian.token ? guardian.email : '로그인 안 함'}
            onClick={() => onOpen(guardian.token ? 'guardianAccount' : 'login')}>
            보호자 계정
          </MenuRow>
          <MenuRow icon="chart" detail={guardian.token && guardian.profileName ? guardian.profileName : undefined}
            onClick={() => onOpen('dashboard')}>
            학습 대시보드
          </MenuRow>
        </>
      )}
    </div>
  )
}

function Account({ initialEmail, signup, onAccountDone, onDraft }) {
  const [email, setEmail] = useState(initialEmail)
  const [error, setError] = useState('')
  const input = useRef(null)
  const fieldId = useId()

  function submit(event) {
    event.preventDefault()
    if (!input.current.validity.valid) {
      setError('이메일 주소를 확인해 주세요.')
      input.current.focus()
      return
    }
    onAccountDone(input.current.value.trim())
  }

  return (
    <>
      <p className="forest-panel-note" id={fieldId + '-purpose'}>
        {signup ? '이메일로 매일 학습 리포트를 보내드릴게요' : '학습 리포트를 받을 이메일을 입력해 주세요.'}
      </p>
      <form className="forest-account-form" noValidate onSubmit={submit}>
        <input
          id={fieldId}
          ref={input}
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck="false"
          aria-label="보호자 이메일"
          placeholder="이메일 주소"
          required
          maxLength={254}
          value={email}
          aria-invalid={!!error}
          aria-describedby={error ? fieldId + '-purpose ' + fieldId + '-error' : fieldId + '-purpose'}
          onChange={(event) => {
            setEmail(event.target.value)
            onDraft?.(event.target.value)
            setError('')
          }}
        />
        {error && (
          <p className="forest-field-error" role="alert" id={fieldId + '-error'}>
            {error}
          </p>
        )}
        <button type="submit" className="forest-panel-primary">
          {signup ? '다음' : '저장'} <Icon name="next" size={18} />
        </button>
      </form>

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

function RecordBook({ records, onOpen, onReview }) {
  const ordered = [...records].sort((a, b) => String(b.date).localeCompare(String(a.date)))
  return (
    <>
      <p className="forest-panel-note">스티커를 눌러 다시 해 봐요.</p>
      {ordered.length ? (
        <ul className="forest-stamp-list">
          {ordered.map((record, index) => (
            <li key={record.date + '-' + index}>
              <span className="forest-stamp-icon">
                <Icon name="leaf" size={20} />
              </span>
              <button type="button" className="forest-panel-link" aria-label={record.topic + ' 다시 하기 · ' + dateLabel(record.date)} onClick={() => onReview(record)}>{record.topic} 스티커</button>
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
  gate: '보호자 비밀번호',
  friends: '나의 숲 친구 만들기',
  chooseFriend: '어떤 친구와 함께할까요?',
  friendHello: '숲 친구의 인사',
  portrait: '어떤 얼굴로 연습할까요?',
  account: '리포트 받을 주소',
  together: '부모님과 함께 있나요?',
  bringParent: '부모님을 불러 주세요',
  signup: '부모님 이메일',
  report: '학습 리포트',
  records: '스티커판',
  rest: '잠깐 쉬어 가요',
  retest: '학습 진단을 다시 할까요?',
  login: '보호자 로그인',
  signupAccount: '보호자 계정 만들기',
  guardianAccount: '보호자 계정',
  dashboard: '학습 대시보드',
  deleteAccount: '계정과 기록 삭제',
}

export function Panel(props) {
  if (!titles[props.mode]) return null
  return <PanelDialog {...props} />
}

function PanelDialog({
  mode,
  onClose,
  cardPortrait,
  onCardPortrait,
  friend,
  friends = [],
  onFriend,
  onChooseFirstFriend,
  onStartPlacement,
  onRetest,
  onUnlock,
  onReview,
  records = [],
  onOpen,
  onAccountDone,
  signupEmail,
  onSignupDraft,
  recipient,
  returnFocusRef,
  guardian = {},
  accountEnabled = false,
  linkNote,
  onSignedIn,
  onEnsureChild,
  onSignOut,
  onExpired,
  onDeleted,
}) {
  const [dashboardKind, setDashboardKind] = useState('week')
  const greeting = '안녕! 나는 ' + (friend.familiar || friend.name) + '야. 나랑 같이 놀자!'
  const title = mode === 'friendHello' ? greeting
    : mode === 'dashboard' ? dashboardTitle(guardian.token ? guardian.profileName : '')
    : titles[mode]
  useNarration(mode === 'together' ? '반가워요! 지금 부모님과 함께 있나요?'
    : mode === 'bringParent' ? '괜찮아요. 부모님을 부르고, 함께 시작해요.'
    : mode === 'chooseFriend' || mode === 'portrait' ? titles[mode]
    : mode === 'friendHello' ? greeting : '')
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
      dialog.current.querySelectorAll('button:enabled, input:enabled, select:enabled, a[href], [tabindex="0"]'),
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
          {title}
        </h2>
        {mode === 'dashboard' && guardian.token && guardian.profileId && (
          <PeriodToggle kind={dashboardKind} onChange={setDashboardKind} />
        )}
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
      {mode === 'portrait' && (
        <div className="forest-portrait-choices">
          {['boy', 'girl'].map((portrait) => (
            <button type="button" className="forest-panel-secondary" key={portrait}
              onClick={() => onCardPortrait(portrait)}>
              <img src={import.meta.env.BASE_URL + 'art/cards/' + (portrait === 'girl' ? 'girl-' : '') + 'joy.webp'} alt="" />
              <span>{portrait === 'girl' ? '여자아이' : '남자아이'}</span>
            </button>
          ))}
        </div>
      )}
      {mode === 'chooseFriend' && (
        <div className="forest-friend-choices">
          {friends.map((animal) => (
            <button type="button" className="forest-panel-secondary" key={animal.id}
              aria-label={animal.species + ' ' + animal.name}
              onClick={() => onChooseFirstFriend(animal.id)}
            >
              <FriendLook friend={animal} alt="" />
              <span>{animal.name}</span>
            </button>
          ))}
        </div>
      )}
      {mode === 'friendHello' && (
        <>
          <GuidePortrait friend={friend} className="forest-greeting-friend" />
          <button type="button" className="forest-panel-primary" onClick={onStartPlacement}>
            함께 시작하기 <Icon name="next" size={18} />
          </button>
          <button type="button" className="forest-panel-link" onClick={() => onOpen('chooseFriend')}>
            다른 친구 고르기
          </button>
        </>
      )}
      {mode === 'friends' && <FriendStudio friend={friend} friends={friends} onFriend={onFriend} />}
      {(mode === 'together' || mode === 'bringParent') && (
        <GuidePortrait friend={friend} className="parent-prompt-guide" />
      )}
      {mode === 'together' && (
        <div className="forest-panel-menu">
          <button type="button" className="forest-panel-primary" onClick={() => onOpen('signup')}>함께 있어요</button>
          <button type="button" className="forest-panel-secondary" onClick={() => onOpen('bringParent')}>혼자 있어요</button>
        </div>
      )}
      {mode === 'bringParent' && (
        <button type="button" className="forest-panel-primary" onClick={() => onOpen('signup')}>부모님이 오셨어요</button>
      )}
      {mode === 'gate' && <GuardianGate onUnlock={onUnlock} />}
      {mode === 'guardian' && <Guardian {...{ onOpen, cardPortrait, guardian, accountEnabled }} />}
      {(mode === 'login' || mode === 'signupAccount') && (
        <GuardianSignIn key={mode} signup={mode === 'signupAccount'} onOpen={onOpen} onSignedIn={onSignedIn}
          initialEmail={guardian.email || recipient || signupEmail} />
      )}
      {mode === 'guardianAccount' && <GuardianAccountInfo {...{ guardian, linkNote, onSignOut, onOpen }} />}
      {mode === 'deleteAccount' && <GuardianDeleteAccount {...{ guardian, onOpen, onDeleted, onExpired }} />}
      {mode === 'dashboard' && <GuardianDashboard key={dashboardKind} {...{ guardian, onOpen, onExpired, onEnsureChild }} kind={dashboardKind} />}
      {(mode === 'account' || mode === 'signup') && (
        <Account
          key={mode}
          initialEmail={mode === 'signup' ? signupEmail : recipient}
          onDraft={mode === 'signup' ? onSignupDraft : undefined}
          signup={mode === 'signup'}
          onAccountDone={onAccountDone}
        />
      )}
      {mode === 'report' && <LearningReport {...{ records, recipient, onOpen }} />}
      {mode === 'records' && <RecordBook records={records} onOpen={onOpen} onReview={onReview} />}
      {mode === 'retest' && (
        <>
          <p className="forest-panel-note">
            그림을 보고 감정 단어를 골라요. 놀이가 끝나면 다음 학습의 단어 난이도가 달라질 수
            있어요.
          </p>
          <button className="forest-panel-primary" type="button" onClick={onRetest}>
            학습 진단 시작 <Icon name="next" size={18} />
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
          <button className="forest-panel-primary" type="button" onClick={onClose}>
            이어서 하기 <Icon name="next" size={18} />
          </button>
        </>
      )}
    </dialog>
  )
}

export default Panel
