import { useCallback, useEffect, useRef, useState } from 'react'
import { getApps, initializeApp } from 'firebase/app'
import { getMessaging, isSupported, onMessage, onRegistered, onUnregistered, register, unregister } from 'firebase/messaging'
import type { Messaging } from 'firebase/messaging'
import { getPushConfig, pushMessageText, waitForActiveWorker } from '../lib/push'

const config = getPushConfig(import.meta.env)
const preferenceKey = 'bintime.push.enabled.v1'
type PushStatus = 'unconfigured' | 'checking' | 'unsupported' | 'off' | 'blocked' | 'connecting' | 'on' | 'error'

function savedPreference() {
  try { return localStorage.getItem(preferenceKey) === 'true' }
  catch { return false }
}

export function usePushNotifications(notify: (text: string) => void) {
  const [status, setStatus] = useState<PushStatus>(config ? 'checking' : 'unconfigured')
  const [enabled, setEnabled] = useState(savedPreference)
  const [fid, setFid] = useState('')
  const [error, setError] = useState('')
  const messaging = useRef<Messaging | null>(null)
  const busy = useRef(false)

  const enable = useCallback(async (askPermission = true) => {
    const client = messaging.current
    if (!config || busy.current) return
    if (!client) { window.location.reload(); return }
    busy.current = true
    setStatus('connecting')
    setError('')
    try {
      const permission = askPermission && Notification.permission === 'default'
        ? await Notification.requestPermission() : Notification.permission
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'blocked' : 'off')
        return
      }
      localStorage.setItem(preferenceKey, 'true')
      setEnabled(true)
      const url = new URL('/firebase-messaging-sw.js', window.location.origin)
      url.search = new URLSearchParams(config.firebase).toString()
      const serviceWorkerRegistration = await navigator.serviceWorker.register(url, { scope: '/', updateViaCache: 'none' })
      await waitForActiveWorker(serviceWorkerRegistration)
      if (messaging.current !== client || !savedPreference()) return
      await register(client, { vapidKey: config.vapidKey, serviceWorkerRegistration })
      if (!savedPreference()) await unregister(client)
    } catch {
      if (messaging.current === client) {
        setStatus('error')
        setError('알림을 연결하지 못했어요. 네트워크와 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.')
      }
    } finally {
      busy.current = false
    }
  }, [])

  useEffect(() => {
    if (!config) return
    let cancelled = false
    const subscriptions: (() => void)[] = []
    async function start() {
      if (!window.isSecureContext || !('Notification' in window) || !await isSupported()) {
        if (!cancelled) setStatus('unsupported')
        return
      }
      if (cancelled) return
      const app = getApps().find((item) => item.name === 'bintime-push') ?? initializeApp(config!.firebase, 'bintime-push')
      const client = getMessaging(app)
      messaging.current = client
      subscriptions.push(
        onRegistered(client, (installationId) => {
          if (cancelled || !savedPreference()) return
          // shortcut: 사용자 인증·등록 API 연결 전에는 FID를 이 화면에만 보관한다. 백엔드 연결 시 여기서 사용자별로 등록한다.
          setFid(installationId)
          setStatus('on')
        }),
        onUnregistered(client, () => { if (!cancelled) { setFid(''); setStatus('off') } }),
        onMessage(client, (payload) => {
          if (cancelled || !savedPreference()) return
          const text = pushMessageText(payload)
          if (text) notify(text)
        }),
      )
      setStatus(Notification.permission === 'denied' ? 'blocked' : 'off')
      if (savedPreference() && Notification.permission === 'granted') await enable(false)
    }
    function syncPreference() {
      if (!messaging.current) return
      const next = savedPreference()
      setEnabled(next)
      if (!next || Notification.permission !== 'granted') {
        setFid('')
        setStatus(Notification.permission === 'denied' ? 'blocked' : 'off')
      }
    }
    function onStorage(event: StorageEvent) {
      if (!messaging.current || (event.key !== preferenceKey && event.key !== null)) return
      syncPreference()
      if (savedPreference() && Notification.permission === 'granted') void enable(false)
    }
    void start().catch(() => {
      if (!cancelled) { setStatus('error'); setError('알림 기능을 준비하지 못했어요. 페이지를 새로고침해 주세요.') }
    })
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', syncPreference)
    return () => {
      cancelled = true
      subscriptions.forEach((unsubscribe) => unsubscribe())
      messaging.current = null
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', syncPreference)
    }
  }, [enable, notify])

  async function disable() {
    const client = messaging.current
    if (!client || busy.current) return
    busy.current = true
    setStatus('connecting')
    setError('')
    try {
      localStorage.removeItem(preferenceKey)
      await unregister(client)
      setEnabled(false)
      setFid('')
      setStatus(Notification.permission === 'denied' ? 'blocked' : 'off')
    } catch {
      try { localStorage.setItem(preferenceKey, 'true') } catch { /* 브라우저 설정에서 차단할 수 있도록 오류를 유지한다. */ }
      setStatus('error')
      setError('알림 해제를 완료하지 못했어요. 다시 시도하거나 브라우저 설정에서 알림을 차단해 주세요.')
    } finally {
      busy.current = false
    }
  }

  return { status, enabled, fid, error, enable, disable }
}
