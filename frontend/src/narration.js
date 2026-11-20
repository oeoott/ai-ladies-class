import { createContext, useContext, useEffect, useEffectEvent } from 'react'
import lionAudio from './raon-audio.js'

export const NarrationActive = createContext(true)
export const NarrationVoice = createContext(null)
let current

export function stopNarration() {
  if (!current) return
  const playing = current
  current = null
  playing.pause?.()
  delete document.documentElement.dataset.talking
  window.speechSynthesis?.cancel()
}

export function narrate(text, { onStart, onEnd, recording } = {}) {
  stopNarration()
  if (!text || document.hidden) return
  if (recording && window.Audio) {
    const clip = new window.Audio(recording)
    current = clip
    clip.onplaying = () => {
      if (current !== clip) return
      document.documentElement.dataset.talking = 'true'
      onStart?.()
    }
    clip.onended = () => {
      if (current !== clip) return
      current = null
      delete document.documentElement.dataset.talking
      onEnd?.()
    }
    const fallback = () => {
      if (current === clip) narrate(text, { onStart, onEnd })
    }
    clip.onerror = fallback
    clip.play().catch(fallback)
    return
  }
  const synth = window.speechSynthesis
  if (!synth || !window.SpeechSynthesisUtterance) return
  const voices = synth.getVoices().filter(v => /^ko(?:[-_]|$)/i.test(v.lang))
  const voice = voices.find(v => /premium|enhanced|natural|고품질/i.test(v.name)) ||
    voices.find(v => v.localService) || voices[0]
  const line = new window.SpeechSynthesisUtterance(text)
  line.lang = 'ko-KR'
  if (voice) line.voice = voice
  line.rate = 0.94
  current = line
  line.onresume = () => {
    if (current === line) document.documentElement.dataset.talking = 'true'
  }
  line.onstart = () => {
    if (current !== line) return
    line.onresume()
    onStart?.()
  }
  line.onpause = () => {
    if (current === line) delete document.documentElement.dataset.talking
  }
  function end() {
    if (current !== line) return false
    current = null
    delete document.documentElement.dataset.talking
    return true
  }
  line.onerror = end
  line.onend = () => {
    if (end()) onEnd?.()
  }
  synth.speak(line)
}

export function useNarration(text, onComplete) {
  const active = useContext(NarrationActive)
  const voice = useContext(NarrationVoice)
  const filename = voice === 'lion' && Object.hasOwn(lionAudio, text) ? lionAudio[text] : null
  const recording = filename ? import.meta.env.BASE_URL + 'audio/raon/' + filename : undefined
  const autoAdvance = Boolean(onComplete)
  const complete = useEffectEvent(() => onComplete?.())
  useEffect(() => {
    if (!active || !text) return
    let timer
    const readingTime = Math.max(6500, text.length * 140)
    const holdAfterNarration = 2000
    const pause = () => {
      clearTimeout(timer)
      stopNarration()
    }
    const advanceAfter = (delay) => {
      clearTimeout(timer)
      timer = window.setTimeout(() => { if (!document.hidden) complete() }, delay)
    }
    const start = () => {
      if (document.hidden) return
      if (autoAdvance) advanceAfter(readingTime + holdAfterNarration)
      narrate(text, {
        recording,
        onStart: autoAdvance ? () => advanceAfter(30000) : undefined,
        onEnd: autoAdvance ? () => advanceAfter(holdAfterNarration) : undefined,
      })
    }
    const onVisibilityChange = () => {
      if (document.hidden) pause()
      else if (autoAdvance) start()
    }
    start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', pause)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', pause)
      pause()
    }
  }, [text, active, autoAdvance, recording])
}
