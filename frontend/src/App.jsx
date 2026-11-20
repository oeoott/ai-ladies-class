import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Pause, PawPrint, ShieldCheck, Sparkles, Sprout } from 'lucide-react'
import { ForestEntrance } from './ForestEntrance.jsx'
import { FriendLook } from './FriendLook.jsx'
import { JourneyProgress } from './JourneyProgress.jsx'
import { LevelTest, Lesson } from './Activities.jsx'
import { Panel } from './Panels.jsx'
import {
  STORAGE_KEY,
  beginWalk,
  emptySession,
  finishWalk,
  forToday,
  readSession,
  topics,
  withRecordedStickers,
} from './session.js'

const asset = (file) => import.meta.env.BASE_URL + file
const recipientKey = 'maeum-forest.report-recipient.v1'
const friends = [
  { id: 'lion', name: '라온', familiar: '라온이', species: '사자' },
  { id: 'rabbit', name: '보리', familiar: '보리', species: '토끼' },
  { id: 'bear', name: '두리', familiar: '두리', species: '곰' },
].map((friend) => ({
  ...friend,
  image: asset('art/' + friend.id + '.webp'),
  walkImage: asset('art/' + friend.id + '-walk.webp'),
}))

function startSession() {
  try {
    const saved = readSession(localStorage.getItem(STORAGE_KEY))
    if (saved.page === 'praise' || saved.page === 'stickers') {
      return forToday({ ...saved, page: 'welcome' })
    }
    return saved
  } catch {
    return emptySession()
  }
}

function SceneTools({ onGuard, onRest, learning }) {
  return (
    <div className="scene-tools">
      {learning && (
        <button type="button" className="scene-tool" onClick={onRest} aria-haspopup="dialog">
          <Pause aria-hidden="true" />
          쉬어 가기
        </button>
      )}
      <button
        type="button"
        className="scene-tool guardian-button"
        onClick={onGuard}
        aria-label="보호자"
        title="보호자 설정"
        aria-haspopup="dialog"
      >
        <ShieldCheck aria-hidden="true" />
      </button>
    </div>
  )
}

function Stamp({ label, filled }) {
  return (
    <span
      className={'stamp' + (filled ? ' filled' : '')}
      aria-label={filled ? label + ' 스티커' : '빈 스티커 자리'}
    >
      {filled ? (
        <>
          <Sprout aria-hidden="true" />
          <span>{label}</span>
        </>
      ) : (
        <PawPrint aria-hidden="true" />
      )}
    </span>
  )
}

function Reward({ page, friend, topic, records, onBook, onFinish }) {
  const title = useRef(null)
  useEffect(() => {
    title.current?.focus({ preventScroll: true })
  }, [page])
  const isBook = page === 'stickers'
  const pageStart = Math.max(0, Math.floor((records.length - 1) / 5) * 5)
  const group = records.slice(pageStart, pageStart + 5)
  return (
    <section className={isBook ? 'sticker-book' : 'praise-clearing'}>
      {isBook ? (
        <>
          <h1 ref={title} tabIndex="-1">
            마음숲 스티커판
          </h1>
          <p>하루의 첫 산책을 마치면 마음 스티커를 하나 받아요.</p>
          <div className="stamp-board">
            {Array.from({ length: 5 }, (_, i) => (
              <Stamp key={i} label={group[i]?.topic} filled={Boolean(group[i])} />
            ))}
          </div>
          <span className="stamp-count">지금까지 모은 스티커 {records.length}개</span>
          <button type="button" className="primary" onClick={onFinish}>
            산책 마치기
            <Check aria-hidden="true" />
          </button>
        </>
      ) : (
        <>
          <div className="praise-note">
            <h1 ref={title} tabIndex="-1">
              끝까지 함께 걸었어요!
            </h1>
            <p>
              {friend.familiar}와 {topic.phrase}을 알아보고 이야기를 나눴어요.
            </p>
          </div>
          <FriendLook className="reward-friend" friend={friend} alt="" />
          <button type="button" className="primary" onClick={onBook}>
            스티커판 보기
            <Sparkles aria-hidden="true" />
          </button>
        </>
      )}
    </section>
  )
}

