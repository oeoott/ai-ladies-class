// The speech engine this tab uses, set by App from the guardian's choice (speechSettings) and the server
// (/speech/status). null = the existing on-device recognition and browser voice.
let azure = null

export function setAzureSpeech(engine) {
  azure = engine
}

export const azureSpeech = () => azure
