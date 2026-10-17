import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { BackendApiError } from '../src/lib/backend-api.ts'
import { restoreAccountRole } from '../src/lib/account.ts'

const source = readFileSync(new URL('../src/hooks/useAccount.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
const tick = () => new Promise((resolve) => setImmediate(resolve))
const authenticated = (id = 'user-a', version = 7, displayName = '카카오 별명') => ({
  status: 'authenticated',
  user: { id, version, displayName, roles: ['CUSTOMER'], ownedStoreIds: [], preferences: { text: '' } },
})
function deferred() {
  let resolve
  const promise = new Promise((yes) => { resolve = yes })
  return { promise, resolve }
}

function mount({ saved = {}, storageBlocked = false, readSession, updateDisplayName } = {}) {
  const slots = [], effects = []
  let cursor = 0, session = authenticated()
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
  const calls = { reads: 0, updates: [] }
  const auth = {
    readSession: async () => { calls.reads++; return readSession ? readSession(calls.reads, session) : session },
    logout: async () => { session = { status: 'anonymous' } },
  }
  const userApi = {
    async updateDisplayName(name, version) {
      const id = session.user.id
      calls.updates.push([name, version])
      await updateDisplayName?.(name, version)
      if (session.user?.id === id) session = authenticated(id, version + 1, name.trim())
    },
  }
  const exports = {}
  runInContext(compiled, createContext({
    exports, Error, AbortController,
    localStorage: {
      getItem(key) { if (storageBlocked) throw new Error('Storage blocked'); return storage.get(key) ?? null },
      setItem(key, value) { if (storageBlocked) throw new Error('Storage blocked'); storage.set(key, value) },
    },
    require(name) {
      if (name === 'react') return react
      if (name === '../lib/account') return { restoreAccountRole }
      if (name === '../lib/auth') return auth
      if (name === '../lib/backend-api') return { BackendApiError }
      if (name === '../lib/user-api') return userApi
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
  function render() {
    cursor = 0
    const result = exports.useAccount()
    effects.splice(0).forEach((effect) => effect())
    return result
  }
  render()
  return { render, calls, storage, setSession: (next) => { session = next } }
}

test('customer registration waits for profile save and refresh, and ignores duplicate submissions', async () => {
  const saved = deferred(), refreshed = deferred()
  const app = mount({ updateDisplayName: () => saved.promise, readSession: (count, session) => count === 2 ? refreshed.promise : session })
  await tick()
  const pending = app.render().registerCustomer('김빈틈')
  assert.equal(await app.render().registerCustomer('다른 이름'), false)
  assert.deepEqual(app.calls.updates, [['김빈틈', 7]])
  assert.equal(app.render().account.customerRegistered, false)
  saved.resolve()
  await tick()
  assert.equal(app.calls.reads, 2)
  assert.equal(app.render().account.customerRegistered, false)
  assert.equal(app.storage.has('bintime.customer-registered.user-a'), false)
  refreshed.resolve(authenticated('user-a', 8, '김빈틈'))
  assert.equal(await pending, true)
  assert.equal(app.render().user.displayName, '김빈틈')
  assert.equal(app.render().account.customerRegistered, true)
  assert.equal(app.storage.get('bintime.customer-registered.user-a'), 'true')
})

test('profile save and refresh failures cannot complete customer registration', async () => {
  for (const options of [
    { updateDisplayName: async () => { throw new Error('save failed') } },
    { readSession: async (count, session) => { if (count > 1) throw new Error('refresh failed'); return session } },
  ]) {
    const app = mount(options)
    await tick()
    assert.equal(await app.render().registerCustomer('김빈틈'), false)
    assert.equal(app.render().account.customerRegistered, false)
    assert.equal(app.storage.has('bintime.customer-registered.user-a'), false)
    assert.match(app.render().error, /failed/)
  }
})

test('a profile version conflict refreshes the version and permits an explicit retry', async () => {
  let updates = 0
  const app = mount({ updateDisplayName: async () => { if (++updates === 1) throw new BackendApiError(409, 'VERSION_CONFLICT', 'conflict') } })
  await tick()
  app.setSession(authenticated('user-a', 8))
  assert.equal(await app.render().registerCustomer('김빈틈'), false)
  assert.equal(app.render().account.customerRegistered, false)
  assert.equal(app.storage.has('bintime.customer-registered.user-a'), false)
  assert.equal(app.render().user.version, 8)
  assert.equal(await app.render().registerCustomer('김빈틈'), true)
  assert.deepEqual(app.calls.updates, [['김빈틈', 7], ['김빈틈', 8]])
  assert.equal(app.render().user.version, 9)
})

test('completion is restored on login and remains isolated between accounts', async () => {
  const app = mount({ saved: { 'bintime.customer-registered.user-a': 'true' } })
  await tick()
  assert.equal(app.render().account.customerRegistered, true)
  app.setSession(authenticated('user-b'))
  await app.render().refresh()
  assert.equal(app.render().account.customerRegistered, false)
  assert.equal(await app.render().signOut(), true)
  assert.equal(app.render().user, null)
  app.setSession(authenticated('user-a'))
  await app.render().refresh()
  assert.equal(app.render().account.customerRegistered, true)
  assert.equal(app.storage.has('bintime.customer-registered.user-b'), false)
})

test('blocked browser storage still keeps registration during the current login', async () => {
  const app = mount({ storageBlocked: true })
  await tick()
  assert.equal(await app.render().registerCustomer('김빈틈'), true)
  await app.render().refresh()
  assert.equal(app.render().account.customerRegistered, true)
  await app.render().refreshUser()
  assert.equal(app.render().account.customerRegistered, true)
  assert.equal(app.storage.size, 0)
  await app.render().signOut()
  app.setSession(authenticated())
  await app.render().refresh()
  assert.equal(app.render().account.customerRegistered, false)
})

test('a pending name save cannot complete registration for another account', async () => {
  const saved = deferred()
  const app = mount({ updateDisplayName: () => saved.promise })
  await tick()
  const pending = app.render().registerCustomer('김빈틈')
  app.setSession(authenticated('user-b'))
  await app.render().refresh()
  saved.resolve()
  assert.equal(await pending, false)
  assert.equal(app.render().user.id, 'user-b')
  assert.equal(app.render().account.customerRegistered, false)
  assert.equal(app.storage.has('bintime.customer-registered.user-a'), false)
  assert.equal(app.storage.has('bintime.customer-registered.user-b'), false)
})
