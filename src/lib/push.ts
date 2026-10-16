import { apiId, mutateBackendApi } from './backend-api.ts'
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

export async function registerPushSubscription(installationId: string) {
  if (!installationId || installationId.length > 128 || /[\s\p{Cc}]/u.test(installationId)) throw new Error('유효한 알림 수신 정보를 받지 못했어요.')
  const { data } = await mutateBackendApi('/api/v1/notifications/push-subscriptions', { body: { installationId } })
  if (typeof data?.id !== 'string' || !data.id.trim()) throw new Error('알림 등록 결과를 확인하지 못했어요.')
  return data.id
}

export async function deletePushSubscription(subscriptionId: string, installationId?: string) {
  const id = subscriptionId || (installationId ? await registerPushSubscription(installationId) : '')
  if (!id.trim()) throw new Error('해제할 알림 정보를 확인하지 못했어요.')
  const { status } = await mutateBackendApi(`/api/v1/notifications/push-subscriptions/${apiId(id)}`, { method: 'DELETE' })
  if (status !== 204) throw new Error('알림 해제 결과를 확인하지 못했어요.')
}
