import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  Pause,
  PawPrint,
  ShieldCheck,
  Sparkles,
  Sprout,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { ForestEntrance } from './ForestEntrance.jsx'
import { JourneyProgress } from './JourneyProgress.jsx'
import { LevelTest, Lesson } from './Activities.jsx'
import { Panel } from './Panels.jsx'
import {
  STORAGE_KEY,
  emptySession,
  finishWalk,
  forToday,
  localDay,
  readSession,
  topics,
  withRecordedStickers,
} from './session.js'

const asset = (file) => import.meta.env.BASE_URL + file
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
    return readSession(localStorage.getItem(STORAGE_KEY))
  } catch {
    return emptySession()
  }
}

function AppHeader({ sound, onSound, onGuard, onRest, learning }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <span className="wordmark" aria-label="마음숲">
          <img src={asset('sprout.svg')} width="45" height="45" alt="" />
          마음숲
        </span>
        <div className="header-controls">
          {learning && (
            <button type="button" className="nav-button" onClick={onRest}>
              <Pause />
              <span>쉬어 가기</span>
            </button>
          )}
          <button
            type="button"
            className="nav-button sound-control"
            onClick={onSound}
            aria-pressed={sound}
            aria-label={'소리 안내 ' + (sound ? '끄기' : '켜기')}
          >
            {sound ? <Volume2 /> : <VolumeX />}
            <span>소리 {sound ? '켬' : '끔'}</span>
          </button>
          <span className="nav-divider" aria-hidden="true" />
          <button type="button" className="nav-button guardian-button" onClick={onGuard}>
            <ShieldCheck />
            <span>보호자</span>
          </button>
        </div>
      </div>
    </header>
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
    <main className="page-wrap reward-wrap" id="main-content">
      <section className={'reward-card' + (isBook ? ' is-book' : '')}>
        <div className="reward-badge">
          {isBook ? <PawPrint /> : <Check />}
          {isBook ? '나의 스티커판' : '세 걸음 완료'}
        </div>
        {isBook ? (
          <>
            <h1 ref={title} tabIndex="-1">
              마음숲 스티커판
            </h1>
            <p>산책을 마칠 때마다 마음 스티커를 모아요.</p>
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
            <img className="reward-friend" src={friend.image} alt="" />
            <h1 ref={title} tabIndex="-1">
              끝까지 함께 걸었어요!
            </h1>
            <p>
              {friend.familiar}와 {topic.phrase}을 알아보고 이야기를 나눴어요.
            </p>
            <button type="button" className="primary" onClick={onBook}>
              내 스티커 붙이기
              <Sparkles aria-hidden="true" />
            </button>
          </>
        )}
      </section>
    </main>
  )
}

