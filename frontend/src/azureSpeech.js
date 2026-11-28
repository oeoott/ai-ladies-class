// Azure AI Speech in the browser (ko-KR STT and TTS) with the official Speech SDK
// (microsoft-cognitiveservices-speech-sdk, loaded only when Azure is used). The key stays on the server:
// the browser gets a 10-minute token from POST /speech/token and uses SpeechConfig.fromAuthorizationToken.
// Audio goes from the browser to Azure directly; the app stores no audio and no recognised text.
//
// createAzureSpeech({ getToken, loadSdk })
//   listen({ onStart }) → { result: Promise<string|null>, cancel() }   the microphone is opened only here
//   speak(text, { onStart, onEnd }) → { stop() }                       resolves silently on failure (onError)
//   stopSpeaking()
// Late results after cancel() or a newer listen/speak are ignored. Listening stops any playback first so the
// friend's voice is not heard by the microphone (echo).

export const LANGUAGE = 'ko-KR'
const MARGIN_MS = 30_000 // ask for a new token this long before it expires

export function createAzureSpeech({ getToken, loadSdk = () => import('microsoft-cognitiveservices-speech-sdk'), now = () => Date.now() }) {
  let cached = null // { token, region, voice, until }
  let speaking = null // { synthesizer, player, done }
  let listening = null // { recognizer, settle }

  async function auth() {
    if (cached && now() < cached.until) return cached
    const data = await getToken()
    if (!data?.token || !data.region) return null
    cached = { token: data.token, region: data.region, voice: data.voice, until: now() + Math.max(0, data.expiresIn * 1000 - MARGIN_MS) }
    return cached
  }

  async function config(sdk) {
    const a = await auth()
    if (!a) return null
    const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(a.token, a.region)
    speechConfig.speechRecognitionLanguage = LANGUAGE
    speechConfig.speechSynthesisLanguage = LANGUAGE
    if (a.voice) speechConfig.speechSynthesisVoiceName = a.voice
    return speechConfig
  }

  function stopSpeaking() {
    const current = speaking
    speaking = null
    if (!current) return
    try { current.player?.pause() } catch { /* already stopped */ }
    try { current.player?.close() } catch { /* already closed */ }
    try { current.synthesizer?.close() } catch { /* already closed */ }
    current.done?.()
  }

  function cancelListening() {
    const current = listening
    listening = null
    if (!current) return
    current.settle(null)
    try { current.recognizer?.close() } catch { /* already closed */ }
  }

  function listen({ onStart } = {}) {
    cancelListening()
    stopSpeaking() // no playback while the microphone is open
    let settle
    const result = new Promise((resolve) => { settle = resolve })
    const request = { recognizer: null, settle: (v) => { if (request.done) return; request.done = true; settle(v) } }
    listening = request
    ;(async () => {
      try {
        const sdk = await loadSdk()
        const speechConfig = await config(sdk)
        if (listening !== request) return
        if (!speechConfig) return request.settle(null)
        const recognizer = new sdk.SpeechRecognizer(speechConfig, sdk.AudioConfig.fromDefaultMicrophoneInput())
        request.recognizer = recognizer
        recognizer.sessionStarted = () => { if (listening === request) onStart?.() }
        recognizer.recognizeOnceAsync((r) => {
          const text = r?.reason === sdk.ResultReason.RecognizedSpeech ? (r.text || '').trim() : ''
          if (listening === request) listening = null
          request.settle(text || null)
          try { recognizer.close() } catch { /* closed */ }
        }, () => {
          if (listening === request) listening = null
          request.settle(null)
          try { recognizer.close() } catch { /* closed */ }
        })
      } catch {
        if (listening === request) listening = null
        request.settle(null) // permission denied, network, SDK load: back to the choices
      }
    })()
    return {
      result,
      cancel() {
        if (listening === request) cancelListening()
        else request.settle(null)
      },
    }
  }

  function speak(text, { onStart, onEnd, onError } = {}) {
    stopSpeaking()
    if (listening) return { stop() {} } // never talk over the open microphone
    const turn = { synthesizer: null, player: null, done: null }
    speaking = turn
    ;(async () => {
      try {
        const sdk = await loadSdk()
        const speechConfig = await config(sdk)
        if (speaking !== turn) return
        if (!speechConfig) throw new Error('no token')
        const player = new sdk.SpeakerAudioDestination()
        turn.player = player
        turn.done = () => {}
        player.onAudioStart = () => { if (speaking === turn) onStart?.() }
        player.onAudioEnd = () => {
          if (speaking !== turn) return
          speaking = null
          try { turn.synthesizer?.close() } catch { /* closed */ }
          onEnd?.()
        }
        const synthesizer = new sdk.SpeechSynthesizer(speechConfig, sdk.AudioConfig.fromSpeakerOutput(player))
        turn.synthesizer = synthesizer
        synthesizer.speakTextAsync(text, (r) => {
          if (speaking === turn && r?.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
            speaking = null
            onError?.()
          }
        }, () => {
          if (speaking === turn) {
            speaking = null
            onError?.()
          }
        })
      } catch {
        if (speaking === turn) {
          speaking = null
          onError?.()
        }
      }
    })()
    return { stop() { if (speaking === turn) stopSpeaking() } }
  }

  return { listen, speak, stopSpeaking, cancelListening, get listening() { return Boolean(listening) } }
}
