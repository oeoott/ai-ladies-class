import { useEffect, useRef, useState } from 'react'
import { stopNarration } from './narration.js'

const language = { langs: ['ko-KR'], processLocally: true }
const normalize = (text) => text.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()

export function StoryVoice({ choices, onReply, active }) {
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
  const supported = Boolean(Recognition?.available && 'processLocally' in Recognition.prototype)
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const pending = useRef(null)

  function cancel() {
    const request = pending.current
    pending.current = null
    request?.recognition?.abort()
  }

  useEffect(() => {
    if (!active) {
      setStatus('idle')
      setMessage('')
      return
    }
    const onVisibility = () => {
      if (!document.hidden) return
      cancel()
      setStatus('idle')
      setMessage('')
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', cancel)
    return () => {
      cancel()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', cancel)
    }
  }, [active])

  function useChoices() {
    setStatus('idle')
    setMessage('화면에서 하고 싶은 말을 눌러 보아요.')
  }

  async function begin() {
    if (pending.current || !supported || !active || document.hidden) return
    setMessage('')
    const request = {}
    pending.current = request
    setStatus('preparing')
    try {
      if (status === 'download') {
        const installed = await Recognition.install(language)
        if (pending.current !== request) return
        pending.current = null
        if (installed) {
          setStatus('ready')
          setMessage('준비됐어요. 말로 답하기를 눌러 보아요.')
        } else useChoices()
        return
      }

      const availability = status === 'ready' ? 'available' : await Recognition.available(language)
      if (pending.current !== request) return
      if (availability !== 'available') {
        pending.current = null
        if (availability === 'downloadable' && Recognition.install) {
          setStatus('download')
          setMessage('말로 답하려면 한국어 음성 인식을 먼저 준비해요.')
        } else useChoices()
        return
      }

      const recognition = new Recognition()
      request.recognition = recognition
      recognition.lang = language.langs[0]
      recognition.processLocally = true
      recognition.maxAlternatives = 3
      recognition.onstart = () => {
        if (pending.current !== request) return
        setStatus('listening')
        setMessage('보기 중 하고 싶은 말을 말해 보아요.')
      }
      recognition.onresult = (event) => {
        if (pending.current !== request) return
        const alternatives = Array.from(event.results[event.resultIndex] ?? [])
        const heard = new Set(alternatives.map(({ transcript }) => normalize(transcript)))
        const index = choices.findIndex((choice) => heard.has(normalize(choice)))
        cancel()
        if (index >= 0) onReply(index)
        else useChoices()
      }
      recognition.onerror = recognition.onend = () => {
        if (pending.current !== request) return
        pending.current = null
        useChoices()
      }
      stopNarration()
      recognition.start()
    } catch {
      if (pending.current !== request) return
      cancel()
      useChoices()
    }
  }

  if (!supported) return null
  return (
    <div className="edu-story-voice">
      {status === 'listening' ? (
        <button type="button" className="edu-secondary" onClick={() => {
          cancel()
          setStatus('idle')
          setMessage('')
        }}>듣기 멈추기</button>
      ) : (
        <button type="button" className="edu-secondary" onClick={begin} disabled={!active || status === 'preparing'}>
          {status === 'download' ? '한국어 음성 준비하기' : status === 'preparing' ? '준비 중이에요' : '말로 답하기'}
        </button>
      )}
      <p role="status" className="edu-note">{message}</p>
    </div>
  )
}
