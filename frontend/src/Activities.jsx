import React, { useEffect, useRef, useState, useId } from 'react'
import { startFacePreview } from './facePreview.js'
import './activities.css'

const FEELINGS = {
  joy: {
    label: '기쁨',
    word: '기뻐요',
    kin: '즐거워요',
    opposite: '슬퍼요',
    clue: '입꼬리가 위로 올라갔어요.',
    motion: '입꼬리를 살짝 올려 봐요.',
    scene: '친구가 같이 종이비행기를 날리자고 했어요.',
    line: '함께 놀게 돼서 기뻐!',
    ask: '친구에게 어떤 말을 건네 볼까요?',
    choices: ['같이 놀자!', '불러 줘서 고마워.'],
    replies: ['좋아! 종이비행기를 함께 날려 보자.', '나도 고마워. 같이 노니까 즐거워.'],
    again: '비행기를 어디로 날려 볼까요?',
    extra: ['하늘로!', '나무 쪽으로!'],
    ends: ['하늘을 향해 비행기를 날렸어요.', '나무 쪽으로 비행기를 날렸어요.'],
    prop: 'plane',
    swatch: '#f2dba0',
  },
  sad: {
    label: '슬픔',
    word: '슬퍼요',
    kin: '속상해요',
    opposite: '기뻐요',
    clue: '입꼬리가 아래로 내려갔어요.',
    motion: '입꼬리를 살짝 내려 봐요.',
    scene: '공들여 쌓은 나무 블록이 와르르 무너졌어요.',
    line: '열심히 쌓았는데 무너져서 속상해.',
    ask: '친구에게 어떤 말을 건네 볼까요?',
    choices: ['옆에 있어 줄게.', '같이 다시 쌓을까?'],
    replies: ['내 옆에 있어 줘서 고마워.', '좋아. 함께 쌓으면 힘이 날 것 같아.'],
    again: '다음에는 무엇을 해 볼까요?',
    extra: ['잠깐 쉬자.', '블록을 모으자.'],
    ends: ['둘이 나란히 앉아 잠깐 쉬었어요.', '둘이 천천히 블록을 모았어요.'],
    prop: 'blocks',
    swatch: '#c4dfed',
  },
  surprise: {
    label: '놀람',
    word: '놀랐어요',
    kin: '깜짝 놀랐어요',
    opposite: '슬퍼요',
    clue: '눈과 입이 동그래졌어요.',
    motion: '입을 동그랗게 벌려 봐요.',
    scene: '화단을 살펴보는데 나뭇잎 뒤에서 나비가 날아올랐어요.',
    line: '나비가 갑자기 나타나서 깜짝 놀랐어!',
    ask: '친구에게 어떤 말을 건네 볼까요?',
    choices: ['나비가 있었구나!', '괜찮아?'],
    replies: ['응! 잎이 움직여서 깜짝 놀랐어.', '응, 괜찮아. 이제 천천히 보고 싶어.'],
    again: '나비를 어떻게 볼까요?',
    extra: ['여기서 보자.', '앉아서 보자.'],
    ends: ['둘은 서서 나비를 가만히 바라보았어요.', '둘은 나란히 앉아 나비를 보았어요.'],
    prop: 'butterfly',
    swatch: '#e1d2e3',
  },
  anger: {
    label: '화남',
    word: '화나요',
    kin: '화가 나요',
    opposite: '기뻐요',
    clue: '눈썹이 가운데로 모였어요.',
    motion: '눈썹을 살짝 모아 봐요.',
    scene: '미끄럼틀에서 기다리는데 다른 친구가 먼저 올라갔어요.',
    line: '내 차례였는데 먼저 가서 화가 나.',
    ask: '차례를 지키도록 어떤 말을 해 볼까요?',
    choices: ['지금은 내 차례야.', '우리 차례로 타자.'],
    replies: ['맞아. 내가 먼저 기다렸다고 알려 줄래.', '좋아. 차례를 지키자고 말해 볼래.'],
    again: '또 도움이 필요하면 어떻게 할까요?',
    extra: ['선생님께 말해요.', '잠깐 쉬어요.'],
    ends: ['선생님께 차례를 지키고 싶다고 말했어요.', '벤치에 앉아 잠깐 쉬었어요.'],
    prop: 'slide',
    swatch: '#eccfb6',
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
function Face({ kind = 'lion', feeling = 'joy' }) {
  const fur = { lion: '#f4c261', rabbit: '#f8eddc', bear: '#bd8a60' }[kind] || '#f4c261'
  const dark = '#473b32'
  return (
    <g>
      {kind === 'lion' && (
        <path
          fill="#ce8947"
          d="M44 94Q29 82 44 68Q39 49 57 47Q59 30 78 35Q90 20 103 33Q121 26 131 43Q151 40 155 60Q174 69 163 87Q177 103 161 116Q163 135 143 139Q134 158 117 149Q101 162 88 149Q71 156 60 140Q40 142 41 123Q25 109 44 94Z"
        />
      )}
      {kind === 'rabbit' ? (
        <g fill={fur} stroke="#c8a788" strokeWidth="2">
          <ellipse cx="78" cy="49" rx="15" ry="39" transform="rotate(-11 78 49)" />
          <ellipse cx="123" cy="49" rx="15" ry="39" transform="rotate(11 123 49)" />
          <path
            d="M78 62q-11-28-8-37m48 37q11-28 8-37"
            stroke="#e8bba9"
            strokeWidth="9"
            strokeLinecap="round"
          />
        </g>
      ) : (
        <g fill={fur} stroke={kind === 'lion' ? '#b68043' : '#936748'} strokeWidth="2.4">
          <circle cx="62" cy="65" r="15" />
          <circle cx="139" cy="65" r="15" />
          <g fill="#c38f73" stroke="none">
            <circle cx="62" cy="65" r="8" />
            <circle cx="139" cy="65" r="8" />
          </g>
        </g>
      )}
      <path
        d="M48 100c0-31 20-51 52-51s53 20 53 51c0 29-22 46-53 46s-52-17-52-46Z"
        fill={fur}
        stroke={kind === 'rabbit' ? '#c8a788' : 'none'}
        strokeWidth="2"
      />
      <g fill="#dc9983" opacity=".66">
        <ellipse cx="69" cy="110" rx="8" ry="4.5" />
        <ellipse cx="132" cy="110" rx="8" ry="4.5" />
      </g>
      <g fill={dark}>
        {feeling === 'joy' ? (
          <g fill="none" stroke={dark} strokeWidth="4" strokeLinecap="round">
            <path d="M73 99q6-9 12 0m31 0q6-9 12 0" />
          </g>
        ) : (
          <>
            <ellipse
              cx="79"
              cy="98"
              rx={feeling === 'surprise' ? 5 : 3.5}
              ry={feeling === 'surprise' ? 7 : 5}
            />
            <ellipse
              cx="122"
              cy="98"
              rx={feeling === 'surprise' ? 5 : 3.5}
              ry={feeling === 'surprise' ? 7 : 5}
            />
            <g stroke={dark} strokeWidth="3.5" fill="none" strokeLinecap="round">
              <path
                d={
                  feeling === 'sad'
                    ? 'M71 90q6 0 12-5m34 0q6 5 12 5'
                    : feeling === 'anger'
                      ? 'M71 85l13 7m32 0 13-7'
                      : 'M72 85q7-7 13-3m31 0q6-4 13 3'
                }
              />
            </g>
          </>
        )}
        <path d="M95 105q5-4 11 0l-4 5q-2 2-4-1Z" />
      </g>
      {feeling === 'surprise' ? (
        <ellipse cx="101" cy="121" rx="6" ry="8" fill={dark} />
      ) : (
        <path
          d={
            feeling === 'joy'
              ? 'M90 116q11 16 22 0'
              : feeling === 'sad'
                ? 'M90 125q11-13 21 0'
                : 'M93 119q7-2 15 0'
          }
          fill="none"
          stroke={dark}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      )}
      <g fill="#644c3c" opacity=".58">
        <circle cx="83" cy="109" r="1.2" />
        <circle cx="79" cy="113" r="1.2" />
        <circle cx="117" cy="109" r="1.2" />
        <circle cx="121" cy="113" r="1.2" />
      </g>
    </g>
  )
}
function StoryProp({ type }) {
  if (type === 'plane')
    return (
      <g stroke="#698a94" strokeWidth="2.2" strokeLinejoin="round">
        <path d="M232 75l40-14-14 29-10-10-11 3 3-7Z" fill="#fff8e7" />
        <path d="m241 77 24-12-18 16" fill="none" />
        <path d="M218 90q11-1 14-10m-22 13 3-1" fill="none" strokeDasharray="3 4" />
      </g>
    )
  if (type === 'blocks')
    return (
      <g stroke="#8a7960" strokeWidth="1.5">
        <rect
          x="221"
          y="127"
          width="24"
          height="24"
          rx="3"
          fill="#f4cc86"
          transform="rotate(-10 233 139)"
        />
        <rect x="244" y="137" width="22" height="20" rx="3" fill="#93b7ab" />
        <path d="m235 126 13-22 10 22Z" fill="#df9981" />
      </g>
    )
  if (type === 'butterfly')
    return (
      <g transform="translate(250 74) rotate(-15)">
        <path
          d="M0 6c-29-24-28 16-3 6-17 11-8 23 4 4 11 19 23 4 5-5 26 4 22-31-4-8"
          fill="#edc26c"
          stroke="#a77846"
          strokeWidth="2"
        />
        <path d="M1 3v13" stroke="#666343" strokeWidth="4" strokeLinecap="round" />
      </g>
    )
  return (
    <g fill="none" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
      <path d="M218 153l13-40h14l22 39" stroke="#719b8c" />
      <path d="m242 119 14 28q5 8 16 7" stroke="#db996e" strokeWidth="6" />
      <path d="m225 135 9 0m-12 9h9" stroke="#719b8c" />
    </g>
  )
}
function Portrait({ friend, feeling, scene = false, small = false }) {
  const id = useId()
  const data = FEELINGS[feeling]
  if (small)
    return (
      <svg viewBox="25 0 150 159" aria-hidden="true">
        <Face kind={animalKind(friend)} feeling={feeling} />
      </svg>
    )
  return (
    <svg className="edu-portrait" viewBox="0 0 300 213" role="img" aria-labelledby={id}>
      <title id={id}>
        {friend?.name || '숲속 친구'}의 얼굴. {data.clue}
      </title>
      <rect width="300" height="213" rx="20" fill={scene ? '#dfedf0' : '#e7f1ee'} />
      <path d="M0 153q71-54 159-14t141 4v70H0Z" fill="#c9decd" />
      <path d="M0 177q92 3 158-19t142 4v51H0Z" fill="#b6d1b9" />
      <g fill="#f9f9ec" opacity=".9">
        <path d="M23 48q1-9 10-9 5-13 16-7 9-3 14 9 8-1 11 7Z" />
        <path d="M217 38q1-8 9-8 4-8 13-5 7-1 10 6 8 0 10 7Z" />
      </g>
      <g fill="none" stroke="#759d7b" strokeWidth="2.4" strokeLinecap="round">
        <path d="m18 176-2-6m4 7 4-5m255-7 1-6m-4 6-3-4m-35 34 4-4" />
      </g>
      <path
        d="M65 213q0-49 67-56c45-4 71 21 76 56Z"
        fill={{ lion: '#edb85b', rabbit: '#f4e8d5', bear: '#ba8660' }[animalKind(friend)]}
      />
      <path d="m104 166 45 47h12l-48-52Z" fill="#ae865c" />
      <g transform="translate(26 6) scale(1.07)">
        <Face kind={animalKind(friend)} feeling={feeling} />
      </g>
      <path
        d="m94 161 39 16 41-16-13 21-19 3-14 15-15-11 6-10Z"
        fill="#769873"
        stroke="#65866b"
        strokeWidth="1.5"
      />
      {scene && <StoryProp type={data.prop} />}
    </svg>
  )
}
function Board({ kicker, title, description, children, focusKey = title }) {
  const heading = useRef(null)
  const id = useId()
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
  }, [focusKey])
  return (
    <section className="edu-board" aria-labelledby={id}>
      <div className="edu-header">
        <span className="edu-kicker">
          <i aria-hidden="true" />
          {kicker}
        </span>
        <h1 id={id} tabIndex="-1" ref={heading}>
          {title}
        </h1>
        {description && <p data-read-aloud>{description}</p>}
      </div>
      {children}
    </section>
  )
}
const PLACEMENT = [
  {
    target: 'joy',
    alternatives: ['joy', 'sad'],
    prompt: '기쁜 얼굴을 찾아볼까요?',
    hint: '웃으면서 입꼬리가 올라간 얼굴을 찾아봐요.',
  },
  {
    target: 'surprise',
    alternatives: ['anger', 'surprise'],
    prompt: '놀란 얼굴을 찾아볼까요?',
    hint: '눈과 입이 동그래진 얼굴을 찾아봐요.',
  },
]
export function LevelTest({ progress, onUpdate, onDone, friend }) {
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
            <Portrait friend={friend} feeling={key} />
            {state.choice === key && <span className="edu-picture-check" aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
      <div className="edu-action-row">
        <p role="status" data-read-aloud>
          {solved ? '찾았어요! ' + FEELINGS[item.target].clue : state.choice ? item.hint : ''}
        </p>
        {solved && (
          <Action onClick={advance}>{idx === 0 ? '다음 얼굴 보기' : '학습 시작하기'}</Action>
        )}
      </div>
    </Board>
  )
}
function EmotionActivity({ fact, feeling, friend, state, update, next, expanded }) {
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
      kicker="첫째 걸음 · 감정 그림"
      title="어떤 마음일까요?"
      description={
        expanded
          ? '그림에 어울리는 말을 골라요. 두 개를 골라도 돼요.'
          : '그림에 어울리는 마음을 하나 골라요.'
      }
    >
      <div className="edu-split">
        <figure className="edu-figure">
          <Portrait friend={friend} feeling={feeling} />
          <figcaption>{friend?.name || '숲속 친구'}의 표정</figcaption>
        </figure>
        <div className="edu-task">
          <div
            className={expanded ? 'edu-choices edu-multiple' : 'edu-choices'}
            role="group"
            aria-label="마음 낱말"
          >
            {words.map((w) => (
              <Choice
                key={w}
                selected={selected.includes(w)}
                disabled={done}
                onClick={() => pick(w)}
              >
                {w}
              </Choice>
            ))}
          </div>
          <p role="status" className="edu-feedback" data-read-aloud>
            {state.feedback}
          </p>
          {done ? (
            <Action onClick={next}>표정 연습으로</Action>
          ) : (
            <Action onClick={submit} disabled={selected.length === 0}>
              선택 확인하기
            </Action>
          )}
        </div>
      </div>
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
function MirrorActivity({ fact, feeling, friend, active, next }) {
  const camera = useCamera(active)
  return (
    <Board
      kicker="둘째 걸음 · 표정 연습"
      title="표정을 함께 해 볼까요?"
      description="그림을 살펴봐요. 따라 하고 싶으면 천천히 해 봐요."
    >
      <div className="edu-split">
        <figure className="edu-figure">
          <Portrait friend={friend} feeling={feeling} />
          <figcaption>{fact.label} 표정</figcaption>
        </figure>
        <div className="edu-task">
          <p className="edu-prompt" data-read-aloud>
            {fact.motion}
          </p>
          {camera.status === 'on' && (
            <div className="edu-camera">
              <video ref={camera.video} muted autoPlay playsInline aria-label="이 기기의 내 모습" />
            </div>
          )}
          <div className="edu-camera-row">
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
          </div>
          <p role="status" className="edu-note" data-read-aloud>
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
              next()
            }}
          >
            이야기로 가기
          </Action>
        </div>
      </div>
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
  mic: (
    <>
      <rect x="9" y="2" width="6" height="13" rx="3" />
      <path d="M5 11v1a7 7 0 0 0 14 0v-1m-7 8v3m-4 0h8" />
    </>
  ),
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

function VoiceAnswer({ active, onCancel, onAccept }) {
  const [stage, setStage] = useState('ready')
  const [url, setUrl] = useState('')
  const generation = useRef(0)
  const media = useRef(null)
  const recorder = useRef(null)
  const playback = useRef(null)
  const clipUrl = useRef('')
  const limit = useRef(null)

  function release() {
    generation.current += 1
    clearTimeout(limit.current)
    const capture = recorder.current
    if (capture) {
      capture.ondataavailable = null
      capture.onstop = null
      capture.onerror = null
      if (capture.state !== 'inactive') capture.stop()
    }
    recorder.current = null
    media.current?.getTracks().forEach((track) => track.stop())
    media.current = null
    playback.current?.pause()
    if (clipUrl.current) URL.revokeObjectURL(clipUrl.current)
    clipUrl.current = ''
  }
  function reset(nextStage = 'ready') {
    release()
    setUrl('')
    setStage(nextStage)
  }
  useEffect(() => {
    function interrupt() {
      reset()
    }
    function visibility() {
      if (document.hidden) interrupt()
    }
    if (!active) interrupt()
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pagehide', interrupt)
    window.addEventListener('blur', interrupt)
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pagehide', interrupt)
      window.removeEventListener('blur', interrupt)
      release()
    }
  }, [active])

  async function start() {
    if (!active) return
    reset('waiting')
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStage('unavailable')
      return
    }
    const token = generation.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      if (token !== generation.current || document.hidden) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      media.current = stream
      const capture = new MediaRecorder(stream)
      recorder.current = capture
      const chunks = []
      capture.ondataavailable = (event) => {
        if (event.data.size && token === generation.current) chunks.push(event.data)
      }
      capture.onerror = () => {
        if (token === generation.current) reset('unavailable')
      }
      capture.onstop = () => {
        if (token !== generation.current) return
        clearTimeout(limit.current)
        stream.getTracks().forEach((track) => track.stop())
        media.current = null
        recorder.current = null
        if (chunks.length === 0) {
          reset('unavailable')
          return
        }
        const clip = new Blob(chunks, { type: capture.mimeType || chunks[0].type })
        clipUrl.current = URL.createObjectURL(clip)
        setUrl(clipUrl.current)
        setStage('review')
      }
      capture.start()
      setStage('recording')
      // Bound the temporary buffer if a recording is left unattended.
      limit.current = window.setTimeout(() => {
        if (capture.state === 'recording') capture.stop()
      }, 120000)
    } catch {
      if (token === generation.current) reset('unavailable')
    }
  }
  function finishRecording() {
    if (recorder.current?.state === 'recording') {
      setStage('finishing')
      recorder.current.stop()
    }
  }
  let notice = '내 목소리는 여기에서만 들어요. 답하기를 누르면 녹음이 지워져요.'
  if (stage === 'waiting') notice = '마이크를 여는 중이에요.'
  if (stage === 'recording') notice = '말해 보세요. 다 말하면 녹음을 마쳐요.'
  if (stage === 'unavailable') notice = '마이크를 쓸 수 없어요. 그림으로도 답할 수 있어요.'
  if (stage === 'review') notice = '내 목소리를 들어볼 수 있어요.'
  if (stage === 'finishing') notice = '내 목소리를 준비하고 있어요.'
  return (
    <div
      className="edu-voice"
      data-mic-active={
        ['waiting', 'recording', 'finishing', 'review'].includes(stage) ? '' : undefined
      }
    >
      <p className="edu-note" role="status" data-read-aloud>
        {notice}
      </p>
      {(stage === 'ready' || stage === 'unavailable') && (
        <button type="button" className="edu-secondary" onClick={start}>
          <Pictogram name="mic" />
          {stage === 'ready' ? '녹음 시작' : '마이크 다시 켜기'}
        </button>
      )}
      {stage === 'recording' && (
        <button className="edu-primary" type="button" onClick={finishRecording}>
          녹음 마치기
        </button>
      )}
      {stage === 'review' && (
        <>
          <audio
            ref={playback}
            aria-label="녹음한 내 목소리"
            controls
            preload="metadata"
            src={url}
            onError={() => reset('unavailable')}
          />
          <Action
            onClick={() => {
              release()
              onAccept()
            }}
          >
            이 목소리로 답하기
          </Action>
          <button className="edu-link" type="button" onClick={start}>
            지우고 다시 녹음하기
          </button>
        </>
      )}
      <button
        className="edu-link"
        type="button"
        onClick={() => {
          release()
          onCancel()
        }}
      >
        그림으로 답하기
      </button>
    </div>
  )
}
function StoryQuestion({ fact, feeling, isExtra, onReply, active }) {
  const [voice, setVoice] = useState(false)
  return (
    <>
      <p className="edu-prompt" data-read-aloud>
        {isExtra ? fact.again : fact.ask}
      </p>
      {voice ? (
        <VoiceAnswer
          active={active}
          onCancel={() => setVoice(false)}
          onAccept={() => onReply(null, true)}
        />
      ) : (
        <>
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
          <button type="button" className="edu-link" onClick={() => setVoice(true)}>
            <Pictogram name="mic" />
            목소리로 답하기
          </button>
        </>
      )}
    </>
  )
}

