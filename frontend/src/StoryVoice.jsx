import { useEffect, useRef, useState } from 'react'
import { stopNarration } from './narration.js'

const language = { langs: ['ko-KR'], processLocally: true }
const normalize = (text) => text.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()

export function voiceSupported() {
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
  return Boolean(Recognition?.available && 'processLocally' in Recognition.prototype)
}

// Guidance lines for the one note under the choices (StoryQuestion places it).
export const VOICE_LINES = {
  listening: '듣고 있어요. 보기 중 하고 싶은 말을 말해 보아요.',
  // Recognition failed or heard nothing: tap instead.
  useChoices: '화면에서 하고 싶은 말을 눌러 보아요.',
  // A sentence was heard but got no reply (no server, or the server sent the child back to the choices).
  heardUseChoices: '잘 들었어요. 이번에는 하고 싶은 말을 눌러 보아요.',
}

// onHeard receives a sentence that matched no choice and resolves to true when it was answered.
// onStatus gets { listening, message } so the lesson can show the note under the choices and the
// friend's existing 'listen' pose. Only the button is rendered here.
export function StoryVoice({ choices, onReply, onHeard, onStatus, waiting = false, active }) {
  const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
  const supported = voiceSupported()
  const [status, setStatus] = useState('idle')
  const [message, setMessage] = useState('')
  const pending = useRef(null)
  const report = useRef(onStatus)
  report.current = onStatus
  useEffect(() => {
    report.current?.({ listening: status === 'listening', message })
  }, [status, message])
  // A recognised choice moves the scene on while still 'listening': clear the pose when this goes away.
  useEffect(() => () => report.current?.({ listening: false, message: '' }), [])

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

  function useChoices(heard = false) {
    setStatus('idle')
    setMessage(heard ? VOICE_LINES.heardUseChoices : VOICE_LINES.useChoices)
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
        setMessage(VOICE_LINES.listening)
      }
      recognition.onresult = (event) => {
        if (pending.current !== request) return
        const alternatives = Array.from(event.results[event.resultIndex] ?? [])
        const heard = new Set(alternatives.map(({ transcript }) => normalize(transcript)))
        const index = choices.findIndex((choice) => heard.has(normalize(choice)))
        const sentence = alternatives[0]?.transcript?.trim()
        cancel()
        if (index >= 0) onReply(index, 'voice')
        else if (onHeard && sentence) {
          setStatus('idle')
          Promise.resolve(onHeard(sentence)).then((answered) => {
            if (!answered) useChoices(true)
          })
        } else useChoices()
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
  return status === 'listening' ? (
    <button type="button" className="edu-secondary" onClick={() => {
      cancel()
      setStatus('idle')
      setMessage('')
    }}>듣기 멈추기</button>
  ) : (
    <button type="button" className="edu-secondary" onClick={begin} disabled={!active || waiting || status === 'preparing'}>
      {status === 'download' ? '한국어 음성 준비하기' : status === 'preparing' ? '준비 중이에요' : '말로 답하기'}
    </button>
  )
}
