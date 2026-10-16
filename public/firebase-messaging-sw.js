function notificationUrl(value, shopId) {
  const fallback = new URL('/', self.location.origin).href
  try {
    const url = new URL(value || (shopId ? `/customer/shops/${encodeURIComponent(shopId)}` : '/'), self.location.origin)
    return url.origin === self.location.origin && url.protocol === self.location.protocol && !url.username && !url.password ? url.href : fallback
  } catch { return fallback }
}

function notificationDetails(data = {}) {
  return Object.fromEntries(Object.entries({
    notificationId: data.notificationId, notificationType: data.notificationType || data.type,
    roomId: data.roomId, messageId: data.messageId,
  }).filter(([, value]) => typeof value === 'string' && value.trim() && value.length <= 64 && !/\p{Cc}/u.test(value)))
}

// Firebase의 기본 클릭 처리보다 먼저 연결해, 이미 열린 탭도 알림의 목적지로 이동시킨다.
self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data
  const message = data?.FCM_MSG
  if (!message && !data?.bintime) return
  event.stopImmediatePropagation()
  event.notification.close()
  const details = notificationDetails(message?.data || data)
  const chatUrl = details.notificationType === 'CHAT_MESSAGE' && details.roomId ? `/chat?roomId=${encodeURIComponent(details.roomId)}` : undefined
  const url = notificationUrl(message?.fcmOptions?.link || message?.notification?.click_action || message?.data?.url || data?.url || chatUrl, message?.data?.shopId)
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const client = windows.find((item) => item.url === url) ?? windows.find((item) => new URL(item.url).origin === self.location.origin)
    if (client) {
      client.postMessage({ type: 'bintime:notification-click', url, ...details })
      return client.focus()
    }
    const destination = new URL(url)
    for (const [key, value] of Object.entries(details)) destination.searchParams.set(key, value)
    return self.clients.openWindow(destination.href)
  })())
})

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()))
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// SDK 자동 표시와 여러 탭의 수동 표시가 같은 큐와 ID 기록을 공유한다.
const logo = '/icons/puzzle-mark-192.png'
const showNotification = self.registration.showNotification.bind(self.registration)
self.registration.showNotification = (title, options = {}) => {
  const display = displayQueue.then(async () => {
    const message = options.data?.FCM_MSG
    const details = notificationDetails(message?.data || options.data)
    const id = details.notificationType === 'CHAT_MESSAGE' ? details.messageId || details.notificationId : details.notificationId || details.messageId
    const tag = id || message?.fcmMessageId || options.tag
    const key = tag ? new URL(`/__bintime_push__/${encodeURIComponent(`${details.notificationType === 'CHAT_MESSAGE' ? 'chat' : 'notification'}:${tag}`)}`, self.location.origin).href : undefined
    const cache = key ? await caches.open('bintime-displayed-notifications') : undefined
    if (cache && await cache.match(key)) return
    await showNotification(title, { ...options, tag, icon: logo, image: '/icons/puzzle-mark-512.png', badge: '/icons/puzzle-mark-badge-96.png' })
    if (cache) {
      await cache.put(key, new Response(''))
      // shortcut: 최근 500개 ID만 보관한다. 더 오래 재전송되는 운영 정책이면 보관 범위를 늘린다.
      const keys = await cache.keys()
      await Promise.all(keys.slice(0, Math.max(0, keys.length - 500)).map((entry) => cache.delete(entry)))
    }
  })
  displayQueue = display.catch(() => {})
  return display
}
let displayQueue = Promise.resolve()

function showPush(payload) {
  const data = payload.data ?? {}
  const title = (payload.notification?.title ?? data.title ?? '').trim()
  const body = (payload.notification?.body ?? data.body ?? '').trim()
  if (!title && !body) return Promise.resolve()
  const details = notificationDetails(data)
  const chatUrl = details.notificationType === 'CHAT_MESSAGE' && details.roomId ? `/chat?roomId=${encodeURIComponent(details.roomId)}` : undefined
  return self.registration.showNotification(title || '빈틈', {
    body, tag: details.notificationId || details.messageId || payload.messageId,
    data: { bintime: true, url: notificationUrl(payload.fcmOptions?.link || data.url || chatUrl, data.shopId), ...details },
  })
}

self.addEventListener('message', (event) => {
  if (event.origin !== self.location.origin || event.data?.type !== 'bintime:show-notification' || !event.ports[0]) return
  const port = event.ports[0]
  event.waitUntil(Promise.resolve().then(() => showPush(event.data.payload)).then(
    () => port.postMessage({ ok: true }),
    () => port.postMessage({ ok: false, error: '시스템 알림을 표시하지 못했어요. 브라우저 알림 설정을 확인해 주세요.' }),
  ).finally(() => port.close()))
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
    return showPush(payload)
  })
}
