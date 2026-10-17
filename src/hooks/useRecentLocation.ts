import { useEffect, useState } from 'react'
import { saveUserLocation } from '../lib/user-api'

export function useRecentLocation(userId: string | undefined, notify: (text: string) => void) {
  const [saved, setSaved] = useState<{ userId: string; location: Awaited<ReturnType<typeof saveUserLocation>> } | null>(null)
  useEffect(() => {
    if (!userId) return
    if (!navigator.geolocation) { notify('이 브라우저에서는 현재 위치를 확인할 수 없어요.'); return }
    let stopped = false
    let timer: number | undefined
    let request: AbortController | undefined
    const reported = new Set<string>()

    function report(message: string) {
      if (stopped || document.visibilityState !== 'visible' || reported.has(message)) return
      reported.add(message)
      notify(message)
    }
    function refresh() {
      if (stopped || document.visibilityState !== 'visible' || request) return
      const current = new AbortController()
      request = current
      navigator.geolocation.getCurrentPosition(async (position) => {
        if (current.signal.aborted || document.visibilityState !== 'visible') return
        try {
          const location = await saveUserLocation(position, current.signal)
          if (!current.signal.aborted) setSaved({ userId: userId!, location })
        }
        catch { if (!current.signal.aborted) report('현재 위치를 저장하지 못했어요. 잠시 후 다시 시도할게요.') }
        finally { if (request === current) request = undefined }
      }, (cause) => {
        if (current.signal.aborted) return
        request = undefined
        report(cause.code === 1 ? '주변 가게 알림을 받으려면 브라우저에서 위치 권한을 허용해 주세요.' : '현재 위치를 확인하지 못했어요. 잠시 후 다시 시도할게요.')
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 })
    }
    function stop() {
      window.clearInterval(timer)
      request?.abort()
      request = undefined
    }
    function syncVisibility() {
      stop()
      if (document.visibilityState !== 'visible') return
      refresh()
      timer = window.setInterval(refresh, 10000)
    }
    syncVisibility()
    document.addEventListener('visibilitychange', syncVisibility)
    return () => {
      stopped = true
      stop()
      document.removeEventListener('visibilitychange', syncVisibility)
    }
  }, [notify, userId])
  return saved?.userId === userId ? saved?.location ?? null : null
}
