import { useCallback, useEffect, useRef, useState } from 'react'
import { createRegisteredService, createRegisteredShop, readRegisteredShop, restoreAccountRole, validateShopRegistration } from '../lib/account'
import { logout, readSession } from '../lib/auth'
import type { CurrentUser } from '../lib/auth'
import { BackendApiError, mutateBackendApi } from '../lib/backend-api'
import { updateDisplayName } from '../lib/user-api'
import type { AccountState, RegisteredShop, Role, ShopRegistration } from '../types'

export function useAccount() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [shop, setShop] = useState<RegisteredShop | null>(null)
  const [role, setRole] = useState<Role | null>(null)
  const [customerRegistered, setCustomerRegistered] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const clearError = useCallback(() => setError(''), [])
  const busy = useRef(false)
  const loadedUserId = useRef<string | null>(null)
  const sessionRequest = useRef<AbortController | null>(null)
  const registration = useRef<{ input: ShopRegistration; storeKey: string; serviceKey: string; shop: RegisteredShop | null } | null>(null)

  const loadAccount = useCallback(async () => {
    sessionRequest.current?.abort()
    const controller = new AbortController()
    sessionRequest.current = controller
    try {
      const session = await readSession(controller.signal)
      if (controller.signal.aborted) return
      if (session.status === 'anonymous') { loadedUserId.current = null; registration.current = null; setUser(null); setShop(null); setRole(null); setCustomerRegistered(false); return }
      if (loadedUserId.current !== session.user.id) {
        registration.current = null
        let completed = false
        // shortcut: 이름 입력 완료 여부는 이 브라우저에만 보관하며, 기기 간 동기화가 필요해지면 서버 필드를 추가한다.
        try { completed = localStorage.getItem(`bintime.customer-registered.${session.user.id}`) === 'true' } catch { /* 저장 공간이 없으면 로그인마다 이름을 확인한다. */ }
        setCustomerRegistered(completed)
      }
      loadedUserId.current = session.user.id
      setShop(null)
      setUser(session.user)
      let saved: string | null = null
      try {
        saved = localStorage.getItem(`bintime.role.${session.user.id}`)
      } catch { /* 역할 선택은 저장 공간이 없어도 이용할 수 있다. */ }
      setRole(restoreAccountRole(session.user.roles, saved))
      const storeId = session.user.ownedStoreIds[0]
      const restored = storeId ? await readRegisteredShop(storeId, controller.signal) : null
      if (!controller.signal.aborted) setShop(restored)
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '계정 정보를 불러오지 못했어요.')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => { if (active) return loadAccount() })
    return () => { active = false; sessionRequest.current?.abort() }
  }, [loadAccount])

  function refresh() {
    setLoading(true)
    setError('')
    return loadAccount()
  }

  async function refreshUser() {
    const id = loadedUserId.current
    const session = await readSession()
    if (loadedUserId.current !== id) return
    if (session.status !== 'authenticated' || session.user.id !== id) { await loadAccount(); throw new Error('로그인 계정이 변경됐어요. 다시 확인해 주세요.') }
    setUser(session.user)
  }

  async function refreshShop() {
    const id = loadedUserId.current
    if (!shop) return
    const updated = await readRegisteredShop(shop.id)
    if (loadedUserId.current === id) setShop(updated)
  }

  const selectRole = useCallback((next: Role) => {
    if (!user) { setError('로그인한 뒤 이용해 주세요.'); return false }
    if (!user.roles.some((role) => role === 'OWNER' || role === 'CUSTOMER')) { setError('이 계정으로 화면을 전환할 수 없어요. 계정 정보를 다시 조회해 주세요.'); return false }
    if (next === 'owner' && user.ownedStoreIds.length && !shop) { setError('등록된 가게를 불러오지 못했어요. 계정 정보를 다시 조회해 주세요.'); return false }
    setRole(next)
    setError('')
    try { localStorage.setItem(`bintime.role.${user.id}`, next) } catch { /* 역할 선택은 서버의 권한을 변경하지 않는다. */ }
    return true
  }, [user, shop])

  async function registerCustomer(name: string): Promise<boolean> {
    if (busy.current || !user) return false
    busy.current = true
    setError('')
    try {
      await updateDisplayName(name, user.version)
      if (loadedUserId.current !== user.id) return false
      await refreshUser()
      if (loadedUserId.current !== user.id) return false
      setCustomerRegistered(true)
      try { localStorage.setItem(`bintime.customer-registered.${user.id}`, 'true') } catch { /* 저장 공간이 없어도 이번 로그인에서는 계속 이용한다. */ }
      return true
    } catch (cause) {
      if (loadedUserId.current !== user.id) return false
      if (cause instanceof BackendApiError && cause.code === 'VERSION_CONFLICT') {
        await refreshUser().catch(() => {})
        if (loadedUserId.current !== user.id) return false
        setError('계정 정보가 바뀌었어요. 이름을 다시 저장해 주세요.')
      } else setError(cause instanceof Error ? cause.message : '이름을 저장하지 못했어요. 다시 시도해 주세요.')
      return false
    } finally { busy.current = false }
  }

  async function registerShop(input: ShopRegistration): Promise<boolean> {
    if (busy.current) return false
    if (!user) { setError('로그인한 뒤 이용해 주세요.'); return false }
    if (shop?.serviceId) { setError('이미 등록한 가게가 있어요.'); return false }
    const problem = validateShopRegistration(input)
    if (problem) { setError(problem); return false }
    busy.current = true
    setError('')
    try {
      let pending = registration.current
      if (!pending) {
        pending = { input, storeKey: crypto.randomUUID(), serviceKey: crypto.randomUUID(), shop }
        registration.current = pending
      } else if (JSON.stringify(pending.input) !== JSON.stringify(input)) {
        if (!pending.shop) { setError('이전 등록 결과가 확인되지 않았어요. 입력을 바꾸기 전에 같은 정보로 다시 시도해 주세요.'); return false }
        pending = { ...pending, input, serviceKey: crypto.randomUUID() }
        registration.current = pending
      }
      const registered = pending.shop ?? (user.ownedStoreIds[0] ? await readRegisteredShop(user.ownedStoreIds[0]) : await createRegisteredShop(pending.input, pending.storeKey))
      if (loadedUserId.current !== user.id) return false
      registration.current = { ...pending, shop: registered }
      setShop(registered)
      const session = await readSession()
      if (loadedUserId.current !== user.id) return false
      if (session.status !== 'authenticated' || session.user.id !== user.id) throw new Error('로그인 계정이 변경됐어요. 다시 로그인해 주세요.')
      setUser(session.user)
      const completed = registered.serviceId ? registered : await createRegisteredService(registered, pending.input, pending.serviceKey)
      if (loadedUserId.current !== user.id) return false
      setShop(completed)
      setRole('owner')
      registration.current = null
      return true
    } catch (cause) {
      if (loadedUserId.current !== user.id) return false
      const message = cause instanceof Error ? cause.message : '가게 등록을 완료하지 못했어요.'
      if (registration.current?.shop) setError(`가게는 등록됐어요. 대표 시술 등록을 다시 시도해 주세요. ${message}`)
      else {
        if (cause instanceof BackendApiError && cause.status >= 400 && cause.status < 500 && cause.status !== 409) registration.current = null
        setError(message)
      }
      return false
    } finally { busy.current = false }
  }

  async function savePreferences(value: string): Promise<boolean> {
    if (busy.current || !user) return false
    const text = value.trim()
    if (text.length > 2000) { setError('취향 정보는 2,000자 이내로 입력해 주세요.'); return false }
    busy.current = true
    setError('')
    try {
      const { data } = await mutateBackendApi('/api/v1/users/me/preferences', { method: 'PUT', body: { ...user.preferences, text, expectedVersion: user.version } })
      if (loadedUserId.current !== user.id) return false
      if (!Number.isSafeInteger(data?.version) || typeof data?.text !== 'string') throw new BackendApiError(200, 'INVALID_RESPONSE', '저장 결과를 확인하지 못했어요.')
      setUser({ ...user, version: Number(data.version), preferences: { ...user.preferences, text: data.text } })
      return true
    } catch (cause) {
      if (loadedUserId.current !== user.id) return false
      if (cause instanceof BackendApiError && cause.code === 'VERSION_CONFLICT') {
        const session = await readSession().catch(() => null)
        if (loadedUserId.current !== user.id) return false
        if (session?.status === 'authenticated' && session.user.id === user.id) {
          setUser(session.user)
          setError('다른 화면에서 계정 정보가 바뀌었어요. 최신 정보를 확인했으니 다시 저장해 주세요.')
        } else if (session) {
          await loadAccount()
          setError('로그인 계정이 변경됐어요. 계정을 확인한 뒤 다시 입력해 주세요.')
        } else setError('최신 계정 정보를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.')
      } else setError(cause instanceof Error ? cause.message : '취향을 저장하지 못했어요.')
      return false
    } finally { busy.current = false }
  }

  async function signOut(): Promise<boolean> {
    if (busy.current) return false
    busy.current = true
    setError('')
    try {
      await logout()
      sessionRequest.current?.abort()
      setUser(null); setShop(null); setRole(null); setCustomerRegistered(false)
      registration.current = null
      loadedUserId.current = null
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '로그아웃하지 못했어요.')
      return false
    } finally { busy.current = false }
  }

  const account: AccountState = { role, shop, customerRegistered, preferences: user?.preferences.text ?? '' }
  return { account, user, loading, error, clearError, selectRole, registerCustomer, registerShop, savePreferences, refresh, refreshUser, refreshShop, signOut }
}
