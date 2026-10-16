function notificationUrl(value, shopId) {
  const fallback = new URL('/', self.location.origin).href
  try {
    const url = new URL(value || (shopId ? `/customer/shops/${encodeURIComponent(shopId)}` : '/'), self.location.origin)
    return url.origin === self.location.origin && url.protocol === self.location.protocol && !url.username && !url.password ? url.href : fallback
  } catch { return fallback }
}

// Firebase의 기본 클릭 처리보다 먼저 연결해, 이미 열린 탭도 알림의 목적지로 이동시킨다.
self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data
  const message = data?.FCM_MSG
  if (!message && !data?.bintime) return
  event.stopImmediatePropagation()
  event.notification.close()
  const url = notificationUrl(message?.fcmOptions?.link || message?.notification?.click_action || message?.data?.url || data?.url, message?.data?.shopId)
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const client = windows.find((item) => item.url === url) ?? windows.find((item) => new URL(item.url).origin === self.location.origin)
    if (client) {
      client.postMessage({ type: 'bintime:notification-click', url })
      return client.focus()
    }
    return self.clients.openWindow(url)
  })())
})

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// SDK 자동 알림과 직접 표시하는 알림 모두 발송자가 지정한 이미지 대신 빈틈 로고를 사용한다.
const logo = '/images/bintime-mascot-coral.png'
const showNotification = self.registration.showNotification.bind(self.registration)
self.registration.showNotification = (title, options = {}) => showNotification(title, {
  ...options,
  icon: logo,
  image: logo,
  badge: logo,
})

importScripts('https://www.gstatic.com/firebasejs/13.0.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging-compat.js')

const params = new URL(self.location.href).searchParams
const config = Object.fromEntries(['apiKey', 'projectId', 'messagingSenderId', 'appId'].map((key) => [key, params.get(key)]))
if (Object.values(config).every(Boolean)) {
  firebase.initializeApp(config, 'bintime-push')
  firebase.messaging(firebase.app('bintime-push')).onBackgroundMessage((payload) => {
    // notification 메시지는 SDK가 이미 표시하므로 data-only 메시지만 직접 표시한다.
    if (payload.notification) return
    const data = payload.data ?? {}
    if (!data.title && !data.body) return
    return self.registration.showNotification(data.title || '빈틈', {
      body: data.body || '',
      tag: data.notificationId || payload.messageId,
      data: { bintime: true, url: notificationUrl(data.url, data.shopId) },
    })
  })
}
