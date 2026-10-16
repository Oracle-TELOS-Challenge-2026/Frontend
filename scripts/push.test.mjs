import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { getPushConfig, pushMessageText, waitForActiveWorker } from '../src/lib/push.ts'

const env = {
  VITE_FIREBASE_API_KEY: ' public-key ',
  VITE_FIREBASE_PROJECT_ID: ' project ',
  VITE_FIREBASE_MESSAGING_SENDER_ID: ' 123 ',
  VITE_FIREBASE_APP_ID: ' app-id ',
  VITE_FIREBASE_VAPID_KEY: ' vapid-key ',
}
const origin = 'https://bintime.example'
const workerSource = readFileSync(new URL('../public/firebase-messaging-sw.js', import.meta.url), 'utf8')

function loadWorker(windows = [], configured = true) {
  const listeners = new Map()
  const notifications = []
  const opened = []
  const imports = []
  let backgroundMessage
  let initialized = false
  const query = configured ? '?apiKey=public-key&projectId=project&messagingSenderId=123&appId=app-id' : ''
  runInNewContext(workerSource, {
    URL,
    self: {
      location: { origin, protocol: 'https:', href: `${origin}/firebase-messaging-sw.js${query}` },
      addEventListener: (type, listener) => listeners.set(type, listener),
      registration: { showNotification: (title, options) => notifications.push({ title, ...options }) },
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
  return {
    initialized, imports, notifications, opened,
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
  await worker.click(notification.data)
  assert.deepEqual(worker.opened, [`${origin}/customer/shops/shop%2F1`])
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
