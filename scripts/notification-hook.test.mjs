import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { BackendApiError } from '../src/lib/backend-api.ts'
import { mergeNotifications } from '../src/lib/notifications.ts'

const compiled = ts.transpileModule(readFileSync(new URL('../src/hooks/useNotifications.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const tick = () => new Promise((resolve) => setImmediate(resolve))

async function mount(t) {
  const effects = [], calls = { lists: 0, toasts: [] }
  let stream
  const react = {
    useState(initial) {
      let value = initial
      return [value, (next) => { value = typeof next === 'function' ? next(value) : next }]
    },
    useRef: (current) => ({ current }), useCallback: (callback) => callback,
    useEffect: (setup) => effects.push(setup),
  }
  const notifications = {
    mergeNotifications,
    async fetchNotifications() { calls.lists++; return { items: [], unreadCount: 0, nextCursor: null } },
    readNotificationStream(options) {
      stream = options
      options.onOpen()
      return new Promise((resolve) => options.signal.addEventListener('abort', resolve, { once: true }))
    },
  }
  const exports = {}
  runInContext(compiled, createContext({
    exports, Error, AbortController, AbortSignal, queueMicrotask, setTimeout, clearTimeout,
    window: new EventTarget(), document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
    require(name) {
      if (name === 'react') return react
      if (name === '../lib/backend-api') return { BackendApiError }
      if (name === '../lib/notifications') return notifications
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
  exports.useNotifications('user-a', (message) => calls.toasts.push(message))
  const cleanups = effects.map((setup) => setup())
  const cleanup = () => cleanups.splice(0).forEach((stop) => stop?.())
  t.after(cleanup)
  await tick()
  calls.lists = 0
  return { calls, cleanup, created(type, id = 'notice-1') {
    stream.onEvent({ type: 'notification.created', id: `event-${id}`, notification: { id, type, title: '알림', body: '내용' } })
  } }
}

test('vacancy SSE refreshes the list without bypassing recent-location toast matching', async (t) => {
  const app = await mount(t)
  app.created('VACANCY_MATCHED')
  await tick()
  assert.equal(app.calls.lists, 1)
  assert.deepEqual(app.calls.toasts, [])
})

test('other SSE notifications still toast once per notification ID and refresh the list', async (t) => {
  const app = await mount(t)
  app.created('RESERVATION_CONFIRMED')
  app.created('RESERVATION_CONFIRMED')
  await tick()
  assert.equal(app.calls.lists, 2)
  assert.deepEqual(app.calls.toasts, ['알림 · 내용'])
})

test('late SSE events after cleanup cannot refresh or toast', async (t) => {
  const app = await mount(t)
  app.cleanup()
  app.created('VACANCY_MATCHED')
  app.created('CHAT_MESSAGE')
  await tick()
  assert.equal(app.calls.lists, 0)
  assert.deepEqual(app.calls.toasts, [])
})