function App() {
  const [session, setSession] = useState(startSession)
  const [hasEntered, setHasEntered] = useState(false)
  const [panel, setPanel] = useState(null)
  const [storageUnavailable, setStorageUnavailable] = useState(false)
  const [recipient, setRecipient] = useState(() => {
    try {
      return sessionStorage.getItem(recipientKey) || ''
    } catch {
      return ''
    }
  })
  const entry = useRef('welcome')
  const { page } = session
  const baseFriend = friends.find((f) => f.id === session.friendId) || friends[0]
  const name = session.friendNickname || baseFriend.name
  const last = name.charCodeAt(name.length - 1) - 0xac00
  const familiar = last >= 0 && last < 11172 && last % 28 !== 0 ? name + '이' : name
  const friend = {
    ...baseFriend,
    name,
    familiar,
    charm: session.friendCharm,
    headwear: session.friendHeadwear,
    nickname: session.friendNickname,
  }
  const topic = topics.find((t) => t.id === session.topicId) || topics[0]
  const showEntrance = !hasEntered || page === 'welcome'
  const learning = !showEntrance && (page === 'lesson' || page === 'placement')
  const inTale = page === 'lesson' && session.step === 2
  const landscape = inTale ? 'art/tale-' + topic.id + '.webp' : 'art/forest-gate.webp'
  const finished = session.records.some((r) => r.date === session.day)
  const patch = useCallback((values) => setSession((current) => ({ ...current, ...values })), [])
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const merged = stored ? withRecordedStickers(session, readSession(stored).records) : session
      if (merged !== session) {
        setSession(merged)
        return
      }
      const serialized = JSON.stringify(session)
      if (stored !== serialized) localStorage.setItem(STORAGE_KEY, serialized)
    } catch {
      setStorageUnavailable(true)
    }
  }, [session])

  useEffect(() => {
    const refreshDay = () => setSession((current) => forToday(current))
    const onVisible = () => {
      if (!document.hidden) refreshDay()
    }
    document.addEventListener('visibilitychange', onVisible)
    const timer = window.setInterval(refreshDay, 60000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(timer)
    }
  }, [])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page, session.step, showEntrance])

  function retest() {
    const returnPage = page === 'placement' ? session.retestReturn : session.onboarded ? page : null
    patch({ page: 'placement', placement: null, retestReturn: returnPage })
    setPanel(null)
  }
  function open(mode, origin) {
    entry.current = origin
    setPanel(mode)
  }
  function enterForest() {
    setHasEntered(true)
    const next = beginWalk(session)
    setSession(next)
    if (next.page === 'welcome') open(recipient ? 'friends' : 'signup', 'onboarding')
  }
  function completeAccount(email) {
    setRecipient(email)
    try {
      if (email) sessionStorage.setItem(recipientKey, email)
      else sessionStorage.removeItem(recipientKey)
    } catch {
      // The address still works for the current visit when tab storage is unavailable.
    }
    setPanel(entry.current === 'onboarding' ? 'friends' : 'report')
  }
  function chooseFriend(id, { charm, headwear, nickname }) {
    const appearance = {
      friendId: id,
      friendCharm: charm,
      friendHeadwear: headwear,
      friendNickname: nickname,
    }
    patch(
      entry.current === 'onboarding'
        ? { ...appearance, page: 'placement', placement: null }
        : appearance,
    )
    setPanel(entry.current === 'guardian' ? 'guardian' : null)
  }
  function afterTest(level) {
    patch({
      onboarded: true,
      level,
      page: session.retestReturn || 'lesson',
      placement: null,
      retestReturn: null,
    })
  }
  function closePanel() {
    if (entry.current === 'guardian' && panel !== 'guardian') {
      setPanel('guardian')
      return
    }
    setPanel(null)
  }

  return (
    <>
      {!showEntrance && (
        <a href="#main-content" className="skip-link">
          본문으로 가기
        </a>
      )}
      {storageUnavailable && (
        <p className="notice" role="status">
          이 브라우저에는 기록을 저장할 수 없어요. 지금 열린 화면에서 산책을 계속할 수 있어요.
        </p>
      )}
      {showEntrance && (
        <ForestEntrance
          friend={friend}
          finished={page === 'welcome' && finished}
          resuming={page === 'lesson' || page === 'placement'}
          hidden={Boolean(panel)}
          onEnter={enterForest}
        />
      )}
      {!showEntrance && (
        <main
          id="main-content"
          className={'immersive-scene' + (page === 'lesson' ? ' has-route' : '')}
          tabIndex="-1"
        >
          <img
            className={'scene-landscape' + (inTale ? ' tale-landscape' : '')}
            src={asset(landscape)}
            alt=""
          />
          {page === 'lesson' && <JourneyProgress friend={friend} step={session.step} />}
          <div className="scene-content">
            {page === 'placement' && (
              <LevelTest
                progress={session}
                onUpdate={patch}
                onDone={afterTest}
                friend={friend}
                active={!panel}
              />
            )}
            {page === 'lesson' && (
              <Lesson
                progress={session}
                onUpdate={patch}
                onComplete={() => setSession(finishWalk)}
                friend={friend}
                topic={topic}
                active={!panel}
              />
            )}
            {(page === 'praise' || page === 'stickers') && (
              <Reward
                page={page}
                friend={friend}
                topic={topic}
                records={session.records}
                onBook={() => patch({ page: 'stickers' })}
                onFinish={() => setSession((current) => forToday({ ...current, page: 'welcome' }))}
              />
            )}
          </div>
          <div className="scene-footer">
            <SceneTools
              learning={learning}
              onGuard={() => open('guardian', 'guardian')}
              onRest={() => open('rest', 'rest')}
            />
          </div>
        </main>
      )}
      <Panel
        mode={panel}
        onClose={closePanel}
        friend={friend}
        friends={friends}
        onFriend={chooseFriend}
        records={session.records}
        onOpen={setPanel}
        recipient={recipient}
        onAccountDone={completeAccount}
        onRetest={retest}
      />
    </>
  )
}
export default App
