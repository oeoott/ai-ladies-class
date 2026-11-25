import { useId, useState } from 'react'
import { CharmShape, FriendLook, charmName, headwearImage, headwearName } from './FriendLook.jsx'
import './friend-studio.css'

const charms = [null, 'leaf', 'star', 'flower']
const headwearOptions = [null, 'sky-hat', 'flower-pin']

function StudioChoice({ selected, label, onClick, children }) {
  return (
    <button type="button" className="studio-choice" aria-pressed={selected} onClick={onClick}>
      <span className="studio-choice-art">{children}</span>
      <span>{label}</span>
      {selected && <span className="studio-choice-check" aria-hidden="true">✓</span>}
    </button>
  )
}

export function FriendStudio({ friend, friends, onFriend, submitLabel }) {
  const [id, setId] = useState(friend.id)
  const [headwear, setHeadwear] = useState(friend.headwear || null)
  const [charm, setCharm] = useState(friend.charm || null)
  const [name, setName] = useState(friend.nickname || '')
  const animal = friends.find((entry) => entry.id === id) || friends[0]
  const field = useId()

  if (!animal) return null

  const nickname = name.trim()
  return (
    <form className="friend-studio" onSubmit={(event) => {
      event.preventDefault()
      onFriend(animal.id, { charm, headwear, nickname })
    }}>
      <figure className="studio-portrait">
        <FriendLook friend={{ ...animal, charm, headwear }} className="studio-friend"
          alt={animal.species + (headwear ? ', ' + headwearName(headwear) : '') + (charm ? ', ' + charmName(charm) + ' 가방 장식' : '')} />
        <figcaption>{nickname || animal.name}</figcaption>
      </figure>
      <div className="studio-controls">
        <fieldset className="studio-group">
          <legend>숲 친구</legend>
          <div className="studio-choices">
            {friends.map((option) => (
              <StudioChoice key={option.id} selected={id === option.id} label={option.species} onClick={() => setId(option.id)}>
                <FriendLook friend={option} />
              </StudioChoice>
            ))}
          </div>
        </fieldset>
        <fieldset className="studio-group">
          <legend>머리 장식</legend>
          <div className="studio-choices">
            {headwearOptions.map((option) => (
              <StudioChoice key={option ?? 'none'} selected={headwear === option} label={option ? headwearName(option) : '없음'}
                onClick={() => setHeadwear(option)}>
                {option && <img src={headwearImage(option)} alt="" />}
              </StudioChoice>
            ))}
          </div>
        </fieldset>
        <fieldset className="studio-group">
          <legend>가방 장식</legend>
          <div className="studio-choices">
            {charms.map((option) => (
              <StudioChoice key={option ?? 'none'} selected={charm === option} label={option ? charmName(option) : '없음'}
                onClick={() => setCharm(option)}>
                {option && <svg viewBox="-32 -32 64 64" aria-hidden="true"><CharmShape charm={option} /></svg>}
              </StudioChoice>
            ))}
          </div>
        </fieldset>
        <div className="studio-name">
          <label htmlFor={field}>이름 <span>(선택)</span></label>
          <input id={field} value={name} onChange={(event) => setName(event.target.value)}
            placeholder={animal.name} maxLength={12} autoComplete="off" spellCheck={false} />
        </div>
        <button type="submit" className="forest-panel-primary">{submitLabel}</button>
      </div>
    </form>
  )
}
