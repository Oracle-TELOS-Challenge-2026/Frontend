import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { getPushConfig, needsIOSHomeScreen, pushMessageText, showForegroundPush, waitForActiveWorker } from '../src/lib/push.ts'

const env = {
  VITE_FIREBASE_API_KEY: ' public-key ',
  VITE_FIREBASE_PROJECT_ID: ' project ',
  VITE_FIREBASE_MESSAGING_SENDER_ID: ' 123 ',
  VITE_FIREBASE_APP_ID: ' app-id ',
  VITE_FIREBASE_VAPID_KEY: ' vapid-key ',
}
const origin = 'https://bintime.example'
const workerSource = readFileSync(new URL('../public/firebase-messaging-sw.js', import.meta.url), 'utf8')

function memoryCaches() {
  const stores = new Map()
  return { open: async (name) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const entries = stores.get(name)
    return {
      match: async (key) => entries.get(typeof key === 'string' ? key : key.url),
      put: async (key, response) => entries.set(typeof key === 'string' ? key : key.url, response),
      keys: async () => [...entries.keys()].map((key) => new Request(key)),
      delete: async (key) => entries.delete(typeof key === 'string' ? key : key.url),
    }
  } }
}

function loadWorker(windows = [], configured = true, cacheStorage = memoryCaches()) {
  const listeners = new Map()
  const notifications = []
  const opened = []
  const imports = []
  let backgroundMessage
  let initialized = false
  let displayFailure
  const registration = {
    scope: `${origin}/`,
    showNotification(title, options) {
      assert.equal(this, registration)
      if (displayFailure) { const failure = displayFailure; displayFailure = undefined; throw failure }
      notifications.push({ title, ...options })
      return Promise.resolve()
    },
  }
  const query = configured ? '?apiKey=public-key&projectId=project&messagingSenderId=123&appId=app-id' : ''
  runInNewContext(workerSource, {
    URL, Response, Promise, caches: cacheStorage,
    self: {
      location: { origin, protocol: 'https:', href: `${origin}/firebase-messaging-sw.js${query}` },
      addEventListener: (type, listener) => listeners.set(type, listener),
      registration,
      clients: {
        matchAll: async () => windows,
        openWindow: async (url) => opened.push(url),
      },
    },
    importScripts: (url) => imports.push(url),
    firebase: {
      initializeApp: () => { initialized = true },
      app: () => ({}),
      messaging: () => ({ onBackgroundMessage: (callback) => { backgroundMessage = callback } }),
    },
  })
  registration.active = {
    state: 'activated',
    postMessage: (data, ports) => listeners.get('message')({ origin, data, ports, waitUntil: () => {} }),
  }
  return {
    initialized, imports, notifications, opened, registration,
    failNextDisplay: (failure) => { displayFailure = failure },
    receive: (payload) => backgroundMessage(payload),
    click: async (data) => {
      let pending
      let closed = false
      let stopped = false
      listeners.get('notificationclick')({
        notification: { data, close: () => { closed = true } },
        stopImmediatePropagation: () => { stopped = true },
        waitUntil: (promise) => { pending = promise },
      })
      await pending
      return { closed, stopped }
    },
  }
}

test('push configuration requires all public settings and trims their values', () => {
  assert.equal(getPushConfig({}), null)
  for (const key of Object.keys(env)) {
    for (const missing of [undefined, '', ' \n ']) {
      assert.equal(getPushConfig({ ...env, [key]: missing }), null, key)
    }
  }
  assert.deepEqual(getPushConfig(env), {
    firebase: { apiKey: 'public-key', projectId: 'project', messagingSenderId: '123', appId: 'app-id' },
    vapidKey: 'vapid-key',
  })
})

test('foreground messages format notification and data-only payloads without empty separators', () => {
  assert.equal(pushMessageText({ notification: { title: ' 빈자리 ', body: ' 예약 가능 ' }, data: { title: '무시' } }), '빈자리 · 예약 가능')
  assert.equal(pushMessageText({ data: { title: '빈자리', body: '예약 가능' } }), '빈자리 · 예약 가능')
  assert.equal(pushMessageText({ notification: { body: ' 예약 가능 ' } }), '예약 가능')
  assert.equal(pushMessageText({ data: { title: ' \n ', body: ' ' } }), '')
  assert.equal(pushMessageText({}), '')
})

