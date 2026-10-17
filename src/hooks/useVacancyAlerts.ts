import { useEffect, useRef, useState } from 'react'
import { BackendApiError } from '../lib/backend-api'
import { readWaitlist, saveWaitlist } from '../lib/customer-api'
import type { WaitlistConditions } from '../types'

export function useVacancyAlerts(userId: string | undefined, location: WaitlistConditions['location'], notify: (text: string) => void) {
  const [revision, setRevision] = useState(0)
  const observed = useRef({ userId, seen: new Set<string>(), reported: new Set<string>(), snapshot: '', halted: false })
  const latitude = location?.latitude, longitude = location?.longitude

  useEffect(() => {
    if (observed.current.userId !== userId) observed.current = { userId, seen: new Set(), reported: new Set(), snapshot: '', halted: false }
    if (!userId) return
    const account = observed.current
    let stopped = false
    let timer: number | undefined
    let request: AbortController | undefined

    function active(current: AbortController) {
      return !stopped && !account.halted && !current.signal.aborted && request === current && document.visibilityState === 'visible'
    }
    function report(cause: unknown, current: AbortController) {
      if (!active(current)) return
      if (cause instanceof BackendApiError && (cause.code === 'VERSION_CONFLICT' || cause.code === 'WAITLIST_CLOSED')) return
      const key = cause instanceof BackendApiError ? cause.code : 'NETWORK_ERROR'
      if (!account.reported.has(key)) {
        account.reported.add(key)
        notify(cause instanceof BackendApiError && cause.code === 'DUPLICATE_WAITLIST'
          ? '같은 조건의 대기가 있어 위치를 변경하지 못했어요. 대기내역을 확인해 주세요.'
          : cause instanceof Error ? cause.message : '빈자리 알림을 확인하지 못했어요. 잠시 후 다시 시도할게요.')
      }
      if (cause instanceof BackendApiError && (cause.status === 401 || cause.status === 403)) {
        account.halted = true
        window.clearInterval(timer)
      }
    }
    async function refresh() {
      if (stopped || account.halted || request || document.visibilityState !== 'visible') return
      const current = new AbortController()
      request = current
      try {
        const items = await readWaitlist(current.signal)
        if (!active(current)) return
        const snapshot = JSON.stringify(items.map(({ id, version, status, availability, offers }) => ({ id, version, status, availability, offers })))
        let changed = snapshot !== account.snapshot
        const offers = new Map<string, string>()
        for (const item of items) {
          if (!active(current)) return
          if (item.status !== 'ACTIVE') continue
          const conditions = item.conditions
          if (conditions.radiusMeters !== null) {
            if (!conditions.location || latitude === undefined || longitude === undefined) continue
            if (conditions.location.latitude !== latitude || conditions.location.longitude !== longitude) {
              try {
                await saveWaitlist({ ...conditions, location: { latitude, longitude } }, '', item, 'MANUAL', current.signal)
                if (!active(current)) return
                changed = true
              } catch (cause) { report(cause, current) }
              // 새 조건의 매칭은 서버 작업이 끝난 다음 조회에서 확인한다.
              continue
            }
          }
          for (const offer of item.offers) if (!account.seen.has(offer.id)) offers.set(offer.id, offer.shopName)
        }
        if (!active(current)) return
        account.snapshot = snapshot
        if (changed) setRevision((value) => value + 1)
        if (offers.size) {
          for (const id of offers.keys()) account.seen.add(id)
          const message = offers.size === 1 ? `${offers.values().next().value}에서 조건에 맞는 빈자리를 찾았어요.` : `조건에 맞는 빈자리 ${offers.size}건을 찾았어요.`
          notify(`빈자리 알림 · ${message} 대기내역을 확인해 주세요.`)
        }
      } catch (cause) { report(cause, current) }
      finally { if (request === current) request = undefined }
    }
    function stop() {
      window.clearInterval(timer)
      request?.abort()
      request = undefined
    }
    function syncVisibility() {
      stop()
      if (document.visibilityState !== 'visible' || account.halted) return
      // shortcut: 푸시 구독 없는 사용자의 SSE를 서버가 생성하면 이 폴링을 제거한다.
      void refresh()
      timer = window.setInterval(() => void refresh(), 3000)
    }
    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)
    return () => {
      stopped = true
      stop()
      document.removeEventListener('visibilitychange', syncVisibility)
    }
  }, [latitude, longitude, notify, userId])

  return revision
}
