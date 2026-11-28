// Which speech engine this device uses, chosen by the guardian (보호자 설정 > 음성 기능).
// - device (default): the browser's on-device recognition (processLocally) and the browser voice, as before.
//   Voice never leaves the device.
// - azure: Azure AI Speech for both listening (STT) and reading aloud (TTS). The child's voice is sent to
//   Microsoft Azure to be turned into text. Only after the guardian agreed (consentAt). Nothing is stored in
//   the app (no audio, no recognised text in the database or logs).
// The choice stays on this device only (localStorage). Not verified on an iPad yet (see docs/ai/HANDOFF-AI.md).
export const SPEECH_KEY = 'maeum-forest.speech.v1'
export const PROVIDERS = ['device', 'azure']

export function readSpeechSetting(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(SPEECH_KEY) ?? 'null')
    if (saved?.provider === 'azure' && typeof saved.consentAt === 'string') return saved
  } catch {
    // broken value: back to the default
  }
  return { provider: 'device', consentAt: null }
}

export function saveSpeechSetting(provider, { consent = false, now = new Date(), storage = globalThis.localStorage } = {}) {
  if (!PROVIDERS.includes(provider)) throw new Error('unknown speech provider')
  if (provider === 'azure' && !consent) throw new Error('Azure 음성 기능은 보호자 동의가 필요해요')
  const value = provider === 'azure' ? { provider, consentAt: now.toISOString() } : { provider: 'device', consentAt: null }
  storage?.setItem(SPEECH_KEY, JSON.stringify(value))
  return value
}