test('foreground pushes display system notifications with app imagery and existing click routing', async () => {
  const worker = loadWorker()
  await showForegroundPush(worker.registration, {
    notification: { title: ' 새 채팅 ', body: ' 안녕하세요 ', icon: 'https://external.example/icon.png' },
    data: { title: '무시', notificationId: 'chat-1', url: '/owner/chat/room-1' }, messageId: 'message-1',
  })
  const notification = worker.notifications[0]
  assert.deepEqual(JSON.parse(JSON.stringify(notification)), {
    title: '새 채팅',
    body: '안녕하세요', icon: '/icons/puzzle-mark-192.png', image: '/icons/puzzle-mark-512.png', badge: '/icons/puzzle-mark-badge-96.png',
    tag: 'chat-1', data: { bintime: true, url: `${origin}/owner/chat/room-1`, notificationId: 'chat-1' },
  })
  await worker.click(notification.data)
  assert.deepEqual(worker.opened, [`${origin}/owner/chat/room-1?notificationId=chat-1`])

  await showForegroundPush(worker.registration, { data: { body: ' 예약 확정 ', shopId: 'shop/1' }, messageId: 'message-2' })
  const fallback = worker.notifications[1]
  assert.equal(fallback.title, '빈틈')
  assert.equal(fallback.body, '예약 확정')
  assert.equal(fallback.tag, 'message-2')
  assert.equal(fallback.data.url, `${origin}/customer/shops/shop%2F1`)
  await showForegroundPush(worker.registration, {})
  await showForegroundPush(worker.registration, { data: { title: ' \n ', body: ' ' } })
  assert.equal(worker.notifications.length, 2)
})

test('foreground pushes allow same-origin links and reject unsafe destinations', async () => {
  const worker = loadWorker()
  for (const [link, expected] of [
    [`${origin}/customer/chat/shop-1?tab=messages#latest`, '/customer/chat/shop-1?tab=messages#latest'],
    ['/owner?date=2026-10-18', '/owner?date=2026-10-18'],
    ['https://external.example/path', '/'],
    ['//external.example/path', '/'],
    ['javascript:alert(1)', '/'],
    [`blob:${origin}/test-id`, '/'],
    ['http://bintime.example/path', '/'],
    ['https://name:password@bintime.example/path', '/'],
    ['http://[', '/'],
  ]) {
    for (const payload of [{ fcmOptions: { link }, data: { url: '/ignored' } }, { data: { url: link } }]) {
      await showForegroundPush(worker.registration, { ...payload, notification: { title: '알림' } })
      assert.equal(worker.notifications.at(-1).data.url, `${origin}${expected}`, link)
    }
  }
})

test('foreground pushes report missing workers, display failures, and response timeouts', async (t) => {
  const payload = { notification: { title: '알림' } }
  await assert.rejects(showForegroundPush({}, payload), /활성화/)
  const worker = loadWorker()
  worker.registration.showNotification = () => Promise.reject(new Error('permission denied'))
  await assert.rejects(showForegroundPush(worker.registration, payload), /시스템 알림을 표시하지 못했어요/)
  const unavailable = { active: { state: 'activated', postMessage: () => { throw new Error('worker stopped') } } }
  await assert.rejects(showForegroundPush(unavailable, payload), /worker stopped/)
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const timedOut = assert.rejects(showForegroundPush({ active: { state: 'activated', postMessage: () => {} } }, payload), /시간이 초과/)
  t.mock.timers.tick(10000)
  await timedOut
})

