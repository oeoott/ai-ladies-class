import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { CharmShape, FriendLook, charmName, headwearImage, headwearName } from './FriendLook.jsx'
import './friend-studio.css'

const charms = [null, 'leaf', 'star', 'flower']
const headwearOptions = [null, 'sky-hat', 'flower-pin']
const prompts = [
  '동물을 골라요',
  '머리에 무엇을 쓸까요?',
  '가방 장식을 골라요',
  '이름을 지어요',
]
const nextLabels = ['머리 꾸미기', '가방 꾸미기', '이름 짓기', '이 친구와 함께하기']

export function FriendStudio({ friend, friends, onFriend }) {
  const [id, setId] = useState(friend.id)
  const [headwear, setHeadwear] = useState(friend.headwear || null)
  const [charm, setCharm] = useState(friend.charm || null)
  const [name, setName] = useState(friend.nickname || '')
  const [step, setStep] = useState(0)
  const animal = friends.find((entry) => entry.id === id) || friends[0]
  const prompt = useRef(null)
  const previousStep = useRef(0)
  const field = useId()

  useEffect(() => {
    if (previousStep.current !== step) {
      previousStep.current = step
      prompt.current?.focus({ preventScroll: true })
      prompt.current?.closest('dialog')?.scrollTo(0, 0)
    }
  }, [step])

  if (!animal) return null

  const nickname = name.trim()
  const previewName = nickname || animal.name
  const choiceLabel = [
    animal.species + ' ' + animal.name,
    headwearName(headwear),
    charmName(charm),
  ][step]
  const pickerLabel = ['동물', '머리 장식', '장식'][step]

  function cycle(offset) {
    if (step === 0) {
      const index = friends.indexOf(animal)
      setId(friends[(index + offset + friends.length) % friends.length].id)
    } else if (step === 1) {
      const index = headwearOptions.indexOf(headwear)
      setHeadwear(
        headwearOptions[(index + offset + headwearOptions.length) % headwearOptions.length],
      )
    } else {
      const index = charms.indexOf(charm)
      setCharm(charms[(index + offset + charms.length) % charms.length])
    }
  }

  function advance(event) {
    event.preventDefault()
    if (step === 3) onFriend(animal.id, { charm, headwear, nickname })
    else setStep(step + 1)
  }

  return (
    <form className="friend-studio" data-studio-step={step + 1} onSubmit={advance}>
      <figure className="studio-portrait">
        <FriendLook
          friend={{ ...animal, charm, headwear }}
          className="studio-friend"
          alt={
            animal.species +
            (headwear ? ', ' + headwearName(headwear) : '') +
            (charm ? ', 가방에 ' + charmName(charm) + ' 장식' : '')
          }
        />
        <figcaption>{previewName}</figcaption>
      </figure>
      <div className="studio-controls">
        <h3 ref={prompt} tabIndex="-1">
          <small>
            {step + 1} / {prompts.length}
          </small>
          {prompts[step]}
        </h3>
        {step < 3 ? (
          <div className="studio-picker">
            <button
              type="button"
              className="forest-panel-iconbtn"
              aria-label={'이전 ' + pickerLabel}
              onClick={() => cycle(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <span className="studio-option" aria-live="polite" aria-atomic="true">
              {step === 1 && headwear && <img src={headwearImage(headwear)} alt="" />}
              {step === 2 && charm && (
                <svg viewBox="-32 -32 64 64" aria-hidden="true">
                  <CharmShape charm={charm} />
                </svg>
              )}
              {choiceLabel}
            </span>
            <button
              type="button"
              className="forest-panel-iconbtn"
              aria-label={'다음 ' + pickerLabel}
              onClick={() => cycle(1)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="studio-name">
            <label htmlFor={field}>
              친구 이름 <span>(선택)</span>
            </label>
            <input
              id={field}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={animal.name}
              maxLength={12}
              autoComplete="off"
              spellCheck="false"
              enterKeyHint="done"
              aria-describedby={field + '-note'}
            />
            <p id={field + '-note'}>
              비워 두면 ‘{animal.name}’{animal.name === '라온' ? '이 돼요.' : '가 돼요.'}
            </p>
          </div>
        )}
        <button type="submit" className="forest-panel-primary">
          {nextLabels[step]} <ArrowRight aria-hidden="true" size={19} />
        </button>
        {step > 0 && (
          <button type="button" className="studio-back" onClick={() => setStep(step - 1)}>
            <ArrowLeft aria-hidden="true" size={17} /> 이전 단계
          </button>
        )}
      </div>
    </form>
  )
}
