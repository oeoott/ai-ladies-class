import { useNarration } from './narration.js'
import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useId } from 'react'
import { startFacePreview } from './facePreview.js'
import { feelingPractice, PracticeObject } from './FeelingPractice.jsx'
import { GuidePortrait, PaintedFriend } from './PaintedFriend.jsx'
import './activities.css'
import { TaleActions, TaleScene } from './ForestTale.jsx'
import { forestTales } from './forestTales.js'
import { emotions, tales } from './content.js'
import { StoryVoice, voiceSupported } from './StoryVoice.jsx'
import { api } from './api.js'
import { friendFace, localReply, namedTalk, nextEmote, saidLine, startServerTalk, takeTurn, talkReply, usableTalk } from './storyTalk.js'

// Emotion words and clues, from the shared emotions.json (one entry per emotion).
// LEGACY_TALK keeps the conversation that sessions saved before the picture books still use;
// a new emotion does not need one (its tale talk is used instead).
const LEGACY_TALK = {
  joy: {
    ask: '친구에게 어떤 말을 건네 볼까요?',
    choices: ['같이 놀자!', '불러 줘서 고마워.'],
    replies: ['좋아! 종이비행기를 함께 날려 보자.', '나도 고마워. 같이 노니까 즐거워.'],
    again: '비행기를 어디로 날려 볼까요?',
    extra: ['하늘로!', '나무 쪽으로!'],
    ends: ['하늘을 향해 비행기를 날렸어요.', '나무 쪽으로 비행기를 날렸어요.'],
  },
  sad: {
    ask: '친구에게 어떤 말을 건네 볼까요?',
    choices: ['옆에 있어 줄게.', '같이 다시 쌓을까?'],
    replies: ['내 옆에 있어 줘서 고마워.', '좋아. 함께 쌓으면 힘이 날 것 같아.'],
    again: '다음에는 무엇을 해 볼까요?',
    extra: ['잠깐 쉬자.', '블록을 모으자.'],
    ends: ['둘이 나란히 앉아 잠깐 쉬었어요.', '둘이 천천히 블록을 모았어요.'],
  },
  surprise: {
    ask: '친구에게 어떤 말을 건네 볼까요?',
    choices: ['나비가 있었구나!', '괜찮아?'],
    replies: ['응! 잎이 움직여서 깜짝 놀랐어.', '응, 괜찮아. 이제 천천히 보고 싶어.'],
    again: '나비를 어떻게 볼까요?',
    extra: ['여기서 보자.', '앉아서 보자.'],
    ends: ['둘은 서서 나비를 가만히 바라보았어요.', '둘은 나란히 앉아 나비를 보았어요.'],
  },
  anger: {
    ask: '차례를 지키도록 어떤 말을 해 볼까요?',
    choices: ['지금은 내 차례야.', '우리 차례로 타자.'],
    replies: ['맞아. 내가 먼저 기다렸다고 알려 줄래.', '좋아. 차례를 지키자고 말해 볼래.'],
    again: '또 도움이 필요하면 어떻게 할까요?',
    extra: ['선생님께 말해요.', '잠깐 쉬어요.'],
    ends: ['선생님께 차례를 지키고 싶다고 말했어요.', '벤치에 앉아 잠깐 쉬었어요.'],
  },
}
const FEELINGS = Object.fromEntries(
  Object.entries(emotions).map(([id, emotion]) => [id, { ...(LEGACY_TALK[id] || tales[id].talk), ...emotion }]),
)
const FIRST_TOPIC = Object.keys(FEELINGS)[0]
// Other names a topic may arrive with (label, English or similar Korean words) → emotion id.
const TOPIC_NAMES = Object.fromEntries(
  Object.entries(emotions).flatMap(([id, emotion]) => [emotion.label, ...(emotion.aliases || [])].map((name) => [name, id])),
)
function topicId(topic) {
  for (const key of [topic?.id, topic?.label, topic?.name, topic]) {
    if (typeof key === 'string' && (FEELINGS[key] || TOPIC_NAMES[key]))
      return TOPIC_NAMES[key] || key
  }
  return FIRST_TOPIC
}
function animalKind(friend) {
  if (/rabbit|bunny|토끼/i.test(friend?.id + ' ' + friend?.species)) return 'rabbit'
  if (/bear|곰/i.test(friend?.id + ' ' + friend?.species)) return 'bear'
  return 'lion'
}
function withFriend(name) {
  const code = name.charCodeAt(name.length - 1) - 0xac00
  return name + (code >= 0 && code < 11172 && code % 28 !== 0 ? '과' : '와')
}
function Action({ children, ...props }) {
  return (
    <button type="button" className="edu-primary" {...props}>
      {children}
    </button>
  )
}
function Choice({ selected, children, ...props }) {
  return (
    <button
      type="button"
      className={'edu-choice' + (selected ? ' is-selected' : '')}
      aria-pressed={Boolean(selected)}
      {...props}
    >
      <span className="edu-choice-mark" aria-hidden="true">
        {selected ? '✓' : ''}
      </span>
      {children}
    </button>
  )
}
export const CardPortrait = createContext('boy')

