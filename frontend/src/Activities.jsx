import React, { useEffect, useRef, useState, useId } from 'react'
import { startFacePreview } from './facePreview.js'
import { feelingPractice, PracticeObject } from './FeelingPractice.jsx'
import { PaintedFriend } from './PaintedFriend.jsx'
import './activities.css'
import { TaleActions, TaleScene } from './ForestTale.jsx'
import { forestTales } from './forestTales.js'

const FEELINGS = {
  joy: {
    label: '기쁨',
    word: '기뻐요',
    kin: '즐거워요',
    opposite: '슬퍼요',
    clue: '입꼬리가 위로 올라갔어요.',
    motion: '입꼬리를 살짝 올려 봐요.',
    ask: '친구에게 어떤 말을 건네 볼까요?',
    choices: ['같이 놀자!', '불러 줘서 고마워.'],
    replies: ['좋아! 종이비행기를 함께 날려 보자.', '나도 고마워. 같이 노니까 즐거워.'],
    again: '비행기를 어디로 날려 볼까요?',
    extra: ['하늘로!', '나무 쪽으로!'],
    ends: ['하늘을 향해 비행기를 날렸어요.', '나무 쪽으로 비행기를 날렸어요.'],
  },
  sad: {
    label: '슬픔',
    word: '슬퍼요',
    kin: '속상해요',
    opposite: '기뻐요',
    clue: '입꼬리가 아래로 내려갔어요.',
    motion: '입꼬리를 살짝 내려 봐요.',
    ask: '친구에게 어떤 말을 건네 볼까요?',
    choices: ['옆에 있어 줄게.', '같이 다시 쌓을까?'],
    replies: ['내 옆에 있어 줘서 고마워.', '좋아. 함께 쌓으면 힘이 날 것 같아.'],
    again: '다음에는 무엇을 해 볼까요?',
    extra: ['잠깐 쉬자.', '블록을 모으자.'],
    ends: ['둘이 나란히 앉아 잠깐 쉬었어요.', '둘이 천천히 블록을 모았어요.'],
  },
  surprise: {
    label: '놀람',
    word: '놀랐어요',
    kin: '깜짝 놀랐어요',
    opposite: '슬퍼요',
    clue: '눈과 입이 동그래졌어요.',
    motion: '입을 동그랗게 벌려 봐요.',
    ask: '친구에게 어떤 말을 건네 볼까요?',
    choices: ['나비가 있었구나!', '괜찮아?'],
    replies: ['응! 잎이 움직여서 깜짝 놀랐어.', '응, 괜찮아. 이제 천천히 보고 싶어.'],
    again: '나비를 어떻게 볼까요?',
    extra: ['여기서 보자.', '앉아서 보자.'],
    ends: ['둘은 서서 나비를 가만히 바라보았어요.', '둘은 나란히 앉아 나비를 보았어요.'],
  },
  anger: {
    label: '화남',
    word: '화나요',
    kin: '화가 나요',
    opposite: '기뻐요',
    clue: '눈썹이 가운데로 모였어요.',
    motion: '눈썹을 살짝 모아 봐요.',
    ask: '차례를 지키도록 어떤 말을 해 볼까요?',
    choices: ['지금은 내 차례야.', '우리 차례로 타자.'],
    replies: ['맞아. 내가 먼저 기다렸다고 알려 줄래.', '좋아. 차례를 지키자고 말해 볼래.'],
    again: '또 도움이 필요하면 어떻게 할까요?',
    extra: ['선생님께 말해요.', '잠깐 쉬어요.'],
    ends: ['선생님께 차례를 지키고 싶다고 말했어요.', '벤치에 앉아 잠깐 쉬었어요.'],
  },
}
const TOPIC_NAMES = {
  happy: 'joy',
  happiness: 'joy',
  기쁨: 'joy',
  즐거움: 'joy',
  행복: 'joy',
  sadness: 'sad',
  슬픔: 'sad',
  속상함: 'sad',
  surprised: 'surprise',
  놀람: 'surprise',
  angry: 'anger',
  화남: 'anger',
}
function topicId(topic) {
  for (const key of [topic?.id, topic?.label, topic?.name, topic]) {
    if (typeof key === 'string' && (FEELINGS[key] || TOPIC_NAMES[key]))
      return TOPIC_NAMES[key] || key
  }
  return 'joy'
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
function Arrow() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12h15m-6-6 6 6-6 6" />
    </svg>
  )
}
function Action({ children, ...props }) {
  return (
    <button type="button" className="edu-primary" {...props}>
      {children}
      <Arrow />
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
function EmotionCard({ feeling, alt = FEELINGS[feeling].clue }) {
  return (
    <img
      className="edu-emotion-card"
      src={import.meta.env.BASE_URL + 'art/cards/' + feeling + '.webp'}
      width="626"
      height="626"
      alt={alt}
      draggable={false}
    />
  )
}
function Portrait({ friend, feeling, gesture, actionKey, active = true }) {
  const kind = animalKind(friend)
  const clue = feeling === 'neutral' ? '편안하게 기다리고 있어요.' : FEELINGS[feeling].clue
  return (
    <PaintedFriend
      charm={friend?.charm}
      headwear={friend?.headwear}
      kind={kind}
      src={friend?.image || import.meta.env.BASE_URL + 'art/' + kind + '.webp'}
      label={`${friend?.name || '숲속 친구'}의 얼굴. ${clue}`}
      {...{ feeling, gesture, actionKey, active }}
    />
  )
}
function Board({ kicker, title, description, illustration, children, focusKey = title }) {
  const heading = useRef(null)
  const id = useId()
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [focusKey])
  const prompt = (
    <div className="edu-header">
      {kicker && <span className="edu-kicker">
        <i aria-hidden="true" />
        {kicker}
      </span>}
      <h1 id={id} tabIndex="-1" ref={heading}>
        {title}
      </h1>
      {description && <p>{description}</p>}
    </div>
  )
  return (
    <section
      className={'edu-board ' + (illustration ? 'edu-spread' : 'edu-preparation')}
      aria-labelledby={id}
    >
      {illustration ? (
        <>
          <div className="edu-paper">
            {prompt}
            <div className="edu-task">{children}</div>
          </div>
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
const PLACEMENT = [
  {
    target: 'joy',
    alternatives: ['joy', 'sad'],
    introduction: '기쁨은 반가운 일이 생겼을 때 느끼는 마음이에요.',
    example: '기다리던 친구가 놀러 왔어요. 반가워서 빙긋 웃었어요.',
    prompt: '기쁜 얼굴을 찾아볼까요?',
    hint: '웃으면서 입꼬리가 올라간 얼굴을 찾아봐요.',
  },
  {
    target: 'surprise',
    alternatives: ['anger', 'surprise'],
    introduction: '놀람은 예상하지 못한 일이 생겼을 때 드는 마음이에요.',
    example: '풀잎 뒤에서 나비가 날아올랐어요. 깜짝 놀라 눈이 동그래졌어요.',
    prompt: '놀란 얼굴을 찾아볼까요?',
    hint: '눈과 입이 동그래진 얼굴을 찾아봐요.',
  },
]
export function LevelTest({ progress, onUpdate, onDone }) {
  const state = progress.placement || {}
  const idx = state.index === 1 ? 1 : 0
  const item = PLACEMENT[idx]
  const solved = state.choice === item.target
  function choose(value) {
    if (solved) return
    onUpdate({
      placement: {
        ...state,
        index: idx,
        choice: value,
        usedHint: Boolean(state.usedHint) || value !== item.target,
      },
    })
  }
  function advance() {
    if (!solved) return
    if (idx === 0) onUpdate({ placement: { index: 1, usedHint: Boolean(state.usedHint) } })
    else onDone(state.usedHint ? 'basic' : 'expand')
  }
  if (!state.introduced && !state.choice) {
    return (
      <Board
        kicker={'준비 산책 · ' + (idx + 1) + ' / 2'}
        title={idx === 0 ? '기쁨을 만나 봐요' : '놀람을 만나 봐요'}
        description={item.introduction}
        illustration={
          <figure className="edu-figure">
            <EmotionCard feeling={item.target} />
          </figure>
        }
      >
        <p className="edu-story">
          {item.example}
        </p>
        <Action onClick={() => onUpdate({ placement: { ...state, index: idx, introduced: true } })}>
          얼굴 찾아보기
        </Action>
      </Board>
    )
  }
  return (
    <Board
      kicker={'준비 산책 · ' + (idx + 1) + ' / 2'}
      title={item.prompt}
      description="그림을 하나 눌러 주세요. 천천히 골라도 돼요."
    >
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
function EmotionActivity({ fact, feeling, friend, state, update, next, expanded, active }) {
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
      <Board
        title={fact.label}
        description={practice.meaning}
        illustration={card}
      >
        <p className="edu-prompt">
          {practice.example}
        </p>
        <p className="edu-note">
          {fact.clue}
        </p>
        <Action onClick={() => update({ practicePhase: 'experiment' })}>{practice.nextLabel}</Action>
      </Board>
    )
  }
  if (phase === 'experiment' || phase === 'discovery') {
    const revealed = phase === 'discovery'
    return (
      <Board
        title={revealed ? practice.afterTitle : practice.beforeTitle}
        description={revealed ? practice.reaction : practice.before}
        illustration={
          <div className="edu-figure practice-field">
            <figure className="practice-field-friend">
              <Portrait
                friend={friend}
                feeling={revealed ? feeling : 'neutral'}
                active={active}
                gesture={revealed ? (cueFound ? 'nod' : 'model') : 'listen'}
                actionKey={state.cue || phase}
              />
              <figcaption>{friend.name}</figcaption>
            </figure>
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
                  onClick={() => update({ cue })}
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
  // Rotate the answer position by topic while keeping it stable on repeat visits.
  if (feeling === 'joy' || feeling === 'surprise') words.unshift(words.pop())
  const selected = Array.isArray(state.selected)
    ? state.selected.filter((x) => words.includes(x))
    : []
  const done = Boolean(state.solved)
  function pick(word) {
    if (done) return
    const current = expanded
      ? selected.includes(word)
        ? selected.filter((x) => x !== word)
        : [...selected, word]
      : [word]
    update({ selected: current, feedback: '' })
  }
  function submit() {
    const correct =
      selected.length > 0 && selected.every((word) => word === fact.word || word === fact.kin)
    update({
      solved: correct,
      feedback: correct
        ? expanded
          ? fact.word + ' ' + fact.kin + ' 비슷한 마음을 나타내요.'
          : fact.clue
        : '그림을 다시 볼까요? ' + fact.clue,
    })
  }
  return (
    <Board
      title="어떤 마음일까요?"
      description={
        expanded
          ? '그림에 어울리는 말을 골라요. 두 개를 골라도 돼요.'
          : '그림에 어울리는 마음을 하나 골라요.'
      }
      illustration={card}
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
        <Action onClick={submit} disabled={selected.length === 0}>
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

function MicrophonePermission() {
  const [status, setStatus] = useState('idle')

  async function check() {
    setStatus('waiting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      // Release even when the permission prompt finishes after the child leaves.
      stream.getTracks().forEach((track) => track.stop())
      setStatus('granted')
    } catch {
      setStatus('unavailable')
    }
  }

  return (
    <>
      <button
        type="button"
        className="edu-secondary"
        onClick={check}
        disabled={status === 'waiting' || status === 'granted'}
      >
        {status === 'unavailable' ? '마이크 권한 다시 확인' : '마이크 권한 확인'}
      </button>
      <span className="edu-mic-status" role="status">
        {status === 'waiting' && '마이크 권한을 확인하고 있어요.'}
        {status === 'granted' && '권한을 확인하고 마이크를 껐어요.'}
        {status === 'unavailable' && '마이크를 사용할 수 없어요. 그대로 산책해도 돼요.'}
      </span>
    </>
  )
}

function MirrorActivity({ fact, feeling, friend, active, state, update, next }) {
  const camera = useCamera(active)
  const [demonstration, setDemonstration] = useState(0)
  const ways = feelingPractice[feeling].expression
  if (state.mirrorPhase === 'express' || state.mirrorPhase === 'response') {
    const chosen = state.mirrorPhase === 'response' ? ways[state.mirrorChoice] : null
    return (
      <Board
        kicker="둘째 걸음 · 마음 전하기"
        title={chosen ? '친구가 이렇게 답했어요' : '내 마음을 전해 봐요'}
        description={chosen ? chosen.practice : '말풍선이나 몸짓 중 편한 방법을 하나 골라요.'}
        illustration={
          <figure className="edu-figure">
            <Portrait
              friend={friend}
              feeling={feeling}
              active={active}
              gesture={chosen ? 'speak' : 'listen'}
              actionKey={state.mirrorPhase}
            />
            <figcaption>{friend.name}</figcaption>
          </figure>
        }
      >
        {chosen ? (
          <>
            <p className="edu-prompt">
              {chosen.answer}
            </p>
            <Action onClick={next}>동화 속으로</Action>
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
                <Arrow />
              </button>
            ))}
          </div>
        )}
      </Board>
    )
  }
  return (
    <Board
      kicker="둘째 걸음 · 표정 연습"
      title="표정을 함께 해 볼까요?"
      description="그림을 살펴봐요. 따라 하고 싶으면 천천히 해 봐요."
      illustration={
        <figure className="edu-figure">
          <Portrait
            friend={friend}
            feeling={feeling}
            active={active}
            gesture="model"
            actionKey={demonstration}
          />
          <figcaption className="edu-model-caption">
            {fact.label} 표정
            <button
              type="button"
              className="edu-replay"
              onClick={() => setDemonstration((n) => n + 1)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 10a8 8 0 1 1 1.8 7M4 4v6h6" />
              </svg>
              표정 다시 보기
            </button>
          </figcaption>
        </figure>
      }
    >
      <p className="edu-prompt">
        {fact.motion}
      </p>
      {camera.status === 'on' && (
        <div className="edu-camera">
          <video ref={camera.video} muted autoPlay playsInline aria-label="이 기기의 내 모습" />
        </div>
      )}
      <div className="edu-device-options">
        {camera.status === 'on' || camera.status === 'waiting' ? (
          <button className="edu-secondary" type="button" onClick={camera.off}>
            {camera.status === 'waiting' ? '카메라 요청 취소' : '카메라 끄기'}
          </button>
        ) : (
          <button className="edu-secondary" type="button" onClick={camera.start}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <rect x="3" y="7" width="18" height="13" rx="3" />
              <path d="m7 7 2-3h6l2 3" />
              <circle cx="12" cy="13" r="3" />
            </svg>
            {camera.status === 'unavailable' ? '카메라 다시 켜기' : '카메라로 내 모습 보기'}
          </button>
        )}
        {active && <MicrophonePermission />}
      </div>
      <p role="status" className="edu-note">
        {camera.status === 'on'
          ? camera.facePresent
            ? '얼굴이 화면에 보여요.'
            : '내 모습은 이 화면에만 보여요.'
          : camera.status === 'waiting'
            ? '카메라를 여는 중이에요. 그림만 보고 넘어가도 돼요.'
            : camera.status === 'unavailable'
              ? '카메라를 열 수 없어요. 그림만 보고 연습해도 돼요.'
              : '카메라 없이 그림만 봐도 돼요.'}
      </p>
      <Action
        onClick={() => {
          camera.off()
          update({ mirrorPhase: 'express' })
        }}
      >
        마음 전해 보기
      </Action>
    </Board>
  )
}
const pictograms = {
  plane: <path d="m2 12 20-8-7 17-4-7-9-2Zm9 2 10-9" />,
  heart: <path d="M20 5c-3-2-6-1-8 2-2-3-5-4-8-2-4 3-2 8 2 11l6 5 6-5c4-3 6-8 2-11Z" />,
  cloud: <path d="M6 18a4 4 0 0 1-1-8 6 6 0 0 1 11.5-1A4.5 4.5 0 1 1 18 18Z" />,
  tree: <path d="M12 2 5 11h4l-6 7h8v4h2v-4h8l-6-7h4Z" />,
  bench: (
    <>
      <path d="M3 15h18v3H3zM5 18v3m14-3v3M5 6h14v5H5zM7 11v4m10-4v4" />
    </>
  ),
  blocks: (
    <>
      <rect x="2" y="13" width="9" height="8" rx="1.5" />
      <rect x="13" y="13" width="9" height="8" rx="1.5" />
      <path d="m12 2 5 8H7Z" />
    </>
  ),
  butterfly: (
    <>
      <path d="M12 13C3-2-3 10 8 13c-7 0-5 10 2 4l2-3 2 3c7 6 9-4 2-4C27 10 21-2 12 13Z" />
      <path d="M12 13v5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12q10-14 20 0-10 14-20 0Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  hand: (
    <path d="M6 13V6a1.5 1.5 0 0 1 3 0v5-7a1.5 1.5 0 0 1 3 0v7-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v5.5l1-2a1.6 1.6 0 0 1 3 1.3l-3.4 7.5a6 6 0 0 1-5.5 3.6h-1a7 7 0 0 1-6-4l-3-5.4c-1.2-2.1 1-3.8 2.4-2Z" />
  ),
  talk: <path d="M21 11a8 8 0 0 1-8 8H9l-5 3 1-5A8 8 0 1 1 21 11Zm-14 0h8" />,
}
const replyIcons = {
  joy: ['plane', 'heart', 'cloud', 'tree'],
  sad: ['heart', 'blocks', 'bench', 'blocks'],
  surprise: ['butterfly', 'heart', 'eye', 'bench'],
  anger: ['hand', 'talk', 'talk', 'bench'],
}
function Pictogram({ name }) {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {pictograms[name]}
    </svg>
  )
}

function StoryQuestion({ fact, feeling, isExtra, onReply }) {
  return (
    <>
      <p className="edu-prompt">{isExtra ? fact.again : fact.ask}</p>
      <div className="edu-choices" role="group" aria-label="친구에게 보낼 말">
        {(isExtra ? fact.extra : fact.choices).map((text, index) => (
          <button key={text} type="button" className="edu-reply" onClick={() => onReply(index)}>
            <span className="edu-picto">
              <Pictogram name={replyIcons[feeling][(isExtra ? 2 : 0) + index]} />
            </span>
            <span>{text}</span>
            <Arrow />
          </button>
        ))}
      </div>
    </>
  )
}

function StoryActivity({ fact, feeling, friend, state, update, onComplete, active }) {
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
  const conversation = outcome ? tale.talk : fact
  const isExtra = phase === 'extra'
  const isEnding = phase === 'ending'
  const lines = isEnding ? conversation.ends : conversation.replies
  const pickedLine = isEnding ? state.extraChoice : state.choice
  const reply = lines[pickedLine]
  // Earlier sessions may have finished the exchange without selecting a line.
  const replyText = reply ? (isEnding ? reply : '“' + reply + '”') : '친구와 이야기를 나눴어요.'
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
  return (
    <Board
      kicker={
        phase === 'book'
          ? '숲속 동화 · ' + (page + 1) + ' / ' + pages.length
          : '셋째 걸음 · 이야기 나누기'
      }
      title={title}
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
            gesture={phase === 'act' ? 'listen' : phase === 'consequence' ? 'nod' : 'speak'}
            actionKey={phase + '-' + page}
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
          onChoose={(branch) => update({ phase: 'consequence', branch })}
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
          feeling={feeling}
          onReply={(choice) =>
            update(isExtra ? { phase: 'ending', extraChoice: choice } : { phase: 'reply', choice })
          }
        />
      )}
      {(phase === 'reply' || isEnding) && (
        <>
          <p className="edu-story" role="status">
            {replyText}
          </p>
          <Action onClick={onComplete}>산책 마무리하기</Action>
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
    onUpdate({ step: step + 1, activity: null })
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
    />
  )
}