function App() {
  const [session, setSession] = useState(startSession)
  const [hasEntered, setHasEntered] = useState(false)
  const [panel, setPanel] = useState(null)
  const [storageUnavailable, setStorageUnavailable] = useState(false)
  const [audioMessage, setAudioMessage] = useState('')
  const entry = useRef('welcome')
  const speaker = typeof window !== 'undefined' ? window.speechSynthesis : null
  const { page, settings } = session
  const friend = friends.find((f) => f.id === session.friendId) || friends[0]
  const topic = topics.find((t) => t.id === session.topicId) || topics[0]
  const showEntrance = !hasEntered || page === 'welcome'
  const learning = !showEntrance && (page === 'lesson' || page === 'placement')
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

  useEffect(() => {
    speaker?.getVoices()
  }, [speaker])

  // Speak only after a deliberate opt-in and only with an installed Korean voice.
  useEffect(() => {
    if (!settings.sound || !speaker) return
    let previous = ''
    const main = document.getElementById('main-content')
    if (!main || panel) return
    const read = () => {
      if (document.hidden) return
      if (main.querySelector('[data-mic-active]')) {
        speaker.cancel()
        previous = ''
        return
      }
      const lines = [...main.querySelectorAll('h1,[data-read-aloud]')]
        .map((el) => el.textContent.trim())
        .filter(Boolean)
      const words = lines.join('. ')
      if (!words || words === previous) return
      const voice = speaker.getVoices().find((item) => item.localService && /^ko/i.test(item.lang))
      if (!voice) return
      previous = words
      speaker.cancel()
      const utterance = new SpeechSynthesisUtterance(words)
      utterance.voice = voice
      utterance.lang = 'ko-KR'
      utterance.rate = 0.9
      speaker.speak(utterance)
    }
    const onHidden = () => {
      if (document.hidden) speaker.cancel()
    }
    const observer = new MutationObserver(read)
    observer.observe(main, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-mic-active'],
    })
    speaker.addEventListener?.('voiceschanged', read)
    document.addEventListener('visibilitychange', onHidden)
    read()
    return () => {
      observer.disconnect()
      speaker.cancel()
      speaker.removeEventListener?.('voiceschanged', read)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [settings.sound, page, panel, speaker, showEntrance])

  function retest() {
    const returnPage = page === 'placement' ? session.retestReturn : session.onboarded ? page : null
    patch({ page: 'placement', placement: null, retestReturn: returnPage })
    setPanel(null)
  }
  function setPreferences(values) {
    if (
      values.sound &&
      !speaker?.getVoices().some((voice) => voice.localService && /^ko/i.test(voice.lang))
    ) {
      setAudioMessage('이 기기에서 한국어 안내 음성을 찾을 수 없어요.')
      return
    }
    setAudioMessage('')
    setSession((current) => ({ ...current, settings: { ...current.settings, ...values } }))
  }
  function open(mode, origin) {
    entry.current = origin
    setPanel(mode)
  }
  function enterForest() {
    setHasEntered(true)
    if (page !== 'welcome') return
    const updated = forToday(session, localDay())
    if (updated !== session) setSession(updated)
    if (updated.records.some((r) => r.date === updated.day)) patch({ page: 'stickers' })
    else if (updated.onboarded) patch({ page: 'lesson', step: 0, activity: null })
    else open('account', 'onboarding')
  }
  function chooseFriend(id) {
    patch(
      entry.current === 'onboarding'
        ? { friendId: id, page: 'placement', placement: null }
        : { friendId: id },
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
        <>
          <a href="#main-content" className="skip-link">
            본문으로 가기
          </a>
          <AppHeader
            sound={settings.sound}
            learning={learning}
            onSound={() => setPreferences({ sound: !settings.sound })}
            onGuard={() => open('guardian', 'guardian')}
            onRest={() => open('rest', 'rest')}
          />
        </>
      )}
      {!showEntrance && audioMessage && (
        <div className="notice" role="status">
          {audioMessage}
          <button type="button" onClick={() => setAudioMessage('')}>
            닫기
          </button>
        </div>
      )}
      {storageUnavailable && (
        <p className="notice" role="status">
          이 브라우저에는 기록을 저장할 수 없어요. 지금 열린 화면에서 산책을 계속할 수 있어요.
        </p>
      )}
      {showEntrance && (
        <ForestEntrance
          friend={friend}
          topic={topic}
          finished={page === 'stickers' || (page === 'welcome' && finished)}
          resuming={page !== 'welcome' && page !== 'stickers'}
          hidden={Boolean(panel)}
          onEnter={enterForest}
        />
      )}
      {learning && (
        <main id="main-content" className="page-wrap learning-wrap">
          <div className="lesson-context">
            <span>
              <Sprout />
              {page === 'placement' ? '산책 준비' : '오늘의 감정 · ' + topic.label}
            </span>
            {page === 'lesson' && <JourneyProgress friend={friend} step={session.step} />}
          </div>
          {page === 'placement' ? (
            <LevelTest progress={session} onUpdate={patch} onDone={afterTest} friend={friend} />
          ) : (
            <Lesson
              progress={session}
              onUpdate={patch}
              onComplete={() => setSession(finishWalk)}
              friend={friend}
              topic={topic}
              active={!panel}
            />
          )}
        </main>
      )}
      {!showEntrance && (page === 'praise' || page === 'stickers') && (
        <Reward
          page={page}
          friend={friend}
          topic={topic}
          records={session.records}
          onBook={() => patch({ page: 'stickers' })}
          onFinish={() => setSession((current) => forToday({ ...current, page: 'welcome' }))}
        />
      )}
      <Panel
        mode={panel}
        onClose={closePanel}
        friend={friend}
        friends={friends}
        onFriend={chooseFriend}
        settings={settings}
        onSettings={setPreferences}
        records={session.records}
        onOpen={setPanel}
        onAccountDone={() => setPanel(entry.current === 'onboarding' ? 'friends' : 'guardian')}
        soundNotice={audioMessage}
        onRetest={retest}
      />
    </>
  )
}
export default App