test('shared worker deduplicates repeated IDs across tabs, background delivery, and worker restarts', async () => {
  const cacheStorage = memoryCaches()
  const worker = loadWorker([], true, cacheStorage)
  const vacancy = { messageId: 'delivery-1', data: { type: 'VACANCY_MATCHED', title: '빈자리', notificationId: 'notice-1' } }
  await Promise.all([
    showForegroundPush(worker.registration, vacancy),
    showForegroundPush(worker.registration, { ...vacancy, messageId: 'delivery-2' }),
    worker.receive(vacancy),
  ])
  assert.equal(worker.notifications.length, 1)
  const chat = { messageId: 'delivery-3', data: { type: 'CHAT_MESSAGE', title: '새 채팅', notificationId: 'notice-2', messageId: 'chat-1', roomId: 'room-1' } }
  await Promise.all([
    showForegroundPush(worker.registration, chat),
    showForegroundPush(worker.registration, { ...chat, data: { ...chat.data, notificationId: 'notice-3' } }),
  ])
  assert.equal(worker.notifications.length, 2)
  assert.equal(worker.notifications[1].tag, 'chat-1')
  await worker.click(worker.notifications[1].data)
  await showForegroundPush(worker.registration, chat)
  assert.equal(worker.notifications.length, 2)

  const restarted = loadWorker([], true, cacheStorage)
  await showForegroundPush(restarted.registration, vacancy)
  await restarted.receive(chat)
  assert.equal(restarted.notifications.length, 0)
  await restarted.receive({ ...chat, data: { ...chat.data, messageId: 'chat-2' } })
  assert.equal(restarted.notifications.length, 1)
})

test('SDK automatic notifications share deduplication and failed displays remain retryable', async () => {
  const worker = loadWorker()
  const data = { type: 'CHAT_MESSAGE', title: '새 채팅', messageId: 'chat-1', notificationId: 'chat-1', roomId: 'room-1' }
  const options = { data: { FCM_MSG: { data, fcmMessageId: 'delivery-1' } } }
  await worker.registration.showNotification('새 채팅', options)
  await worker.registration.showNotification('새 채팅', options)
  await worker.receive({ notification: { title: '새 채팅' }, data })
  await showForegroundPush(worker.registration, { notification: { title: '새 채팅' }, data })
  assert.equal(worker.notifications.length, 1)

  const retry = { data: { title: '빈자리', notificationId: 'retry-1' } }
  worker.failNextDisplay(new Error('temporary display failure'))
  await assert.rejects(showForegroundPush(worker.registration, retry), /시스템 알림/)
  await showForegroundPush(worker.registration, retry)
  assert.equal(worker.notifications.length, 2)
})

test('iOS installation guidance distinguishes browser tabs from home-screen apps', () => {
  for (const device of [
    { userAgent: 'Mozilla iPhone OS 17_0', maxTouchPoints: 5 },
    { userAgent: 'Mozilla iPad OS 17_0', maxTouchPoints: 5 },
    { userAgent: 'Mozilla Macintosh Intel Mac OS X', maxTouchPoints: 5 },
  ]) {
    assert.equal(needsIOSHomeScreen(device, false), true)
    assert.equal(needsIOSHomeScreen(device, true), false)
    assert.equal(needsIOSHomeScreen({ ...device, standalone: true }, false), false)
  }
  assert.equal(needsIOSHomeScreen({ userAgent: 'Mozilla Macintosh Intel Mac OS X', maxTouchPoints: 0 }, false), false)
  assert.equal(needsIOSHomeScreen({ userAgent: 'Mozilla Android', maxTouchPoints: 5 }, false), false)
})

test('service worker activation waits for installation and rejects missing or failed workers', async () => {
  await waitForActiveWorker({ active: { state: 'activated' } })
  await assert.rejects(waitForActiveWorker({}), /활성화/)
  await assert.rejects(waitForActiveWorker({ installing: { state: 'redundant' } }), /활성화/)
  for (const state of ['activated', 'redundant']) {
    const worker = Object.assign(new EventTarget(), { state: 'installing' })
    let settled = false
    const waiting = waitForActiveWorker({ installing: worker })
    const checked = state === 'activated' ? waiting.then(() => { settled = true }) : assert.rejects(waiting, /설치에 실패/)
    await Promise.resolve()
    assert.equal(settled, false)
    worker.state = state
    worker.dispatchEvent(new Event('statechange'))
    await checked
    if (state === 'activated') assert.equal(settled, true)
  }
})

test('service worker activation times out instead of leaving registration pending', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const worker = Object.assign(new EventTarget(), { state: 'installing' })
  const rejected = assert.rejects(waitForActiveWorker({ installing: worker }), /시간이 초과/)
  t.mock.timers.tick(15000)
  await rejected
})

