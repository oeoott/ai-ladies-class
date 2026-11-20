import { useLayoutEffect, useRef, useState } from 'react'
import { checkGuardianPin, hasGuardianPin } from './guardianPin.js'

export function GuardianGate({ onUnlock }) {
  const [setup] = useState(() => {
    try { return !hasGuardianPin() } catch { return false }
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mounted = useRef(false)
  useLayoutEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const pin = form.elements.pin.value
    if (setup && pin !== form.elements.confirm.value) {
      setError('두 비밀번호가 달라요.')
      form.elements.confirm.select()
      return
    }
    setBusy(true)
    try {
      const valid = await checkGuardianPin(pin, setup)
      if (!mounted.current) return
      if (valid) onUnlock()
      else {
        setError('비밀번호를 다시 확인해 주세요.')
        form.elements.pin.select()
      }
    } catch {
      if (mounted.current) setError('이 기기에서 비밀번호를 확인할 수 없어요.')
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const inputProps = { type: 'password', inputMode: 'numeric', pattern: '[0-9]{4}', maxLength: 4, required: true }
  return (
    <form className="forest-account-form" onSubmit={submit}>
      <label htmlFor="guardian-pin">{setup ? '새 비밀번호 (숫자 4자리)' : '비밀번호 (숫자 4자리)'}</label>
      <input {...inputProps} id="guardian-pin" name="pin" autoComplete={setup ? 'new-password' : 'current-password'} />
      {setup && <>
        <label htmlFor="guardian-confirm">비밀번호 한 번 더</label>
        <input {...inputProps} id="guardian-confirm" name="confirm" autoComplete="new-password" />
      </>}
      {error && <p role="alert" className="forest-field-error">{error}</p>}
      <button className="forest-panel-primary" type="submit" disabled={busy}>{setup ? '비밀번호 저장' : '열기'}</button>
    </form>
  )
}
