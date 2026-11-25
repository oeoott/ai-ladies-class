import { Camera, CameraOff } from 'lucide-react'
import { useNarration } from './narration.js'
import React, { createContext, useContext, useEffect, useRef, useState, useId } from 'react'
import { startFacePreview } from './facePreview.js'
import { feelingPractice, PracticeObject } from './FeelingPractice.jsx'
import { GuidePortrait, PaintedFriend } from './PaintedFriend.jsx'
import './activities.css'
import { TaleActions, TaleScene } from './ForestTale.jsx'
import { forestTales } from './forestTales.js'
import { StoryVoice } from './StoryVoice.jsx'

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
function Action({ children, ...props }) {
  return (
    <button type="button" className="edu-primary" {...props}>
      {children}
    </button>
  )
}
function Choice({ selected, bubble = false, children, ...props }) {
  return (
    <button
      type="button"
      className={'edu-choice' + (bubble ? ' edu-word-bubble' : '') + (selected ? ' is-selected' : '')}
      aria-pressed={Boolean(selected)}
      {...props}
    >
      {!bubble && <span className="edu-choice-mark" aria-hidden="true" />}
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
function FaceDetail({ feeling }) {
  return (
    <div className={'face-detail face-detail-' + feeling}>
      <div className="face-detail-image">
        <EmotionCard feeling={feeling} />
        <span aria-hidden="true" />
      </div>
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
function EmotionIntroduction({ feeling, friend, active, text, onNext }) {
  const heading = useRef(null)
  const id = useId()
  useNarration(text)
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    window.scrollTo(0, 0)
  }, [text])

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
          <p>{text}</p>
          <div className="edu-intro-actions"><Action onClick={onNext}>다음</Action></div>
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
function QuizFeedback({ correct, hint, illustration, friend, active, onContinue, nextLabel = '다음' }) {
  const title = correct ? '딩동댕! 맞았어요!' : '아까워요! 다시 생각해 볼까요?'
  return (
    <Board
      title={title}
      description={hint}
      voiceLine={title + ' ' + hint}
      illustration={illustration}
      guide={<GuidePortrait friend={friend} active={active} />}
    >
      <Action onClick={onContinue}>{correct ? nextLabel : '다시 골라 보기'}</Action>
    </Board>
  )
}

export function LevelTest({ progress, onUpdate, onDone, friend, active }) {
  const state = progress.placement || {}
  const idx = state.index === 1 ? 1 : 0
  const item = PLACEMENT[idx]
  function update(values) {
    onUpdate({ placement: { ...state, index: idx, ...values } })
  }
  function advance() {
    if (idx === 0) onUpdate({ placement: { index: 1, usedHint: Boolean(state.usedHint) } })
    else onDone(state.usedHint ? 'basic' : 'expand')
  }
  if (item.alternatives.includes(state.choice)) {
    const correct = state.choice === item.target
    return (
      <QuizFeedback
        correct={correct}
        hint={correct ? FEELINGS[item.target].clue : item.hint}
        illustration={<figure className="edu-figure"><EmotionCard feeling={state.choice} /></figure>}
        friend={friend}
        active={active}
        onContinue={correct ? advance : () => update({ choice: null, introduced: true })}
        nextLabel={idx === 0 ? '다음 얼굴 보기' : '진단 마치기'}
      />
    )
  }
  if (!state.introduced) {
    return (
      <EmotionIntroduction
        feeling={item.target}
        friend={friend}
        active={active}
        text={state.showExample ? item.example : item.meaning}
        onNext={() => update(state.showExample ? { introduced: true } : { showExample: true })}
      />
    )
  }
  return (
    <Board title={item.prompt}>
      <div className="edu-placement-prompt">
        <div className="edu-placement">
          {item.alternatives.map((key) => (
            <button
              type="button"
              key={key}
              aria-label={FEELINGS[key].clue}
              className="edu-picture-choice"
              onClick={() => update({ choice: key, usedHint: Boolean(state.usedHint) || key !== item.target })}
            >
              <EmotionCard feeling={key} alt="" />
            </button>
          ))}
        </div>
        <GuidePortrait friend={friend} className="edu-placement-guide" active={active} />
      </div>
    </Board>
  )
}

function EmotionActivity({ fact, feeling, friend, state, update, next, expanded, active }) {
  const practice = feelingPractice[feeling]
  // Older walks saved word choices before the introductory scenes existed.
  const phase = state.practicePhase || (state.selected || state.solved ? 'words' : 'intro')
  const guide = <GuidePortrait friend={friend} active={active} />
  const card = <figure className="edu-figure"><EmotionCard feeling={feeling} /></figure>
  if (phase === 'intro' || phase === 'example') {
    return (
      <EmotionIntroduction
        feeling={feeling}
        friend={friend}
        active={active}
        text={phase === 'intro' ? practice.meaning : practice.example}
        onNext={() => update({ practicePhase: phase === 'intro' ? 'example' : 'experiment' })}
      />
    )
  }
  if (phase === 'experiment' || phase === 'reaction') {
    const revealed = phase === 'reaction'
    return (
      <Board
        title={revealed ? practice.afterTitle : practice.beforeTitle}
        description={revealed ? undefined : practice.before}
        voiceLine={revealed ? practice.reaction : practice.before}
        className={feeling === 'surprise' && !revealed ? 'edu-surprise-box' : undefined}
        illustration={
          <div className="edu-figure practice-field">
            <figure className="practice-field-friend">
              <Portrait friend={friend} feeling={revealed ? feeling : 'neutral'} active={active} gesture={revealed ? 'speak' : 'listen'} />
            </figure>
            <PracticeObject
              feeling={feeling}
              revealed={revealed}
              onAct={revealed ? undefined : () => update({ practicePhase: 'reaction' })}
            />
          </div>
        }
      >
        {revealed && (
          <>
            <blockquote className="edu-speech">{practice.reaction}</blockquote>
            <Action onClick={() => update({ practicePhase: 'discovery' })}>표정 살펴보기</Action>
          </>
        )}
      </Board>
    )
  }
  if (phase === 'discovery') {
    return (
      <Board
        title={practice.cueQuestion}
        guide={guide}
        illustration={
          <div className="edu-figure practice-field practice-field-detail">
            <FaceDetail feeling={feeling} />
            <PracticeObject feeling={feeling} revealed />
          </div>
        }
      >
        <div className="practice-cue-options" role="group" aria-label="표정 단서">
          {practice.cues.map((cue) => (
            <Choice
              key={cue}
              onClick={() => update({ cue, practicePhase: 'cue-result' })}
            >
              {cue}
            </Choice>
          ))}
        </div>
      </Board>
    )
  }
  if (phase === 'cue-result' || phase === 'word-result') {
    const cueResult = phase === 'cue-result'
    const correct = cueResult ? state.cue === practice.target : state.solved === true
    return (
      <QuizFeedback
        correct={correct}
        hint={!correct && cueResult ? practice.cueHint : fact.clue}
        illustration={cueResult ? <figure className="edu-figure"><FaceDetail feeling={feeling} /></figure> : card}
        friend={friend}
        active={active}
        onContinue={() => {
          if (cueResult) update({ practicePhase: correct ? 'words' : 'discovery', cue: null })
          else if (correct) next()
          else update({ practicePhase: 'words', selected: [], solved: false })
        }}
        nextLabel={cueResult ? '마음 낱말 고르기' : '감정 탐색 마치기'}
      />
    )
  }
  const words = expanded ? [fact.word, fact.kin, fact.opposite] : [fact.word, fact.opposite]
  // Rotate the answer position by topic while keeping it stable on repeat visits.
  if (feeling === 'joy' || feeling === 'surprise') words.unshift(words.pop())
  const selected = Array.isArray(state.selected)
    ? state.selected.filter((x) => words.includes(x))
    : []
  function answer(correct, selection = selected) {
    update({ selected: selection, solved: correct, practicePhase: 'word-result' })
  }
  function pick(word) {
    if (!expanded) return answer(word === fact.word, [word])
    update({ selected: selected.includes(word) ? selected.filter((x) => x !== word) : [...selected, word] })
  }
  return (
    <Board
      title="어떤 마음일까요?"
      description={expanded ? '맞는 말을 하나나 두 개 골라요.' : '맞는 말 하나를 골라요.'}
      illustration={card}
      guide={guide}
    >
      <div className="edu-choices edu-word-options" role="group" aria-label="마음 낱말">
        {words.map((word) => (
          <Choice bubble key={word} selected={selected.includes(word)} onClick={() => pick(word)}>
            {word}
          </Choice>
        ))}
      </div>
      {expanded && (
        <Action disabled={selected.length === 0} onClick={() => answer(selected.every((word) => word === fact.word || word === fact.kin))}>
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

function MirrorActivity({ fact, feeling, friend, active, state, update, next }) {
  const camera = useCamera(active)
  const [demonstration, setDemonstration] = useState(0)
  const ways = feelingPractice[feeling].expression
  const chosen = ways[state.mirrorChoice]
  if (state.mirrorPhase === 'express' || (chosen && ['response', 'answer'].includes(state.mirrorPhase))) {
    const showingAnswer = state.mirrorPhase === 'answer'
    const showingPractice = state.mirrorPhase === 'response'
    const title = showingAnswer ? '친구가 이렇게 답했어요' : '내 마음을 전해 봐요'
    const description = showingAnswer ? chosen.answer : showingPractice ? chosen.practice : '말이나 몸짓을 골라요.'
    return (
      <Board
        title={title}
        description={description}
        focusKey={state.mirrorPhase}
        guide={<GuidePortrait friend={friend} active={active} />}
        illustration={
          <figure className="edu-figure">
            <EmotionCard feeling={feeling} />
          </figure>
        }
      >
        {showingAnswer ? (
          <Action onClick={next}>연습 마치기</Action>
        ) : showingPractice ? (
          <Action onClick={() => update({ mirrorPhase: 'answer' })}>친구의 답 보기</Action>
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
  const cameraOn = camera.status === 'on' || camera.status === 'waiting'
  const cameraLabel = {
    on: '카메라 끄기',
    waiting: '카메라 요청 취소',
    unavailable: '카메라 다시 켜기',
  }[camera.status] || '카메라로 내 모습 보기'
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
      <div className="edu-mirror-actions">
        <button
          className="edu-secondary edu-camera-toggle"
          type="button"
          onClick={cameraOn ? camera.off : camera.start}
          aria-label={cameraLabel}
          title={cameraLabel}
        >
          {cameraOn ? <CameraOff aria-hidden="true" /> : <Camera aria-hidden="true" />}
        </button>
        <Action
          onClick={() => {
            camera.off()
            update({ mirrorPhase: 'express' })
          }}
        >
          표정 연습 마쳤어요
        </Action>
      </div>
    </Board>
  )
}
function StoryQuestion({ fact, isExtra, onReply, active }) {
  const choices = isExtra ? fact.extra : fact.choices
  return (
    <>
      <p className="edu-prompt">{isExtra ? fact.again : fact.ask}</p>
      <div className="edu-choices" role="group" aria-label="친구에게 보낼 말">
        {choices.map((text, index) => (
          <button key={text} type="button" className="edu-reply" onClick={() => onReply(index)}>
            {text}
          </button>
        ))}
      </div>
      <StoryVoice choices={choices} onReply={onReply} active={active} />
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
    'consequence-line',
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
  const reaction = phase === 'book' && page === pages.length - 1 && tale.finalPageReaction
  const showingReaction = Boolean(reaction && state.showBookReaction)
  const bookText = showingReaction ? reaction : pages[page]
  const sceneKey = phase + '-' + page + (showingReaction ? '-reaction' : '')
  const chosen = state.branch === 0 || state.branch === 1 ? state.branch : null
  const outcome = chosen == null ? null : tale.actions[chosen]
  const friendName = friend?.name || '숲속 친구'
  const inDialogue = ['question', 'reply', 'extra', 'ending'].includes(phase)
  const isConsequence = phase === 'consequence' || phase === 'consequence-line'
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
  if (isConsequence && outcome) title = outcome.title
  if (inDialogue) title = isEnding ? '이야기를 마쳤어요' : withFriend(friendName) + ' 나누는 이야기'
  const showActions = phase === 'act' || (isConsequence && !outcome)
  const afterChoice = (isConsequence || inDialogue) && outcome != null
  let expression = feeling
  if (phase === 'book' && (page < pages.length - 1 || (reaction && !showingReaction))) expression = 'neutral'
  if (afterChoice) expression = outcome.expression
  return (
    <Board
      title={title}
      className={isConsequence || inDialogue ? 'edu-tale-dialogue' : undefined}
      voiceLine={phase === 'book' ? bookText.replaceAll('{친구}', '숲 친구')
        : phase === 'situation' ? tale.explanation
        : isConsequence && outcome ? (phase === 'consequence' ? outcome.event : outcome.line)
        : phase === 'question' ? conversation.ask
        : isExtra ? conversation.again
        : phase === 'reply' || isEnding ? replyText : title}
      focusKey={sceneKey}
      illustration={
        <TaleScene
          feeling={feeling}
          page={page}
          branch={isConsequence || inDialogue ? chosen : null}
          active={active}
        >
          <Portrait
            friend={friend}
            feeling={expression}
            active={active}
            gesture={phase === 'act' ? 'listen' : phase === 'consequence' ? 'nod' : 'speak'}
            actionKey={sceneKey}
          />
        </TaleScene>
      }
    >
      {phase === 'book' && (
        <>
          <p className="edu-story">
            {bookText.replaceAll('{친구}', friend?.familiar || friendName)}
          </p>
          {page + 1 < pages.length ? (
            <Action onClick={() => update({ phase: 'book', bookPage: page + 1 })}>다음 장</Action>
          ) : reaction && !showingReaction ? (
            <Action onClick={() => update({ showBookReaction: true })}>다음 문장</Action>
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
          <p className="edu-story">{outcome.event}</p>
          <Action onClick={() => update({ phase: 'consequence-line' })}>친구의 말 듣기</Action>
        </>
      )}
      {phase === 'consequence-line' && outcome && (
        <>
          <blockquote className="edu-speech">“{outcome.line}”</blockquote>
          <div className="edu-tale-actions">
            <Action onClick={() => update({ phase: 'question' })}>친구와 대화하기</Action>
            <button type="button" className="edu-secondary" onClick={() => update({ phase: 'act' })}>
              다른 방법 해 보기
            </button>
          </div>
        </>
      )}
      {(phase === 'question' || isExtra) && (
        <StoryQuestion
          fact={conversation}
          isExtra={isExtra}
          active={active}
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
          <div className={phase === 'reply' ? 'edu-tale-actions' : undefined}>
            <Action onClick={onComplete}>산책 마무리하기</Action>
            {phase === 'reply' && (
              <button type="button" className="edu-secondary" onClick={() => update({ phase: 'extra' })}>
                조금 더 이야기하기
              </button>
            )}
          </div>
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
