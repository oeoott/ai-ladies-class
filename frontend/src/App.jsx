import { NarrationActive, NarrationVoice, useNarration } from './narration.js'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Pause, PawPrint, ShieldCheck, Sprout } from 'lucide-react'
import { ForestEntrance } from './ForestEntrance.jsx'
import { GuidePortrait } from './PaintedFriend.jsx'
import { JourneyProgress } from './JourneyProgress.jsx'
import { CardPortrait, LevelTest, Lesson } from './Activities.jsx'
import { Panel } from './Panels.jsx'
import {
  STORAGE_KEY,
  beginWalk,
  emptySession,
  finishWalk,
  forToday,
  readSession,
  reviewSticker,
  nextStickerTopic,
  startNextStickerLesson,
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

function Stamp({ record, onReview, nextTopic, onNext }) {
  if (!record && nextTopic) {
    return (
      <button type="button" className="stamp stamp-next" onClick={onNext} aria-label={nextTopic.label + ' 학습 시작'}>
        <span>{nextTopic.label}</span>
        <span className="stamp-next-label">다음 학습</span>
      </button>
    )
  }
  if (!record) {
    return <span className="stamp" aria-hidden="true"><PawPrint /></span>
  }
  return (
    <button type="button" className="stamp filled" onClick={() => onReview(record)}
      aria-label={record.topic + ' 다시 하기 · ' + record.date}>
      <Sprout aria-hidden="true" />
      <span>{record.topic}</span>
    </button>
  )
}

function LessonReady({ friend, onStart }) {
  useNarration('준비가 끝났어요. 이제 첫 번째 놀이를 시작해요.')
  return (
    <section className="praise-clearing">
      <div className="praise-note"><h1>학습 진단을 마쳤어요</h1></div>
      <GuidePortrait className="reward-friend" friend={friend} />
      <button type="button" className="primary" onClick={onStart}>학습 시작하기</button>
    </section>
  )
}

function Reward({ page, friend, topic, records, onBook, onFinish, onReview, nextTopic, onNext }) {
  const completionTitle = '동화 놀이를 마쳤어요'
  useNarration(page === 'stickers' ? '다음 학습을 시작하거나, 스티커를 눌러 다시 해 봐요.' : completionTitle + '. 스티커를 보러 갈까요?')
  const title = useRef(null)
  useEffect(() => {
    title.current?.focus({ preventScroll: true })
  }, [page])
  const isBook = page === 'stickers'
  const lastSheet = Math.max(0, Math.ceil((records.length + Number(Boolean(nextTopic))) / 5) - 1)
  const [sheet, setSheet] = useState(lastSheet)
  const pageStart = sheet * 5
  const group = records.slice(pageStart, pageStart + 5)
  return (
    <section className={isBook ? 'sticker-book' : 'praise-clearing'}>
      {isBook ? (
        <>
          <h1 ref={title} tabIndex="-1">
            마음숲 스티커판
          </h1>
          <p>다음 학습을 시작하거나, 스티커를 눌러 다시 해 봐요.</p>
          <div className="stamp-board">
            {Array.from({ length: 5 }, (_, i) => (
              <Stamp key={i} record={group[i]} onReview={onReview}
                nextTopic={pageStart + i === records.length ? nextTopic : null} onNext={onNext} />
            ))}
          </div>
          {lastSheet > 0 && (
            <div className="stamp-pages">
              <button type="button" disabled={!sheet} onClick={() => setSheet(sheet - 1)}>이전 장</button>
              <span aria-live="polite">{sheet + 1} / {lastSheet + 1}</span>
              <button type="button" disabled={sheet === lastSheet} onClick={() => setSheet(sheet + 1)}>다음 장</button>
            </div>
          )}
          <span className="stamp-count">지금까지 모은 스티커 {records.length}개</span>
          <button type="button" className="primary" onClick={onFinish}>
            산책 마치기
          </button>
        </>
      ) : (
        <>
          <div className="praise-note">
            <h1 ref={title} tabIndex="-1">
              {completionTitle}
            </h1>
            <p>
              {friend.familiar}와 {topic.phrase}을 알아보고 이야기를 나눴어요.
            </p>
          </div>
          <GuidePortrait className="reward-friend" friend={friend} />
          <button type="button" className="primary" onClick={onBook}>
            스티커판 보기
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
  const signupDraft = useRef(null)
  const history = useRef([])
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
  const topic = topics.find((t) => t.id === (session.reviewTopicId || session.topicId)) || topics[0]
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

  function move(values) {
    const { page, placement, step, activity, retestReturn, onboarded, level } = session
    const phaseChanged = ['practicePhase', 'mirrorPhase', 'phase', 'bookPage', 'completed']
      .some((field) => activity?.[field] !== values.activity?.[field])
    if ((values.page && values.page !== page) || ('step' in values && step !== values.step)
      || ('activity' in values && (phaseChanged || values.activity === null))
      || ('placement' in values && (placement?.index !== values.placement?.index
        || placement?.introduced !== values.placement?.introduced))) {
      history.current.push({ page, placement, step, activity, retestReturn, onboarded, level })
    }
    patch(values)
  }
  function previousScene() {
    const previous = history.current.pop()
    if (previous) {
      patch(previous)
      return
    }
    if (page === 'placement' && session.retestReturn) {
      patch({ page: session.retestReturn, placement: null, retestReturn: null })
      return
    }
    if (page === 'placement' && !session.onboarded) {
      patch({ page: 'welcome', placement: null })
      open('friendHello', 'onboarding')
      return
    }
    setHasEntered(false)
  }
  function retest() {
    history.current = []
    const returnPage = page === 'placement' ? session.retestReturn : session.onboarded ? page : null
    patch({ page: 'placement', placement: null, retestReturn: returnPage })
    setPanel(null)
  }
  function open(mode, origin) {
    entry.current = origin
    setPanel(mode)
  }
  function enterForest() {
    history.current = []
    setHasEntered(true)
    const next = beginWalk(session)
    setSession(next)
    if (next.page === 'welcome') open('together', 'onboarding')
  }
  function completeAccount(email) {
    setRecipient(email)
    try {
      if (email) sessionStorage.setItem(recipientKey, email)
      else sessionStorage.removeItem(recipientKey)
    } catch {
      // The address still works for the current visit when tab storage is unavailable.
    }
    setPanel(entry.current === 'onboarding' ? 'gate' : 'report')
  }
  function chooseFriend(id, { charm, headwear, nickname }) {
    const appearance = {
      friendId: id,
      friendCharm: charm,
      friendHeadwear: headwear,
      friendNickname: nickname,
    }
    patch(appearance)
    setPanel('guardian')
  }
  function chooseFirstFriend(id) {
    patch({ friendId: id, friendCharm: null, friendHeadwear: null, friendNickname: '' })
    setPanel('friendHello')
  }
  function startPlacement() {
    patch({ page: 'placement', placement: null })
    setPanel(null)
  }
  function afterTest(level) {
    move({
      onboarded: true,
      level,
      page: session.retestReturn || 'ready',
      placement: null,
      retestReturn: null,
    })
  }
  function closePanel() {
    if (entry.current === 'guardian' && panel !== 'guardian' && panel !== 'gate') {
      setPanel('guardian')
      return
    }
    setPanel(null)
  }

  return (
    <NarrationVoice.Provider value={friend.id}>
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
          resuming={['placement', 'ready', 'lesson'].includes(page)}
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
          <NarrationActive.Provider value={!panel}>
            <div className="scene-content">
              <CardPortrait.Provider value={session.cardPortrait}>
                  {page === 'placement' && (
                    <LevelTest progress={session} onUpdate={move} onDone={afterTest} friend={friend} active={!panel} />
                  )}
                  {page === 'ready' && (
                    <LessonReady friend={friend} onStart={() => move({ page: 'lesson', step: 0, activity: null })} />
                  )}
                  {page === 'lesson' && (
                    <Lesson
                      progress={session}
                      onUpdate={move}
                      onComplete={() => {
                        history.current = []
                        setSession(finishWalk)
                      }}
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
                      nextTopic={session.onboarded ? nextStickerTopic(session) : null}
                      onNext={() => {
                        history.current = []
                        setSession((current) => startNextStickerLesson(current))
                      }}
                      onReview={(record) => {
                        history.current = []
                        setSession((current) => reviewSticker(current, record))
                      }}
                      onBook={() => patch({ page: 'stickers' })}
                      onFinish={() => setSession((current) => forToday({ ...current, page: 'welcome' }))}
                    />
                  )}
              </CardPortrait.Provider>
            </div>
          </NarrationActive.Provider>
          {(learning || page === 'ready') && (
            <div className="scene-back">
              <button className="scene-tool" type="button" onClick={previousScene} aria-label="이전">
                <ArrowLeft aria-hidden="true" />
              </button>
            </div>
          )}
          <div className="scene-footer">
            <SceneTools
              learning={learning}
              onGuard={() => open('gate', 'guardian')}
              onRest={() => open('rest', 'rest')}
            />
          </div>
        </main>
      )}
      <Panel
        mode={panel}
        cardPortrait={session.cardPortrait}
        onCardPortrait={(cardPortrait) => {
          patch({ cardPortrait })
          setPanel(entry.current === 'onboarding' ? 'chooseFriend' : 'guardian')
        }}
        onUnlock={() => setPanel(entry.current === 'onboarding' ? 'portrait' : 'guardian')}
        onChooseFirstFriend={chooseFirstFriend}
        onStartPlacement={startPlacement}
        onReview={(record) => {
          history.current = []
          setSession((current) => reviewSticker(current, record, true))
          setPanel(null)
        }}
        onClose={closePanel}
        friend={friend}
        friends={friends}
        onFriend={chooseFriend}
        records={session.records}
        onOpen={setPanel}
        recipient={recipient}
        signupEmail={signupDraft.current ?? recipient}
        onSignupDraft={(email) => { signupDraft.current = email }}
        onAccountDone={completeAccount}
        onRetest={retest}
      />
    </NarrationVoice.Provider>
  )
}
export default App
