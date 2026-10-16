import { useCallback, useEffect, useRef, useState } from 'react'
import { getApps, initializeApp } from 'firebase/app'
import { getMessaging, isSupported, onMessage, onRegistered, register, unregister } from 'firebase/messaging'
import type { Messaging } from 'firebase/messaging'
import { deletePushSubscription, getPushConfig, needsIOSHomeScreen, pushMessageText, registerPushSubscription, showForegroundPush, waitForActiveWorker } from '../lib/push'

const config = getPushConfig(import.meta.env)
type PushStatus = 'unconfigured' | 'checking' | 'install-required' | 'unsupported' | 'off' | 'blocked' | 'connecting' | 'on' | 'error'

function stored(key: string) {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}

export function usePushNotifications(notify: (text: string, notificationId?: string) => void, userId?: string) {
  const preferenceKey = `bintime.push.${userId ?? ''}`
  const subscriptionKey = `${preferenceKey}.subscription`
  const installationKey = `${preferenceKey}.installation`
  const [status, setStatus] = useState<PushStatus>(config ? 'checking' : 'unconfigured')
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState('')
  const messaging = useRef<Messaging | null>(null)
  const generation = useRef(0)
  const busy = useRef<number | null>(null)
  const registrationSync = useRef<Promise<void> | null>(null)
  const firebaseOperation = useRef<Promise<void>>(Promise.resolve())

  const enable = useCallback(async (askPermission = true) => {
    const client = messaging.current
    if (!userId || !config || busy.current !== null) return
    if (!client) { setError('알림 기능을 준비하고 있어요. 잠시 후 다시 시도해 주세요.'); return }
    const active = generation.current
    busy.current = active
    setStatus('connecting')
    setError('')
    try {
      const permission = askPermission && Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
      if (generation.current !== active) return
      if (permission !== 'granted') { setStatus(permission === 'denied' ? 'blocked' : 'off'); return }
      localStorage.setItem(preferenceKey, 'true')
      setEnabled(true)
      const url = new URL('/firebase-messaging-sw.js', window.location.origin)
      url.search = new URLSearchParams(config.firebase).toString()
      const serviceWorkerRegistration = await navigator.serviceWorker.register(url, { scope: '/', updateViaCache: 'none' })
      await waitForActiveWorker(serviceWorkerRegistration)
      if (generation.current !== active || stored(preferenceKey) !== 'true') return
      registrationSync.current = null
      const operation = firebaseOperation.current.catch(() => {}).then(async () => {
        if (generation.current !== active || stored(preferenceKey) !== 'true') return
        await register(client, { vapidKey: config.vapidKey, serviceWorkerRegistration })
      })
      firebaseOperation.current = operation
      await operation
      if (generation.current !== active) return
      await registrationSync.current
    } catch (cause) {
      if (generation.current === active) {
        setStatus('error')
        setError(cause instanceof Error ? cause.message : '알림을 연결하지 못했어요. 다시 시도해 주세요.')
      }
    } finally { if (busy.current === active) busy.current = null }
  }, [preferenceKey, userId])

  const disable = useCallback(async (): Promise<boolean> => {
    const client = messaging.current
    if (busy.current !== null) return false
    const active = generation.current
    busy.current = active
    setStatus('connecting')
    setError('')
    try {
      const subscriptionId = stored(subscriptionKey)
      const installationId = stored(installationKey)
      if (subscriptionId || installationId) await deletePushSubscription(subscriptionId, installationId)
      if (generation.current !== active) return false
      if (client) {
        const operation = firebaseOperation.current.catch(() => {}).then(async () => {
          if (generation.current === active) await unregister(client)
        })
        firebaseOperation.current = operation
        await operation
      }
      if (generation.current !== active) return false
      localStorage.removeItem(preferenceKey)
      localStorage.removeItem(subscriptionKey)
      localStorage.removeItem(installationKey)
      setEnabled(false)
      setStatus('Notification' in window && Notification.permission === 'denied' ? 'blocked' : 'off')
      return true
    } catch (cause) {
      if (generation.current === active) {
        setStatus('error')
        setError(cause instanceof Error ? cause.message : '알림 해제를 완료하지 못했어요. 다시 시도해 주세요.')
      }
      return false
    } finally { if (busy.current === active) busy.current = null }
  }, [installationKey, preferenceKey, subscriptionKey])

  useEffect(() => {
    const active = ++generation.current
    let cancelled = false
    const subscriptions: (() => void)[] = []
    async function start() {
      if (!userId) return
      setEnabled(stored(preferenceKey) === 'true')
      setStatus('checking')
      setError('')
      if (needsIOSHomeScreen(navigator, window.matchMedia('(display-mode: standalone)').matches)) {
        setStatus('install-required')
        return
      }
      if (!config) { setStatus('unconfigured'); return }
      if (!window.isSecureContext || !('Notification' in window) || !await isSupported()) {
        if (!cancelled) {
          setStatus('unsupported')
          setError(window.isSecureContext ? '이 브라우저에서는 알림을 지원하지 않아요. 최신 브라우저에서 다시 열어 주세요.' : '알림을 사용하려면 HTTPS 주소로 접속해 주세요.')
        }
        return
      }
      if (cancelled) return
      const app = getApps().find((item) => item.name === 'bintime-push') ?? initializeApp(config!.firebase, 'bintime-push')
      const client = getMessaging(app)
      messaging.current = client
      subscriptions.push(
        onRegistered(client, (installationId) => {
          if (cancelled || stored(preferenceKey) !== 'true') return
          registrationSync.current = (async () => {
            localStorage.setItem(installationKey, installationId)
            const subscriptionId = await registerPushSubscription(installationId)
            if (cancelled || stored(preferenceKey) !== 'true') return
            try { localStorage.setItem(subscriptionKey, subscriptionId) }
            catch (cause) { await deletePushSubscription(subscriptionId); throw cause }
            if (!cancelled) setStatus('on')
          })().catch((cause: unknown) => {
            if (!cancelled) { setStatus('error'); setError(cause instanceof Error ? cause.message : '알림을 계정에 연결하지 못했어요.') }
          })
        }),
        onMessage(client, (payload) => {
          if (cancelled || stored(preferenceKey) !== 'true') return
          const text = pushMessageText(payload)
          if (!text) return
          notify(text, payload.data?.notificationId)
          if (Notification.permission !== 'granted') return
          void navigator.serviceWorker.getRegistration('/').then(async (registration) => {
            if (cancelled || stored(preferenceKey) !== 'true' || Notification.permission !== 'granted') return
            if (!registration) throw new Error('알림 서비스가 연결되지 않았어요. 알림을 다시 연결해 주세요.')
            await showForegroundPush(registration, payload)
          }).catch((cause: unknown) => {
            if (!cancelled && stored(preferenceKey) === 'true') { setStatus('error'); setError(cause instanceof Error ? cause.message : '시스템 알림을 표시하지 못했어요.') }
          })
        }),
      )
      setStatus(Notification.permission === 'denied' ? 'blocked' : 'off')
      if (stored(preferenceKey) === 'true' && Notification.permission === 'granted') await enable(false)
    }
    function syncPreference() {
      if (!messaging.current) return
      const next = stored(preferenceKey) === 'true'
      setEnabled(next)
      if (!next || Notification.permission !== 'granted') setStatus(Notification.permission === 'denied' ? 'blocked' : 'off')
    }
    function onStorage(event: StorageEvent) {
      if (event.key !== preferenceKey && event.key !== subscriptionKey && event.key !== null) return
      syncPreference()
      if (stored(preferenceKey) === 'true' && Notification.permission === 'granted') void enable(false)
    }
    void start().catch((cause: unknown) => {
      if (!cancelled) { setStatus('error'); setError(cause instanceof Error ? cause.message : '알림 기능을 준비하지 못했어요.') }
    })
    window.addEventListener('storage', onStorage)
    window.addEventListener('focus', syncPreference)
    return () => {
      cancelled = true
      generation.current = active + 1
      if (busy.current === active) busy.current = null
      subscriptions.forEach((unsubscribe) => unsubscribe())
      messaging.current = null
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', syncPreference)
    }
  }, [enable, installationKey, notify, preferenceKey, subscriptionKey, userId])

  return { status, enabled: Boolean(userId) && enabled, error, enable, disable }
}
