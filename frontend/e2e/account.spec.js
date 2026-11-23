// Guardian account deletion from the guardian panel (server on).
import { expect, test } from '@playwright/test'
import { BACKEND, ONLINE } from './ports.js'
import { DEVICE_KEY, GUARDIAN_KEY, onboard, openGuardian, prepare, readStored } from './helpers.js'

test('계정과 기록 삭제: 비밀번호를 한 번 더 확인하고, 지우면 로그인 안 함 상태와 새 기기 id가 된다', async ({ page, request }, info) => {
  await prepare(page)
  await page.goto(ONLINE)
  const email = `delete-${info.project.name}-${Date.now()}@example.com`
  await onboard(page, { email })

  await openGuardian(page)
  await page.getByRole('button', { name: /보호자 계정/ }).click()
  await page.getByRole('dialog', { name: '보호자 로그인' }).getByRole('button', { name: '계정 만들기' }).click()
  const signup = page.getByRole('dialog', { name: '보호자 계정 만들기' })
  await signup.getByLabel('비밀번호 (8자 이상)').fill('forest-e2e-pass')
  await signup.getByRole('button', { name: '가입하기' }).click()
  const account = page.getByRole('dialog', { name: '보호자 계정' })
  await expect(account).toContainText('아이 별명 라온')
  const before = await readStored(page, GUARDIAN_KEY)
  const deviceBefore = await page.evaluate((key) => localStorage.getItem(key), DEVICE_KEY)

  await account.getByRole('button', { name: '계정과 기록 삭제' }).click()
  const confirm = page.getByRole('dialog', { name: '계정과 기록 삭제' })
  await expect(confirm).toContainText('지운 기록은 되돌릴 수 없어요.')
  await confirm.getByLabel('비밀번호').fill('not-the-password')
  await confirm.getByRole('button', { name: '삭제하기' }).click()
  await expect(confirm.getByRole('alert')).toHaveText('비밀번호를 확인해 주세요.')
  expect((await request.get(BACKEND + '/me', { headers: { Authorization: 'Bearer ' + before.token } })).status()).toBe(200)

  await confirm.getByLabel('비밀번호').fill('forest-e2e-pass')
  await confirm.getByRole('button', { name: '삭제하기' }).click()
  await expect(confirm.getByRole('status')).toHaveText('계정과 학습 기록을 지웠어요.')
  expect((await request.get(BACKEND + '/me', { headers: { Authorization: 'Bearer ' + before.token } })).status()).toBe(401)
  expect((await readStored(page, GUARDIAN_KEY)).token).toBeNull()
  const deviceAfter = await page.evaluate((key) => localStorage.getItem(key), DEVICE_KEY)
  expect(deviceAfter).toMatch(/^device-/)
  expect(deviceAfter).not.toBe(deviceBefore)

  await confirm.getByRole('button', { name: '설정으로 돌아가기' }).click()
  await expect(page.getByRole('button', { name: /보호자 계정/ })).toContainText('로그인 안 함')
})