function EmotionCard({ feeling, alt = FEELINGS[feeling].clue }) {
  const portrait = useContext(CardPortrait)
  const prefix = portrait === 'girl' ? 'girl-' : ''
  return (
    <img
      className="edu-emotion-card"
      src={import.meta.env.BASE_URL + 'art/cards/' + prefix + feeling + '.webp'}
      width="626"
      height="626"
      alt={alt}
      draggable={false}
    />
  )
}
function Portrait({ friend, feeling, gesture, actionKey, active = true, emote = null, emoteKey, emoteNow = false }) {
  const kind = animalKind(friend)
  const clue = feeling === 'neutral' ? '편안하게 기다리고 있어요.' : FEELINGS[feeling].clue
  return (
    <PaintedFriend
      charm={friend?.charm}
      headwear={friend?.headwear}
      kind={kind}
      src={friend?.image || import.meta.env.BASE_URL + 'art/' + kind + '.webp'}
      label={`${friend?.name || '숲속 친구'}의 얼굴. ${clue}`}
      {...{ feeling, gesture, actionKey, active, emote, emoteKey, emoteNow }}
    />
  )
}
function FaceDetail({ feeling }) {
  return (
    <div className={'face-detail face-detail-' + feeling}>
      <EmotionCard feeling={feeling} />
      <span aria-hidden="true" />
    </div>
  )
}
function Board({ title, description, illustration, guide, className = '', children, voiceLine = description || title, focusKey = title }) {
  useNarration(voiceLine)
  const heading = useRef(null)
  const id = useId()
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [focusKey])
  const prompt = (
    <div className="edu-header">
      <h1 id={id} tabIndex="-1" ref={heading}>
        {title}
      </h1>
      {description && <p>{description}</p>}
    </div>
  )
  const paper = (
    <div className="edu-paper">
      {prompt}
      {children && <div className="edu-task">{children}</div>}
    </div>
  )
  return (
    <section
      className={`edu-board ${illustration ? 'edu-spread' : 'edu-preparation'} ${className}`.trim()}
      aria-labelledby={id}
    >
      {illustration ? (
        <>
          {guide ? <div className="edu-board-guide">{guide}{paper}</div> : paper}
          {illustration}
        </>
      ) : (
        <>
          {prompt}
          {children}
        </>
      )}
    </section>
  )
}
function EmotionIntroduction({ feeling, friend, active, meaning, example, onNext }) {
  const heading = useRef(null)
  const id = useId()
  useNarration(meaning + ' ' + example, onNext)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [feeling])

  return (
    <section className="edu-board edu-intro" aria-labelledby={id}>
      <figure className="edu-figure">
        <EmotionCard feeling={feeling} />
      </figure>
      <div className="edu-intro-guide">
        <GuidePortrait friend={friend} active={active} />
        <div className="edu-paper">
          <div className="edu-header">
            <h1 id={id} ref={heading} tabIndex="-1">{FEELINGS[feeling].label}</h1>
          </div>
          <p>{meaning}</p>
          <p>{example}</p>
        </div>
      </div>
    </section>
  )
}

