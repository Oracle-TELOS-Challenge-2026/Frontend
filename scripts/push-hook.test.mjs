import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { needsIOSHomeScreen, pushMessageText } from '../src/lib/push.ts'

const source = readFileSync(new URL('../src/hooks/usePushNotifications.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source.replace('import.meta.env', '{}'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const tick = () => new Promise((resolve) => setImmediate(resolve))
function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function mount({ ios = false, standalone = false, permission = 'granted', saved = {}, overrides = {} } = {}) {
  const slots = []
  const effects = []
  let cursor = 0
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
  const react = {
    useState(initial) {
      const index = cursor++
      slots[index] ??= { value: initial }
      return [slots[index].value, (value) => { slots[index].value = value }]
    },
    useRef(initial) { return slots[cursor++] ??= { current: initial } },
    useCallback(callback, deps) {
      const index = cursor++
      if (!same(slots[index]?.deps, deps)) slots[index] = { value: callback, deps }
      return slots[index].value
    },
    useEffect(setup, deps) {
      const index = cursor++
      if (!same(slots[index]?.deps, deps)) effects.push(() => {
        slots[index]?.cleanup?.()
        slots[index] = { deps, cleanup: setup() }
      })
    },
  }
  const storage = new Map(Object.entries(saved))
  const calls = { permission: 0, supported: 0, register: 0, unregister: 0, server: 0, shown: [], toasts: [] }
  const listeners = { messages: new Set(), registered: new Set() }
  const client = {} // Firebase returns the same client even when the account changes.
  const worker = { active: { state: 'activated' } }
  const Notification = {
    permission,
    async requestPermission() { calls.permission++; Notification.permission = 'granted'; return 'granted' },
  }
  const window = Object.assign(new EventTarget(), {
    isSecureContext: true, Notification, location: { origin: 'https://app.example' },
    matchMedia: () => ({ matches: standalone }),
  })
  const navigator = {
    userAgent: ios ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)' : 'Macintosh',
    maxTouchPoints: ios ? 5 : 0,
    standalone,
    serviceWorker: { register: async () => worker, getRegistration: async () => worker },
  }
  const sdk = {
    getApps: () => [{ name: 'bintime-push' }], initializeApp: () => ({}), getMessaging: () => client,
    async isSupported() { calls.supported++; return true },
    onMessage(_, callback) { listeners.messages.add(callback); return () => listeners.messages.delete(callback) },
    onRegistered(_, callback) { listeners.registered.add(callback); return () => listeners.registered.delete(callback) },
    async register() { calls.register++; listeners.registered.forEach((callback) => callback('fid')) },
    async unregister() { calls.unregister++ },
    ...overrides.sdk,
  }
  const push = {
    getPushConfig: () => ({ firebase: { projectId: 'test' }, vapidKey: 'public-test-key' }),
    needsIOSHomeScreen, pushMessageText,
    waitForActiveWorker: async () => {},
    async registerPushSubscription() { calls.server++; return 'subscription' },
    deletePushSubscription: async () => {},
    async showForegroundPush(...args) { calls.shown.push(args) },
    ...overrides.push,
  }
  Object.assign(Notification, overrides.Notification)
  Object.assign(navigator.serviceWorker, overrides.serviceWorker)
  const exports = {}
  runInContext(compiled, createContext({
    exports, URL, URLSearchParams, Error, Notification, window, navigator,
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: (key) => storage.delete(key) },
    require(name) {
      if (name === 'react') return react
      if (name === '../lib/push') return push
      if (name.startsWith('firebase/')) return sdk
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
  let userId = 'user-a'
  const notify = (...args) => calls.toasts.push(args)
  function render(nextUser = userId) {
    userId = nextUser
    cursor = 0
    const result = exports.usePushNotifications(notify, userId)
    effects.splice(0).forEach((effect) => effect())
    return result
  }
  render()
  return { render, calls, storage, listeners, Notification, worker, message: (payload) => listeners.messages.forEach((callback) => callback(payload)) }
}

test('iPhone browser shows installation guidance without requesting permission or registering', async () => {
  const app = mount({ ios: true, permission: 'default', saved: { 'bintime.push.user-a': 'true' } })
  await tick()
  assert.equal(app.render().status, 'install-required')
  assert.equal(app.calls.supported, 0)
  assert.equal(app.calls.permission, 0)
  assert.equal(app.calls.register, 0)
})

test('installed iPhone checks capabilities and waits for the button and server confirmation', async () => {
  const server = deferred()
  const app = mount({ ios: true, standalone: true, permission: 'default', overrides: { push: { registerPushSubscription: () => server.promise } } })
  await tick()
  assert.equal(app.render().status, 'off')
  assert.equal(app.calls.permission, 0)
  const enabled = app.render().enable()
  await tick()
  assert.equal(app.calls.permission, 1)
  assert.equal(app.render().status, 'connecting')
  server.resolve('server-id')
  await enabled
  assert.equal(app.render().status, 'on')
  assert.equal(app.storage.get('bintime.push.user-a.subscription'), 'server-id')
})

test('denied permission and unsupported APIs do not register', async () => {
  const blocked = mount({ permission: 'denied' })
  await tick()
  await blocked.render().enable()
  assert.equal(blocked.render().status, 'blocked')
  assert.equal(blocked.calls.register, 0)
  const unsupported = mount({ overrides: { sdk: { isSupported: async () => false } } })
  await tick()
  assert.equal(unsupported.render().status, 'unsupported')
  assert.equal(unsupported.calls.register, 0)
})

test('service worker and server registration failures remain errors, never connected', async () => {
  for (const overrides of [
    { serviceWorker: { register: async () => { throw new Error('worker unavailable') } } },
    { push: { registerPushSubscription: async () => { throw new Error('server unavailable') } } },
  ]) {
    const app = mount({ overrides })
    await tick()
    await app.render().enable()
    assert.equal(app.render().status, 'error')
    assert.match(app.render().error, /unavailable/)
  }
})

test('a permission result from a previous account cannot register or block the new account', async () => {
  const permission = deferred()
  const app = mount({ permission: 'default', overrides: { Notification: { requestPermission: () => permission.promise } } })
  await tick()
  const oldEnable = app.render().enable()
  app.render('user-b')
  await tick()
  permission.resolve('granted')
  await oldEnable
  assert.equal(app.calls.register, 0)
  assert.equal(app.storage.has('bintime.push.user-a'), false)
  app.Notification.permission = 'granted'
  await app.render().enable()
  assert.equal(app.calls.register, 1)
  assert.equal(app.render().status, 'on')
})

test('stale server registration cannot write subscription state into the next account', async () => {
  const server = deferred()
  const app = mount({ overrides: { push: { registerPushSubscription: () => server.promise } } })
  await tick()
  const oldEnable = app.render().enable()
  await tick()
  assert.equal(app.render().status, 'connecting')
  app.render('user-b')
  await tick()
  server.resolve('old-subscription')
  await oldEnable
  assert.equal(app.storage.has('bintime.push.user-a.subscription'), false)
  assert.equal(app.render().status, 'off')
})

test('foreground display is independent of toast dedup and reports display errors', async () => {
  const payload = { notification: { title: '알림', body: '도착' }, data: { notificationId: 'notice-1' } }
  const app = mount({ saved: { 'bintime.push.user-a': 'true' } })
  await tick()
  app.message(payload)
  app.message(payload)
  await tick()
  assert.equal(app.calls.shown.length, 2) // Shared service worker owns system dedup, not the toast callback.
  assert.equal(app.calls.toasts.length, 2)
  const failed = mount({ saved: { 'bintime.push.user-a': 'true' }, overrides: { push: { showForegroundPush: async () => { throw new Error('display failed') } } } })
  await tick()
  failed.message(payload)
  await tick()
  assert.equal(failed.calls.toasts.length, 1)
  assert.equal(failed.render().status, 'error')
  assert.equal(failed.render().error, 'display failed')
})

test('logout stops old listeners and pending foreground display', async () => {
  const registration = deferred()
  const app = mount({ saved: { 'bintime.push.user-a': 'true' }, overrides: { serviceWorker: { getRegistration: () => registration.promise } } })
  await tick()
  const oldListener = [...app.listeners.messages][0]
  app.message({ notification: { title: 'before logout' } })
  app.render(null)
  registration.resolve(app.worker)
  await tick()
  oldListener({ notification: { title: 'after logout' } })
  assert.equal(app.listeners.messages.size, 0)
  assert.equal(app.calls.toasts.length, 1)
  assert.equal(app.calls.shown.length, 0)
  assert.equal(app.render().enabled, false)
})

test('stale disable does not unregister the shared Firebase client after an account change', async () => {
  const removed = deferred()
  const app = mount({ saved: { 'bintime.push.user-a': 'true', 'bintime.push.user-a.subscription': 'old-id' }, overrides: { push: { deletePushSubscription: () => removed.promise } } })
  await tick()
  const oldDisable = app.render().disable()
  app.render('user-b')
  await tick()
  removed.resolve()
  assert.equal(await oldDisable, false)
  assert.equal(app.calls.unregister, 0)
  assert.equal(app.render().status, 'off')
})

test('new account registration waits for an already running Firebase unregister', async () => {
  const unregistered = deferred()
  let unregisterStarted = false
  const app = mount({
    saved: { 'bintime.push.user-a': 'true', 'bintime.push.user-a.subscription': 'old-id' },
    overrides: { sdk: { unregister: async () => { unregisterStarted = true; await unregistered.promise } } },
  })
  await tick()
  assert.equal(app.calls.register, 1)
  const disabling = app.render().disable()
  await tick()
  assert.equal(unregisterStarted, true)
  app.render('user-b')
  await tick()
  const enabling = app.render().enable()
  await tick()
  assert.equal(app.render().status, 'connecting')
  assert.equal(app.calls.register, 1)
  unregistered.resolve()
  assert.equal(await disabling, false)
  await enabling
  assert.equal(app.calls.register, 2)
  assert.equal(app.render().status, 'on')
  assert.equal(app.storage.get('bintime.push.user-b.subscription'), 'subscription')
})
