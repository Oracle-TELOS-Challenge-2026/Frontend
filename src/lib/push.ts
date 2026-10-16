import type { MessagePayload } from 'firebase/messaging'

export function getPushConfig(env: Record<string, string | undefined>) {
  const firebase = {
    apiKey: env.VITE_FIREBASE_API_KEY?.trim() ?? '',
    projectId: env.VITE_FIREBASE_PROJECT_ID?.trim() ?? '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() ?? '',
    appId: env.VITE_FIREBASE_APP_ID?.trim() ?? '',
  }
  const vapidKey = env.VITE_FIREBASE_VAPID_KEY?.trim() ?? ''
  return Object.values(firebase).every(Boolean) && vapidKey ? { firebase, vapidKey } : null
}

export function pushMessageText(payload: MessagePayload) {
  const title = (payload.notification?.title ?? payload.data?.title ?? '').trim()
  const body = (payload.notification?.body ?? payload.data?.body ?? '').trim()
  return [title, body].filter(Boolean).join(' · ')
}

export function waitForActiveWorker(registration: ServiceWorkerRegistration) {
  const worker = registration.installing ?? registration.waiting ?? registration.active
  if (worker?.state === 'activated') return Promise.resolve()
  if (!worker || worker.state === 'redundant') return Promise.reject(new Error('알림 서비스가 활성화되지 않았어요.'))
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('알림 서비스 연결 시간이 초과됐어요. 다시 시도해 주세요.')), 15000)
    function finish(error?: Error) {
      clearTimeout(timer)
      worker!.removeEventListener('statechange', onStateChange)
      if (error) reject(error)
      else resolve()
    }
    function onStateChange() {
      if (worker!.state === 'activated') finish()
      else if (worker!.state === 'redundant') finish(new Error('알림 서비스 설치에 실패했어요.'))
    }
    worker.addEventListener('statechange', onStateChange)
    onStateChange()
  })
}