function StoryActivity({ fact, feeling, friend, state, update, onComplete, active }) {
  const phase = state.phase || 'read'
  const isExtra = phase === 'extra'
  const isQuestion = phase === 'question' || isExtra
  const caption = {
    read: '이야기 한 장',
    question: '친구의 질문',
    reply: '친구의 대답',
    extra: '친구의 질문',
    ending: '이야기 마무리',
  }[phase]
  const voiceReply = phase === 'ending' ? state.extraVoice : state.voice
  const reply =
    phase === 'ending' ? fact.ends[state.extraChoice ?? 0] : fact.replies[state.choice ?? 0]
  const voiceSummary = {
    joy: '종이비행기 이야기에 내 목소리로 답했어요.',
    sad: '블록 이야기에 내 목소리로 답했어요.',
    surprise: '나비 이야기에 내 목소리로 답했어요.',
    anger: '미끄럼틀 이야기에 내 목소리로 답했어요.',
  }
  const name = friend?.name || '숲속 친구'
  return (
    <Board
      kicker="셋째 걸음 · 이야기와 대화"
      focusKey={phase}
      title={
        phase === 'read'
          ? '작은 이야기를 읽어요'
          : phase === 'ending'
            ? '이야기를 마쳤어요'
            : withFriend(name) + ' 나누는 이야기'
      }
    >
      <div className="edu-split">
        <figure className="edu-figure">
          <Portrait friend={friend} feeling={feeling} scene />
          <figcaption>
            {name}의 {fact.label} 이야기
          </figcaption>
        </figure>
        <div className="edu-task">
          <span className="edu-eyebrow">{voiceReply && !isQuestion ? '내가 한 말' : caption}</span>
          {phase === 'read' ? (
            <>
              <p className="edu-story" data-read-aloud>
                {fact.scene}
              </p>
              <blockquote data-read-aloud>“{fact.line}”</blockquote>
              <Action onClick={() => update({ phase: 'question' })}>친구와 대화하기</Action>
            </>
          ) : isQuestion ? (
            <StoryQuestion
              key={phase}
              fact={fact}
              active={active}
              isExtra={isExtra}
              feeling={feeling}
              onReply={(choice, voice = false) =>
                update(
                  isExtra
                    ? { phase: 'ending', extraChoice: choice, extraVoice: voice }
                    : { phase: 'reply', choice, voice },
                )
              }
            />
          ) : (
            <>
              <p className="edu-story" role="status" data-read-aloud>
                {voiceReply
                  ? voiceSummary[feeling]
                  : phase === 'ending'
                    ? reply
                    : '“' + reply + '”'}
              </p>
              <Action onClick={onComplete}>스티커 받기</Action>
              {phase === 'reply' && (
                <button
                  type="button"
                  className="edu-link"
                  onClick={() => update({ phase: 'extra' })}
                >
                  조금 더 이야기하기
                </button>
              )}
            </>
          )}
        </div>
      </div>
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
        next={next}
      />
    )
  if (step === 1)
    return (
      <MirrorActivity fact={fact} feeling={feeling} friend={friend} active={active} next={next} />
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
