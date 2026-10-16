import { useEffect, useState } from 'react'
import { ACCOUNT_STORAGE_KEY, parseAccount, validateShopRegistration } from '../lib/account'
import type { AccountState, Role, ShopRegistration } from '../types'

export function useAccount() {
  // shortcut: 인증 서버 연결 전에는 이 브라우저의 한 체험 계정만 저장한다. 연결 시 사용자별 서버 저장으로 교체한다.
  const [account, setAccount] = useState(() => {
    try { return parseAccount(localStorage.getItem(ACCOUNT_STORAGE_KEY)) }
    catch { return parseAccount(null) }
  })
  const [error, setError] = useState('')

  useEffect(() => {
    function syncAccount(event: StorageEvent) {
      if (event.key !== ACCOUNT_STORAGE_KEY && event.key !== null) return
      setAccount(parseAccount(event.newValue))
      setError('')
    }
    window.addEventListener('storage', syncAccount)
    return () => window.removeEventListener('storage', syncAccount)
  }, [])

  function save(next: AccountState) {
    try { localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(next)) }
    catch { setError('정보를 저장하지 못했어요. 브라우저의 저장 공간과 설정을 확인한 뒤 다시 시도해 주세요.'); return false }
    setAccount(next)
    setError('')
    return true
  }

  function selectRole(role: Role) {
    return save({ ...account, role })
  }

  function registerShop(input: ShopRegistration) {
    if (account.shop) { setError('이미 등록한 가게가 있어요.'); return false }
    const problem = validateShopRegistration(input)
    if (problem) { setError(problem); return false }
    const shop = { ...input, id: `registered-${crypto.randomUUID()}`, name: input.name.trim(), address: input.address.trim(), phone: input.phone.trim(), service: input.service.trim() }
    return save({ ...account, role: 'owner', shop })
  }

  function savePreferences(value: string) {
    const preferences = value.trim()
    if (preferences.length > 2000) { setError('취향 정보는 2,000자 이내로 입력해 주세요.'); return false }
    return save({ ...account, preferences })
  }

  return { account, error, selectRole, registerShop, savePreferences }
}
