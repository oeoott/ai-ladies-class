const key = 'maeum-forest.guardian-pin.v1'

export function hasGuardianPin() {
  return localStorage.getItem(key) !== null
}

async function derive(pin, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 }, material, 256)
  return Array.from(new Uint8Array(bits)).join(',')
}

export async function checkGuardianPin(pin, setup) {
  if (!/^[0-9]{4}$/.test(pin)) return false
  const saved = localStorage.getItem(key)
  if (saved !== null) {
    const { salt, hash } = JSON.parse(saved)
    return await derive(pin, new Uint8Array(salt)) === hash
  }
  if (!setup) return false
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(pin, salt)
  if (hasGuardianPin()) return checkGuardianPin(pin, false)
  localStorage.setItem(key, JSON.stringify({ salt: Array.from(salt), hash }))
  return true
}
