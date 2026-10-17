import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import ts from 'typescript'
import { apiId } from '../src/lib/backend-api.ts'
import { notificationActionLabel } from '../src/lib/notifications.ts'

const compiled = ts.transpileModule(readFileSync(new URL('../src/pages/NotificationsPage.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText
const tick = () => new Promise((resolve) => setImmediate(resolve))
const item = { id: 'notice-1', type: 'VACANCY_MATCHED', title: '빈자리 알림', body: '예약할 수 있어요.', path: '/customer/waitlist', storeId: 'store-1', instantBooking: true, availability: 'AVAILABLE', readAt: null, createdAt: '2026-10-17T12:00:00+09:00' }
function nodes(tree) { return Array.isArray(tree) ? tree.flatMap(nodes) : tree?.props ? [tree, ...nodes(tree.props.children)] : [] }
function text(tree) { return Array.isArray(tree) ? tree.map(text).join('') : tree?.props ? text(tree.props.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree) }

function mount(markRead, notification = item) {
  const state = [], paths = [], exports = {}
  let cursor = 0
  const jsx = (type, props) => ({ type, props })
  runInContext(compiled, createContext({
    exports,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'Fragment' }
      if (name === 'react') return { useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], (value) => { state[index] = value }] } }
      if (name === '../components/Icon') return { Icon: 'Icon' }
      if (name === '../components/LoadingIndicator') return { LoadingIndicator: 'LoadingIndicator' }
      if (name === '../lib/format') return { dateLabel: String, timeLabel: String }
      if (name === '../lib/notifications') return { notificationActionLabel }
      if (name === '../lib/backend-api') return { apiId }
      throw new Error(`Unexpected import: ${name}`)
    },
  }))
  const render = () => { cursor = 0; return exports.NotificationsPage({ notifications: { items: [notification], unreadCount: 1, markRead }, onOpen: (path) => paths.push(path) }) }
  return { render, paths, click(label) { const button = nodes(render()).find((node) => node.type === 'button' && text(node) === label); assert.ok(button); button.props.onClick() } }
}

test('vacancy actions wait for read confirmation and open the returned store chat for either booking policy', async () => {
  for (const instantBooking of [true, false]) {
    let resolveRead
    const app = mount((id) => { assert.equal(id, item.id); return new Promise((resolve) => { resolveRead = resolve }) }, { ...item, instantBooking })
    app.click('가게와 채팅하기')
    assert.deepEqual(app.paths, [])
    resolveRead({ ...item, instantBooking, storeId: 'store/한 글', readAt: item.createdAt })
    await tick()
    assert.deepEqual(app.paths, ['/customer/chat/store%2F%ED%95%9C%20%EA%B8%80'])
  }
})

test('missing store information and a closed vacancy never redirect to the waitlist', async () => {
  const missing = mount(async () => ({ ...item, storeId: null }))
  missing.click('가게와 채팅하기'); await tick()
  assert.deepEqual(missing.paths, [])
  assert.match(text(missing.render()), /가게 정보를 확인하지 못했어요/)
  const closed = mount(async () => ({ ...item, availability: 'UNAVAILABLE' }))
  closed.click('가게와 채팅하기'); await tick()
  assert.deepEqual(closed.paths, [])
})

test('read failures prevent navigation, read-only actions stay put, and other notifications keep their path', async () => {
  const failed = mount(async () => { throw new Error('읽음 저장 실패') })
  failed.click('가게와 채팅하기'); await tick()
  assert.deepEqual(failed.paths, [])
  assert.ok(nodes(failed.render()).some((node) => node.props.role === 'alert'))
  const readOnly = mount(async () => ({ ...item, readAt: item.createdAt }))
  readOnly.click('읽음으로 표시'); await tick()
  assert.deepEqual(readOnly.paths, [])
  for (const notification of [
    { ...item, type: 'CHAT_MESSAGE', path: '/chat?roomId=room-1' },
    { ...item, type: 'RESERVATION_CONFIRMED', path: '/customer/reservations/res-1' },
  ]) {
    const app = mount(async () => notification, notification)
    app.click(notificationActionLabel(notification)); await tick()
    assert.deepEqual(app.paths, [notification.path])
  }
})