test('background notifications avoid SDK duplicates and display data-only content', async () => {
  const worker = loadWorker()
  await worker.receive({ notification: { title: 'SDK 알림' }, data: { title: '중복 금지' } })
  await worker.receive({ data: { shopId: 'shop-1' } })
  assert.equal(worker.notifications.length, 0)
  await worker.receive({ messageId: 'message-1', data: { body: '예약 가능', shopId: 'shop/1', notificationId: 'notice-1' } })
  const notification = worker.notifications[0]
  assert.equal(notification.title, '빈틈')
  assert.equal(notification.body, '예약 가능')
  assert.equal(notification.tag, 'notice-1')
  assert.equal(notification.data.url, `${origin}/customer/shops/shop%2F1`)
  assert.equal(notification.data.bintime, true)
  assert.equal(notification.data.notificationId, 'notice-1')
  assert.equal(notification.icon, '/icons/puzzle-mark-192.png')
  assert.equal(notification.image, '/icons/puzzle-mark-512.png')
  assert.equal(notification.badge, '/icons/puzzle-mark-badge-96.png')
  await worker.click(notification.data)
  assert.deepEqual(worker.opened, [`${origin}/customer/shops/shop%2F1?notificationId=notice-1`])
})

test('SDK notifications keep their content and click data while all imagery uses the BinTime logo', async () => {
  const worker = loadWorker()
  const options = {
    body: '예약 가능', tag: 'notice-1',
    icon: 'https://external.example/icon.png',
    image: 'https://external.example/banner.png',
    badge: 'https://external.example/badge.png',
    data: { FCM_MSG: { data: { url: '/customer/waitlist' } } },
  }
  const result = worker.registration.showNotification('빈자리 알림', options)
  assert.ok(result instanceof Promise)
  await result
  const logo = '/icons/puzzle-mark-192.png'
  assert.deepEqual(worker.notifications, [{ title: '빈자리 알림', ...options, icon: logo, image: '/icons/puzzle-mark-512.png', badge: '/icons/puzzle-mark-badge-96.png' }])
  assert.equal(options.image, 'https://external.example/banner.png')
  await worker.click(worker.notifications[0].data)
  assert.deepEqual(worker.opened, [`${origin}/customer/waitlist`])
  await worker.registration.showNotification('이미지 없는 알림')
  assert.equal(worker.notifications[1].icon, logo)
  const file = readFileSync(new URL(`../public${logo}`, import.meta.url))
  assert.equal(file.subarray(1, 4).toString(), 'PNG')
})

test('notification clicks allow same-origin destinations and reject unsafe links', async () => {
  for (const [url, expected] of [
    ['/customer/shops/shop-1', '/customer/shops/shop-1'],
    [`${origin}/customer?tab=waitlist`, '/customer?tab=waitlist'],
    ['https://external.example/path', '/'],
    ['//external.example/path', '/'],
    ['javascript:alert(1)', '/'],
    ['data:text/html,unsafe', '/'],
    [`blob:${origin}/test-id`, '/'],
    ['http://bintime.example/path', '/'],
    ['https://name:password@bintime.example/path', '/'],
    ['http://[', '/'],
  ]) {
    for (const message of [{ fcmOptions: { link: url } }, { notification: { click_action: url } }]) {
      const worker = loadWorker()
      assert.deepEqual(await worker.click({ FCM_MSG: message }), { closed: true, stopped: true })
      assert.deepEqual(worker.opened, [`${origin}${expected}`], url)
    }
  }
  const worker = loadWorker()
  await worker.click({ FCM_MSG: { data: { shopId: 'shop-2' } } })
  assert.deepEqual(worker.opened, [`${origin}/customer/shops/shop-2`])
  assert.deepEqual(await worker.click({ unrelated: true }), { closed: false, stopped: false })
})

test('notification clicks message and focus an existing app tab without reloading its state', async () => {
  const target = `${origin}/customer/shops/shop-1`
  const existingMessages = []
  const matchingMessages = []
  let focused = 0
  const existing = {
    url: `${origin}/customer`,
    postMessage: (message) => existingMessages.push({ ...message }),
    focus: () => { focused++ },
    navigate: () => assert.fail('Reloading an existing tab would discard its in-memory state'),
  }
  const matching = {
    ...existing,
    url: target,
    postMessage: (message) => matchingMessages.push({ ...message }),
  }
  const exact = loadWorker([existing, matching])
  await exact.click({ bintime: true, url: target })
  assert.equal(focused, 1)
  assert.deepEqual(matchingMessages, [{ type: 'bintime:notification-click', url: target }])
  assert.deepEqual(existingMessages, [])
  assert.deepEqual(exact.opened, [])

  const other = loadWorker([existing])
  await other.click({ bintime: true, url: target })
  assert.equal(focused, 2)
  assert.deepEqual(existingMessages, [{ type: 'bintime:notification-click', url: target }])
  assert.deepEqual(other.opened, [])

  const external = loadWorker([{ url: 'https://external.example/', focus: () => assert.fail('An unrelated tab must not be focused') }])
  await external.click({ bintime: true, url: target })
  assert.deepEqual(external.opened, [target])
})

