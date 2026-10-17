import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { accountStartPath } from '../src/lib/account.ts'
import { notificationPath } from '../src/lib/notifications.ts'
import { notificationTarget } from '../src/lib/notification-navigation.ts'

const compiled = ts.transpileModule(readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText

function mount({ registered = false, save = async () => true } = {}) {
  let location = { pathname: '/customer/register', search: '', hash: '', state: null }
  const calls = { saves: [], navigations: [], refreshes: 0, announces: 0 }
  const account = { role: 'customer', customerRegistered: registered, shop: null, preferences: '' }
  const exports = {}
  const jsx = (type, props) => ({ type, props })
  runInContext(compiled, createContext({
    exports,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react') return {
        useState: (initial) => [initial, () => {}], useEffect: () => {},
        useMemo: (compute) => compute(), useCallback: (callback) => callback,
      }
      if (name === 'react-router-dom') return {
        Navigate: 'Navigate', Outlet: 'Outlet', Route: 'Route', Routes: 'Routes',
        useLocation: () => location, useNavigate: () => (...args) => calls.navigations.push(args),
      }
      if (name === './hooks/useAccount') return { useAccount: () => ({
        account, user: { id: 'user-a', ownedStoreIds: [], location: null }, loading: false, error: '',
        registerCustomer: async (value) => { calls.saves.push(value); return save(value) },
      }) }
      if (name === './hooks/useRecentLocation') return { useRecentLocation: () => {} }
      if (name === './hooks/useVacancyAlerts') return { useVacancyAlerts: () => 0 }
      if (name === './hooks/useChat') return { useChat: () => ({ conversations: [] }) }
      if (name === './hooks/useNotifications') return { useNotifications: () => ({ items: [], unreadCount: 0, refresh: async () => { calls.refreshes++ }, announce: () => { calls.announces++ } }) }
      if (name === './hooks/usePushNotifications') return { usePushNotifications: (onPush) => { calls.onPush = onPush; return {} } }
      if (name === './lib/account') return { accountStartPath }
      if (name === './lib/notifications') return { notificationPath }
      if (name === './lib/notification-navigation') return { notificationTarget }
      if (name.startsWith('./components/') || name.startsWith('./pages/')) return new Proxy({}, { get: (_, key) => key })
      if (name.endsWith('.css')) return {}
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
  const routes = () => exports.default().props.children.find((child) => child?.type === 'Routes').props.children
  return {
    calls, account,
    at(path, state = null) { const url = new URL(path, 'https://app.example'); location = { pathname: url.pathname, search: url.search, hash: url.hash, state } },
    gate(role) { const element = routes().find((route) => route.props.element?.props.role === role).props.element; return element.type(element.props) },
    registration: () => routes().find((route) => route.props.path === '/customer/register').props.element,
  }
}

test('customer entry preserves the requested chat or reservation through name registration', async () => {
  for (const destination of ['/customer/chat/store-1?messageId=message-1#latest', '/customer/reservations/booking-1']) {
    const app = mount()
    app.at(destination)
    const redirect = app.gate('customer')
    assert.equal(redirect.type, 'Navigate')
    assert.equal(redirect.props.to, '/customer/register')
    assert.equal(redirect.props.replace, true)
    assert.equal(redirect.props.state.returnTo, destination)
    app.at(redirect.props.to, redirect.props.state)
    assert.equal(await app.registration().props.onRegister('김빈틈'), true)
    assert.deepEqual(app.calls.saves, ['김빈틈'])
    assert.equal(app.calls.navigations.length, 1)
    assert.equal(app.calls.navigations[0][0], destination)
    assert.equal(app.calls.navigations[0][1].replace, true)
  }
})

test('failed registration stays on the form and direct registration enters customer home', async () => {
  const failed = mount({ save: async () => false })
  failed.at('/customer/register', { returnTo: '/customer/chat/store-1' })
  assert.equal(await failed.registration().props.onRegister('김빈틈'), false)
  assert.equal(failed.calls.navigations.length, 0)
  const direct = mount()
  assert.equal(await direct.registration().props.onRegister('김빈틈'), true)
  assert.equal(direct.calls.navigations[0][0], '/customer')
})

test('registered customers enter their routes and owner registration keeps its existing gate', () => {
  const app = mount({ registered: true })
  app.at('/customer/chat/store-1')
  assert.equal(app.gate('customer').type, 'Outlet')
  assert.equal(app.registration().type, 'Navigate')
  app.account.role = 'owner'
  app.at('/owner/chats')
  const owner = app.gate('owner')
  assert.equal(owner.props.to, '/owner/register')
  assert.equal(owner.props.state, null)
  app.account.shop = { serviceId: 'service-1' }
  assert.equal(app.gate('owner').type, 'Outlet')
})

test('a foreign return URL cannot navigate outside the app after registration', async () => {
  const app = mount()
  app.at('/customer/register', { returnTo: '//another.example/path' })
  assert.equal(await app.registration().props.onRegister('김빈틈'), true)
  assert.equal(app.calls.navigations[0][0], '/customer/waitlist')
})

test('foreground FCM refreshes the inbox without duplicating the vacancy poll toast', () => {
  const app = mount()
  app.registration()
  app.calls.onPush('빈자리 알림', 'notification-1')
  assert.equal(app.calls.refreshes, 1)
  assert.equal(app.calls.announces, 0)
})