const PLACEMENT = [
  {
    target: 'joy',
    alternatives: ['joy', 'sad'],
    meaning: feelingPractice.joy.meaning,
    example: feelingPractice.joy.example,
    prompt: '기쁜 얼굴을 눌러 보아요.',
    hint: '웃으면서 입꼬리가 올라간 얼굴을 찾아봐요.',
  },
  {
    target: 'surprise',
    alternatives: ['anger', 'surprise'],
    meaning: '갑자기 무언가 나타나면 깜짝 놀라요.',
    example: '나비가 갑자기 날아와 눈이 동그래졌어요.',
    prompt: '놀란 얼굴을 눌러 보아요.',
    hint: '눈과 입이 동그래진 얼굴을 찾아봐요.',
  },
]
export function LevelTest({ progress, onUpdate, onDone, friend, active }) {
  const state = progress.placement || {}
  const idx = state.index === 1 ? 1 : 0
  const item = PLACEMENT[idx]
  const solved = state.choice === item.target
  function choose(value) {
    if (solved) return
    if (value === item.target) return advance()
    onUpdate({
      placement: {
        ...state,
        index: idx,
        choice: value,
        picks: [...(state.picks || []), value],
        usedHint: Boolean(state.usedHint) || value !== item.target,
      },
    })
  }
  function advance() {
    // Each question's taps are kept so the result can be recorded (backend: POST /children/{id}/placement).
    const picks = [...(state.picks || []), item.target]
    const answers = [...(state.answers || []), { target: item.target, picks, usedHint: picks.length > 1 }]
    if (idx === 0) onUpdate({ placement: { index: 1, usedHint: Boolean(state.usedHint), answers } })
    else onDone(state.usedHint ? 'basic' : 'expand', answers)
  }
  if (!state.introduced && !state.choice) {
    return (
      <EmotionIntroduction
        feeling={item.target}
        friend={friend}
        active={active}
        meaning={item.meaning}
        example={item.example}
        onNext={() => onUpdate({ placement: { ...state, index: idx, introduced: true } })}
      />
    )
  }
  return (
    <Board title={item.prompt} voiceLine={state.choice && !solved ? item.hint : item.prompt}>
      <div className="edu-placement-prompt">
        <div className="edu-placement">
          {item.alternatives.map((key) => (
            <button
              type="button"
              key={key}
              aria-pressed={state.choice === key}
              aria-label={FEELINGS[key].clue}
              disabled={solved}
              className={'edu-picture-choice' + (state.choice === key ? ' is-selected' : '')}
              onClick={() => choose(key)}
            >
              <EmotionCard feeling={key} alt="" />
              {state.choice === key && (
                <span className="edu-picture-check" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
        <GuidePortrait friend={friend} className="edu-placement-guide" active={active} />
      </div>
      <div className="edu-action-row">
        <p role="status">
          {solved ? '찾았어요! ' + FEELINGS[item.target].clue : state.choice ? item.hint : ''}
        </p>
        {solved && (
          <Action onClick={advance}>{idx === 0 ? '다음 얼굴 보기' : '학습 시작하기'}</Action>
        )}
      </div>
    </Board>
  )
}
function EmotionActivity({ fact, feeling, friend, state, update, next, expanded, active, walkId }) {
  const practice = feelingPractice[feeling]
  // Older walks saved word choices before the introductory scenes existed.
  const phase = state.practicePhase || (state.selected || state.solved ? 'words' : 'intro')
  const cueFound = state.cue === practice.target
  const card = (
    <figure className="edu-figure">
      <EmotionCard feeling={feeling} />
    </figure>
  )
  if (phase === 'intro') {
    return (
      <EmotionIntroduction
        feeling={feeling}
        friend={friend}
        active={active}
        meaning={practice.meaning}
        example={practice.example}
        onNext={() => update({ practicePhase: 'experiment' })}
      />
    )
  }
  if (phase === 'experiment' || phase === 'discovery') {
    const revealed = phase === 'discovery'
    return (
      <Board
        title={revealed ? practice.afterTitle : practice.beforeTitle}
        description={revealed ? practice.reaction : practice.before}
        voiceLine={revealed ? practice.reaction + ' ' + practice.cueQuestion : practice.before}
        guide={revealed && <GuidePortrait friend={friend} active={active} />}
        illustration={
          <div className="edu-figure practice-field">
            {revealed ? <FaceDetail feeling={feeling} /> : (
              <figure className="practice-field-friend">
                <Portrait friend={friend} feeling="neutral" active={active} gesture="listen" />
              </figure>
            )}
            <PracticeObject
              feeling={feeling}
              revealed={revealed}
              onAct={revealed ? undefined : () => update({ practicePhase: 'discovery' })}
            />
          </div>
        }
      >
        {revealed && (
          <>
            <p className="edu-prompt">
              {practice.cueQuestion}
            </p>
            <div className="practice-cue-options" role="group" aria-label="표정 단서">
              {practice.cues.map((cue) => (
                <Choice
                  key={cue}
                  selected={state.cue === cue}
                  disabled={cueFound}
                  onClick={() => update(cue === practice.target ? { cue, practicePhase: 'words' } : { cue })}
                >
                  {cue}
                </Choice>
              ))}
            </div>
            <p className="edu-feedback" role="status">
              {cueFound ? fact.clue : state.cue ? practice.cueHint : ''}
            </p>
            {cueFound && (
              <Action onClick={() => update({ practicePhase: 'words' })}>마음 낱말 고르기</Action>
            )}
          </>
        )}
      </Board>
    )
  }
  const words = expanded ? [fact.word, fact.kin, fact.opposite] : [fact.word, fact.opposite]
  // Answer position per emotion (emotions.json 'oppositeFirst'), stable on repeat visits.
  if (fact.oppositeFirst) words.unshift(words.pop())
  const selected = Array.isArray(state.selected)
    ? state.selected.filter((x) => words.includes(x))
    : []
  const done = Boolean(state.solved)
  // The server only keeps a record; the screen judges answers on its own.
  function record(choice) {
    if (walkId) api.answerEmotion(walkId, { selected: choice, usedHint: Boolean(state.hinted) })
  }
  function pick(word) {
    if (done) return
    if (!expanded) record([word])
    if (!expanded && word === fact.word) return next()
    if (!expanded) return update({ selected: [word], feedback: fact.clue, hinted: true })
    const current = selected.includes(word) ? selected.filter((x) => x !== word) : [...selected, word]
    update({ selected: current, feedback: '' })
  }
  function submit() {
    record(selected)
    const correct =
      selected.length > 0 && selected.every((word) => word === fact.word || word === fact.kin)
    if (correct) return next()
    update({ feedback: '그림을 다시 볼까요? ' + fact.clue, hinted: true })
  }
  return (
    <Board
      title="어떤 마음일까요?"
      className="edu-word-choice"
      description={
        expanded
          ? '맞는 말을 하나나 두 개 골라요.'
          : '맞는 말 하나를 골라요.'
      }
      illustration={card}
      guide={<GuidePortrait friend={friend} active={active} />}
    >
      <div
        className={expanded ? 'edu-choices edu-multiple' : 'edu-choices'}
        role="group"
        aria-label="마음 낱말"
      >
        {words.map((w) => (
          <Choice key={w} selected={selected.includes(w)} disabled={done} onClick={() => pick(w)}>
            {w}
          </Choice>
        ))}
      </div>
      <p role="status" className="edu-feedback">
        {state.feedback}
      </p>
      {done ? (
        <Action onClick={next}>표정 연습으로</Action>
      ) : (
        expanded && <Action onClick={submit} disabled={selected.length === 0}>
          선택 확인하기
        </Action>
      )}
    </Board>
  )
}
function useCamera(active) {
  const [status, setStatus] = useState('off')
  const [facePresent, setFacePresent] = useState(false)
  const stopPreview = useRef(null)
  const stream = useRef(null),
    pending = useRef(0),
    video = useRef(null)
  function stop() {
    pending.current += 1
    stopPreview.current?.()
    stopPreview.current = null
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    if (video.current) video.current.srcObject = null
  }
  function off() {
    stop()
    setFacePresent(false)
    setStatus('off')
  }
  useEffect(() => {
    if (!active) off()
    function hide() {
      if (document.hidden) off()
    }
    document.addEventListener('visibilitychange', hide)
    window.addEventListener('pagehide', off)
    return () => {
      document.removeEventListener('visibilitychange', hide)
      window.removeEventListener('pagehide', off)
      stop()
    }
  }, [active])
  async function start() {
    if (!active) return
    stop()
    const request = pending.current
    setFacePresent(false)
    setStatus('waiting')
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user' },
      })
      if (request !== pending.current || document.hidden) {
        acquired.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = acquired
      acquired.getVideoTracks().forEach((track) =>
        track.addEventListener(
          'ended',
          () => {
            if (stream.current === acquired) off()
          },
          { once: true },
        ),
      )
      setStatus('on')
    } catch {
      if (request === pending.current) setStatus('unavailable')
    }
  }
  useEffect(() => {
    if (status === 'on' && video.current && stream.current) {
      const acquired = stream.current
      video.current.srcObject = acquired
      const element = video.current
      element
        .play()
        .then(() => {
          if (stream.current !== acquired) return
          try {
            stopPreview.current = startFacePreview(element, (present) => {
              if (stream.current === acquired) setFacePresent(present === true)
            })
          } catch {
            setFacePresent(false)
          }
        })
        .catch(() => {
          if (stream.current === acquired) {
            stop()
            setStatus('unavailable')
          }
        })
    }
  }, [status])
  return { status, video, start, off, facePresent }
}

function MirrorActivity({ fact, feeling, friend, active, state, update, next, walkId }) {
  const camera = useCamera(active)
  const cameraUsed = useRef(false)
  useEffect(() => {
    if (camera.status === 'on') cameraUsed.current = true
  }, [camera.status])
  const [demonstration, setDemonstration] = useState(0)
  const ways = feelingPractice[feeling].expression
  if (state.mirrorPhase === 'express' || state.mirrorPhase === 'response') {
    const chosen = state.mirrorPhase === 'response' ? ways[state.mirrorChoice] : null
    return (
      <Board
        title={chosen ? '친구가 이렇게 답했어요' : '내 마음을 전해 봐요'}
        description={chosen ? chosen.practice : '말이나 몸짓을 골라요.'}
        guide={<GuidePortrait friend={friend} active={active} />}
        illustration={
          <figure className="edu-figure">
            <EmotionCard feeling={feeling} />
          </figure>
        }
      >
        {chosen ? (
          <>
            <p className="edu-response-copy">
              {chosen.answer}
            </p>
            <Action onClick={next}>연습 마치기</Action>
          </>
        ) : (
          <div className="edu-choices" role="group" aria-label="마음을 전하는 방법">
            {ways.map((way, index) => (
              <button
                key={way.action}
                type="button"
                className="edu-reply"
                onClick={() => update({ mirrorPhase: 'response', mirrorChoice: index })}
              >
                {way.action}
              </button>
            ))}
          </div>
        )}
      </Board>
    )
  }
  return (
    <Board
      title="표정을 따라 해 봐요"
      voiceLine={fact.motion}
      guide={<GuidePortrait friend={friend} active={active} />}
      illustration={
        <figure className="edu-figure edu-mirror-figure">
          {demonstration % 2 ? <FaceDetail feeling={feeling} /> : <EmotionCard feeling={feeling} />}
          <button
            type="button"
            className="edu-secondary"
            onClick={() => setDemonstration((n) => n + 1)}
          >
            {demonstration % 2 ? '얼굴 전체 보기' : '표정 크게 보기'}
          </button>
        </figure>
      }
    >
      <p className="edu-response-copy">
        {fact.motion}
      </p>
      {camera.status === 'on' && (
        <div className="edu-camera">
          <video ref={camera.video} muted autoPlay playsInline aria-label="이 기기의 내 모습" />
        </div>
      )}
      <div className="edu-mirror-actions">
        {camera.status === 'on' || camera.status === 'waiting' ? (
          <button className="edu-secondary" type="button" onClick={camera.off}>
            {camera.status === 'waiting' ? '카메라 요청 취소' : '카메라 끄기'}
          </button>
        ) : (
          <button className="edu-secondary" type="button" onClick={camera.start}>
            {camera.status === 'unavailable' ? '카메라 다시 켜기' : '카메라로 내 모습 보기'}
          </button>
        )}
        <Action
          onClick={() => {
            camera.off()
            if (walkId) api.recordMirror(walkId, { mode: cameraUsed.current ? 'camera' : 'touch', score: null })
            update({ mirrorPhase: 'express' })
          }}
        >
          표정 연습 마쳤어요
        </Action>
      </div>
      <p role="status" className="edu-note edu-camera-status">
        {camera.status === 'on'
          ? camera.facePresent
            ? '얼굴이 화면에 보여요.'
            : '내 모습은 이 화면에만 보여요.'
          : camera.status === 'waiting'
            ? '카메라를 열고 있어요.'
            : camera.status === 'unavailable'
              ? '카메라가 꺼져 있어요. 그림을 봐요.'
              : null}
      </p>
    </Board>
  )
}
// One note right under the choices holds both the voice guidance and the waiting line, on every device.
// The choices are disabled while the reply is on its way.
function StoryQuestion({ fact, isExtra, onReply, onHeard, onListening, waiting, active }) {
  const choices = isExtra ? fact.extra : fact.choices
  const [voiceLine, setVoiceLine] = useState('')
  const note = waiting ? '생각하고 있어요.' : voiceLine
  return (
    <>
      <p className="edu-prompt">{isExtra ? fact.again : fact.ask}</p>
      <div className="edu-choices" role="group" aria-label="친구에게 보낼 말">
        {choices.map((text, index) => (
          <button key={text} type="button" className="edu-reply" disabled={waiting} onClick={() => onReply(index)}>
            {text}
          </button>
        ))}
      </div>
      {(voiceSupported() || note) && (
        <div className="edu-story-voice">
          <p role="status" className="edu-note">{note}</p>
          <StoryVoice choices={choices} onReply={onReply} onHeard={onHeard} waiting={waiting} active={active}
            onStatus={({ listening, message }) => {
              setVoiceLine(message)
              onListening(listening)
            }} />
        </div>
      )}
    </>
  )
}

function StoryActivity({ fact, feeling, friend, state, update, onComplete, active, walkId }) {
  const tale = forestTales[feeling]
  const pages = tale.pages
  const phase = [
    'situation',
    'act',
    'consequence',
    'question',
    'reply',
    'extra',
    'ending',
  ].includes(state.phase)
    ? state.phase
    : 'book'
  const savedPage = Number.isInteger(state.bookPage) ? state.bookPage : 0
  const page =
    phase === 'book' ? Math.max(0, Math.min(pages.length - 1, savedPage)) : pages.length - 1
  const chosen = state.branch === 0 || state.branch === 1 ? state.branch : null
  const outcome = chosen == null ? null : tale.actions[chosen]
  const friendName = friend?.name || '숲속 친구'
  const inDialogue = ['question', 'reply', 'extra', 'ending'].includes(phase)
  // A conversation saved before the picture books existed keeps its original replies.
  // {친구} in the questions becomes the friend's name, as on the tale pages.
  const conversation = namedTalk(outcome ? tale.talk : fact, friend?.familiar || friendName)
  const isExtra = phase === 'extra'
  const isEnding = phase === 'ending'
  const lines = isEnding ? conversation.ends : conversation.replies
  const reply = talkReply(state, isEnding, lines)
  // Earlier sessions may have finished the exchange without selecting a line.
  const replyText = reply ? (isEnding ? reply : '“' + reply + '”') : '친구와 이야기를 나눴어요.'
  const [waiting, setWaiting] = useState(false)
  const [listening, setListening] = useState(false)
  // A sentence the child said that got a reply. Memory only: never in session.js, so a reload drops it.
  const [spoken, setSpoken] = useState(null)
  const latest = useRef(null)
  latest.current = { state, update }
  const serverTalk = Boolean(walkId && outcome)
  const talkId = usableTalk(state, phase, serverTalk)
  useEffect(() => {
    if (phase !== 'question' || !serverTalk || talkId) return
    let current = true
    startServerTalk(api, walkId, undefined, friend?.id).then((id) => {
      if (current && id && latest.current.state.phase === 'question') latest.current.update({ talkId: id })
    })
    return () => {
      current = false
    }
  }, [phase, serverTalk, talkId, walkId])
  function sendTurn(turn) {
    setWaiting(true)
    const isCurrent = () => latest.current.state.phase === phase && latest.current.state.talkId === talkId
    return takeTurn(api, { talkId, phase, ...turn }, { isCurrent }).then((answer) => {
      setWaiting(false)
      if (answer?.patch) latest.current.update(answer.patch)
      return answer
    })
  }
  function chooseReply(choice, inputMode = 'picture') {
    if (waiting) return
    if (!talkId) return update(localReply(choice, isExtra))
    sendTurn({ choice, inputMode })
  }
  function sayReply(text) {
    if (waiting || !talkId) return false
    const next = isExtra ? 'ending' : 'reply'
    return sendTurn({ text, inputMode: 'voice' }).then((answer) => {
      if (answer?.answered) setSpoken({ phase: next, text })
      return !answer || answer.answered
    })
  }
  const said = saidLine(state, phase, conversation, spoken)
  let title = tale.title
  if (phase === 'situation') title = tale.situation
  if (phase === 'act') title = '이때 어떻게 할까요?'
  if (phase === 'consequence' && outcome) title = outcome.title
  if (inDialogue) title = isEnding ? '이야기를 마쳤어요' : withFriend(friendName) + ' 나누는 이야기'
  const showActions = phase === 'act' || (phase === 'consequence' && !outcome)
  const afterChoice = (phase === 'consequence' || inDialogue) && outcome != null
  let expression = feeling
  if (phase === 'book' && page < 2) expression = 'neutral'
  if (afterChoice) expression = outcome.expression
  let gesture = phase === 'act' ? 'listen' : phase === 'consequence' ? 'nod' : 'speak'
  // Talk scenes: listen while the child chooses or speaks, then each line's face with speak (reply) or nod (ending).
  const face = inDialogue && outcome ? friendFace(state, phase, conversation, outcome.expression) : null
  if (face) ({ expression, gesture } = face)
  if (listening) gesture = 'listen'
  // One whole-body movement for the new face at a result, the friend's reply or the ending (storyTalk.nextEmote).
  const [emote, setEmote] = useState(null)
  useLayoutEffect(() => {
    setEmote((previous) => nextEmote(previous, phase, expression))
  }, [phase, expression])
  return (
    <Board
      title={title}
      voiceLine={phase === 'book' ? pages[page].replaceAll('{친구}', '숲 친구')
        : phase === 'situation' ? tale.explanation
        : phase === 'consequence' && outcome ? outcome.event + ' ' + outcome.line
        : phase === 'question' ? conversation.ask
        : isExtra ? conversation.again
        : phase === 'reply' || isEnding ? replyText : title}
      focusKey={phase + '-' + page}
      illustration={
        <TaleScene
          feeling={feeling}
          page={page}
          branch={phase === 'consequence' || inDialogue ? chosen : null}
          active={active}
        >
          <Portrait
            friend={friend}
            feeling={expression}
            active={active}
            gesture={gesture}
            actionKey={phase + '-' + page + (listening ? '-listen' : '')}
            emote={emote?.feeling}
            emoteKey={emote?.key}
            emoteNow={emote?.phase === phase}
          />
        </TaleScene>
      }
    >
      {phase === 'book' && (
        <>
          <p className="edu-story">
            {pages[page].replaceAll('{친구}', friend?.familiar || friendName)}
          </p>
          {page + 1 < pages.length ? (
            <Action onClick={() => update({ phase: 'book', bookPage: page + 1 })}>다음 장</Action>
          ) : (
            <Action onClick={() => update({ phase: 'situation' })}>장면 살펴보기</Action>
          )}
        </>
      )}
      {phase === 'situation' && (
        <>
          <p className="edu-story">
            {tale.explanation}
          </p>
          <Action onClick={() => update({ phase: 'act' })}>내가 해 보기</Action>
        </>
      )}
      {showActions && (
        <TaleActions
          actions={tale.actions}
          onChoose={(branch) => {
            if (walkId) api.pickStoryAction(walkId, branch)
            update({ phase: 'consequence', branch })
          }}
        />
      )}
      {phase === 'consequence' && outcome && (
        <>
          <p className="edu-story">
            {outcome.event}
          </p>
          <blockquote>“{outcome.line}”</blockquote>
          <Action onClick={() => update({ phase: 'question' })}>친구와 대화하기</Action>
          <button type="button" className="edu-link" onClick={() => update({ phase: 'act' })}>
            다른 방법 해 보기
          </button>
        </>
      )}
      {(phase === 'question' || isExtra) && (
        <StoryQuestion
          fact={conversation}
          isExtra={isExtra}
          active={active}
          waiting={waiting}
          onReply={chooseReply}
          onHeard={sayReply}
          onListening={setListening}
        />
      )}
      {(phase === 'reply' || isEnding) && (
        <>
          {said && <p className="edu-note">내가 한 말: {said}</p>}
          <p className="edu-story" role="status">
            {replyText}
          </p>
          <Action onClick={() => {
            if (phase === 'reply' && talkId) api.endTalk(talkId)
            onComplete()
          }}>산책 마무리하기</Action>
          {phase === 'reply' && (
            <button type="button" className="edu-link" onClick={() => update({ phase: 'extra' })}>
              조금 더 이야기하기
            </button>
          )}
        </>
      )}
    </Board>
  )
}
export function Lesson({ progress, onUpdate, onComplete, friend, topic, active = true }) {
  const feeling = topicId(topic),
    fact = FEELINGS[feeling],
    step = Number(progress.step) || 0
  const saved = progress.activity
  const state = saved?.step === step && saved?.topic === feeling ? saved : { step, topic: feeling }
  function update(values) {
    onUpdate({ activity: { ...state, ...values } })
  }
  function next() {
    update({ completed: true })
  }
  if (state.completed) {
    return (
      <Board title={step === 0 ? '감정 탐색을 마쳤어요' : '표정 거울을 마쳤어요'} illustration={<figure className="edu-figure"><Portrait friend={friend} feeling="neutral" active={active} /></figure>}>
        <Action onClick={() => onUpdate({ step: step + 1, activity: null })}>다음 학습 시작</Action>
      </Board>
    )
  }
  if (step === 0)
    return (
      <EmotionActivity
        fact={fact}
        feeling={feeling}
        friend={friend}
        state={state}
        update={update}
        expanded={progress.level === 'expand'}
        active={active}
        next={next}
        walkId={progress.walkId}
      />
    )
  if (step === 1)
    return (
      <MirrorActivity
        fact={fact}
        feeling={feeling}
        friend={friend}
        active={active}
        state={state}
        update={update}
        next={next}
        walkId={progress.walkId}
      />
    )
  return (
    <StoryActivity
      fact={fact}
      feeling={feeling}
      friend={friend}
      state={state}
      update={update}
      onComplete={onComplete}
      active={active}
      walkId={progress.walkId}
    />
  )
}