test('service worker waits for configuration and uses the installed Firebase SDK version', () => {
  assert.equal(loadWorker([], false).initialized, false)
  const worker = loadWorker()
  assert.equal(worker.initialized, true)
  const { dependencies } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(worker.imports.length, 2)
  for (const url of worker.imports) assert.equal(new URL(url).pathname.split('/')[2], dependencies.firebase)
})

test('notification clicks keep the ID for read state in both existing and new tabs', async () => {
  const messages = []
  const worker = loadWorker([{ url: origin, postMessage: (message) => messages.push({ ...message }), focus: () => {} }])
  await worker.click({ FCM_MSG: { data: { url: '/customer/waitlist', notificationId: 'noti-1' } } })
  assert.deepEqual(messages, [{ type: 'bintime:notification-click', url: `${origin}/customer/waitlist`, notificationId: 'noti-1' }])
  const fresh = loadWorker()
  await fresh.click({ bintime: true, url: '/customer/shops/a?slotId=slot-1', notificationId: 'noti/1' })
  assert.deepEqual(fresh.opened, [`${origin}/customer/shops/a?slotId=slot-1&notificationId=noti%2F1`])
  const invalid = loadWorker()
  await invalid.click({ bintime: true, url: '/customer/waitlist', notificationId: 'bad\nvalue' })
  assert.deepEqual(invalid.opened, [`${origin}/customer/waitlist`])
})

test('chat click metadata survives existing-tab messages and new-window query parameters', async () => {
  const details = { notificationId: 'chat-1', notificationType: 'CHAT_MESSAGE', roomId: 'room/1', messageId: 'chat-1' }
  const messages = []
  const worker = loadWorker([{ url: origin, postMessage: (message) => messages.push({ ...message }), focus: () => {} }])
  await showForegroundPush(worker.registration, { data: { title: '새 채팅', type: 'CHAT_MESSAGE', roomId: 'room/1', messageId: 'chat-1', notificationId: 'chat-1' } })
  await worker.click(worker.notifications[0].data)
  const url = `${origin}/chat?roomId=room%2F1`
  assert.deepEqual(messages, [{ type: 'bintime:notification-click', url, ...details }])
  const fresh = loadWorker()
  await fresh.click({ FCM_MSG: { data: { title: '새 채팅', type: 'CHAT_MESSAGE', roomId: 'room/1', messageId: 'chat-1', notificationId: 'chat-1' } } })
  const destination = new URL(url)
  for (const [key, value] of Object.entries(details)) destination.searchParams.set(key, value)
  assert.deepEqual(fresh.opened, [destination.href])
  const invalid = loadWorker()
  await invalid.click({ bintime: true, url: '/chat?roomId=room-1', notificationType: 'CHAT_MESSAGE', roomId: 'bad\nroom', messageId: 'x'.repeat(65) })
  assert.deepEqual(invalid.opened, [`${origin}/chat?roomId=room-1&notificationType=CHAT_MESSAGE`])
})

test('chat and reservation notifications open their customer or owner destinations with read-state IDs', async () => {
  for (const path of ['/customer/chat/room-1', '/owner/chat/room-1', '/customer/reservations/res-1', '/owner?date=2026-10-18']) {
    const worker = loadWorker()
    await worker.receive({ data: { title: '새 소식', body: '확인해 주세요.', url: path, notificationId: 'activity-1' } })
    assert.equal(worker.notifications[0].data.url, `${origin}${path}`)
    await worker.click(worker.notifications[0].data)
    const destination = new URL(path, origin)
    destination.searchParams.set('notificationId', 'activity-1')
    assert.deepEqual(worker.opened, [destination.href])
  }
})
