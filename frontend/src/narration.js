import { createContext, useContext, useEffect } from 'react'

export const NarrationActive = createContext(true)
let current

export function stopNarration() {
  if (!current) return
  current = null
  delete document.documentElement.dataset.talking
  window.speechSynthesis?.cancel()
}

export function narrate(text) {
  stopNarration()
  const synth = window.speechSynthesis
  if (!text || !synth || !window.SpeechSynthesisUtterance || document.hidden) return
  const voices = synth.getVoices().filter(v => /^ko(?:[-_]|$)/i.test(v.lang))
  const voice = voices.find(v => /premium|enhanced|natural|고품질/i.test(v.name)) ||
    voices.find(v => v.localService) || voices[0]
  const line = new window.SpeechSynthesisUtterance(text)
  line.lang = 'ko-KR'
  if (voice) line.voice = voice
  line.rate = 0.94
  current = line
  line.onstart = line.onresume = () => {
    if (current === line) document.documentElement.dataset.talking = 'true'
  }
  line.onpause = () => {
    if (current === line) delete document.documentElement.dataset.talking
  }
  line.onend = line.onerror = () => {
    if (current !== line) return
    current = null
    delete document.documentElement.dataset.talking
  }
  synth.speak(line)
}

export function useNarration(text) {
  const active = useContext(NarrationActive)
  useEffect(() => {
    if (!active || !text) return
    narrate(text)
    const onHidden = () => { if (document.hidden) stopNarration() }
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', stopNarration)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', stopNarration)
      stopNarration()
    }
  }, [text, active])
}
