import { useCallback, useEffect, useRef, useState } from 'react'
import { getApps, initializeApp } from 'firebase/app'
import { getMessaging, isSupported, onMessage, onRegistered, register, unregister } from 'firebase/messaging'
import type { Messaging } from 'firebase/messaging'
import { deletePushSubscription, getPushConfig, pushMessageText, registerPushSubscription, waitForActiveWorker } from '../lib/push'

const config = getPushConfig(import.meta.env)
type PushStatus = 'unconfigured' | 'checking' | 'unsupported' | 'off' | 'blocked' | 'connecting' | 'on' | 'error'

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
  const busy = useRef(false)
  const registrationSync = useRef<Promise<void> | null>(null)

  const enable = useCallback(async (askPermission = true) => {
    const client = messaging.current
    if (!userId || !config || busy.current) return
    if (!client) { setError('알림 기능을 준비하고 있어요. 잠시 후 다시 시도해 주세요.'); return }
    busy.current = true
    setStatus('connecting')
    setError('')
    try {
      const permission = askPermission && Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
      if (permission !== 'granted') { setStatus(permission === 'denied' ? 'blocked' : 'off'); return }
      localStorage.setItem(preferenceKey, 'true')
      setEnabled(true)
      const url = new URL('/firebase-messaging-sw.js', window.location.origin)
      url.search = new URLSearchParams(config.firebase).toString()
      const serviceWorkerRegistration = await navigator.serviceWorker.register(url, { scope: '/', updateViaCache: 'none' })
      await waitForActiveWorker(serviceWorkerRegistration)
      if (messaging.current !== client || stored(preferenceKey) !== 'true') return
      registrationSync.current = null
      await register(client, { vapidKey: config.vapidKey, serviceWorkerRegistration })
      await registrationSync.current
    } catch (cause) {
      if (messaging.current === client) {
        setStatus('error')
        setError(cause instanceof Error ? cause.message : '알림을 연결하지 못했어요. 다시 시도해 주세요.')
      }
    } finally { busy.current = false }
  }, [preferenceKey, userId])

  const disable = useCallback(async (): Promise<boolean> => {
    const client = messaging.current
    if (busy.current) return false
    busy.current = true
    setStatus('connecting')
    setError('')
    try {
      const subscriptionId = stored(subscriptionKey)
      const installationId = stored(installationKey)
      if (subscriptionId || installationId) await deletePushSubscription(subscriptionId, installationId)
      if (client) await unregister(client)
      localStorage.removeItem(preferenceKey)
      localStorage.removeItem(subscriptionKey)
      localStorage.removeItem(installationKey)
      setEnabled(false)
      setStatus('Notification' in window && Notification.permission === 'denied' ? 'blocked' : 'off')
      return true
    } catch (cause) {
      setStatus('error')
      setError(cause instanceof Error ? cause.message : '알림 해제를 완료하지 못했어요. 다시 시도해 주세요.')
      return false
    } finally { busy.current = false }
  }, [installationKey, preferenceKey, subscriptionKey])

  useEffect(() => {
    if (!config || !userId) return
    let cancelled = false
    const subscriptions: (() => void)[] = []
    async function start() {
      setEnabled(stored(preferenceKey) === 'true')
      setStatus('checking')
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
          if (cancelled || stored(preferenceKey) !== 'true') return
          registrationSync.current = (async () => {
            localStorage.setItem(installationKey, installationId)
            const subscriptionId = await registerPushSubscription(installationId)
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
          if (text) notify(text, payload.data?.notificationId)
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
      subscriptions.forEach((unsubscribe) => unsubscribe())
      messaging.current = null
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('focus', syncPreference)
    }
  }, [enable, installationKey, notify, preferenceKey, subscriptionKey, userId])

  return { status, enabled: Boolean(userId) && enabled, error, enable, disable }
}
