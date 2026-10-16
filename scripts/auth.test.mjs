import assert from 'node:assert/strict'
import test from 'node:test'
import { KAKAO_LOGIN_URL, logout, readSession } from '../src/lib/auth.ts'
import { BACKEND_API_ORIGIN } from '../src/lib/backend-api.ts'

const user = { id: 'usr_001', displayName: '빈틈고객', roles: ['CUSTOMER'] }
const success = (data) => Response.json({ resultType: 'SUCCESS', success: { data }, error: null })
const failure = (status, code = `HTTP_${status}`) => Response.json({ resultType: 'FAILURE', success: null, error: { code } }, { status })

function mockRequests(t, responses) {
  const pending = [...responses]
  return t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).origin, BACKEND_API_ORIGIN)
    assert.equal(options.credentials, 'include')
    assert.equal(options.cache, 'no-store')
    assert.ok(options.signal instanceof AbortSignal)
    assert.ok(pending.length, `unexpected request: ${url}`)
    return pending.shift()
  })
}

test('Kakao starts with a browser destination and restores only server user values', async (t) => {
  assert.equal(KAKAO_LOGIN_URL, `${BACKEND_API_ORIGIN}/api/v1/auth/oauth/kakao/start`)
  const fetch = mockRequests(t, [success(user), success({ ...user, roles: ['OWNER', 'CUSTOMER'] }), success({ ...user, id: 'u'.repeat(65) })])
  assert.deepEqual(await readSession(), { status: 'authenticated', user })
  assert.deepEqual(await readSession(), { status: 'authenticated', user: { ...user, roles: ['OWNER', 'CUSTOMER'] } })
  assert.deepEqual(await readSession(), { status: 'authenticated', user: { ...user, id: 'u'.repeat(65) } })
  for (const { arguments: [url, options] } of fetch.mock.calls) {
    assert.equal(new URL(url).pathname, '/api/v1/users/me')
    assert.equal(options.method, 'GET')
    assert.equal(options.headers.Authorization, undefined)
  }
})

test('401 alone means anonymous, while a missing profile API can confirm only the session', async (t) => {
  const fetch = mockRequests(t, [failure(401), failure(501), success({ csrfToken: 'csrf-token' }), failure(501), failure(401)])
  assert.deepEqual(await readSession(), { status: 'anonymous' })
  assert.deepEqual(await readSession(), { status: 'profile-unavailable' })
  assert.deepEqual(await readSession(), { status: 'anonymous' })
  assert.deepEqual(fetch.mock.calls.map(({ arguments: [url] }) => new URL(url).pathname), [
    '/api/v1/users/me', '/api/v1/users/me', '/api/v1/auth/csrf', '/api/v1/users/me', '/api/v1/auth/csrf',
  ])
})

test('profile errors never turn into anonymous or a guessed user', async (t) => {
  for (const status of [403, 404, 500, 503]) {
    const fetch = mockRequests(t, [failure(status)])
    await assert.rejects(readSession(), { name: 'BackendApiError', status })
    assert.equal(fetch.mock.callCount(), 1)
  }
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch') })
  await assert.rejects(readSession(), { name: 'BackendApiError', status: 0, code: 'NETWORK_ERROR' })
})

test('malformed user information cannot authorize the account', async (t) => {
  const invalid = [null, {}, { ...user, id: 1 }, { ...user, id: '' },
    { ...user, displayName: null }, { ...user, displayName: ' ' }, { ...user, roles: undefined },
    { ...user, roles: 'CUSTOMER' }, { ...user, roles: [1] }, { ...user, roles: [''] }]
  for (const data of invalid) {
    mockRequests(t, [success(data)])
    await assert.rejects(readSession(), { name: 'BackendApiError', status: 200, code: 'INVALID_RESPONSE' })
  }
  for (const response of [new Response('not JSON'), new Response(null, { status: 204 }), failure(200, 'SERVER_REJECTED')]) {
    mockRequests(t, [response])
    await assert.rejects(readSession(), { name: 'BackendApiError' })
  }
})

test('CSRF fallback failures remain integration errors', async (t) => {
  for (const response of [failure(500), failure(501), success({}), success({ csrfToken: 12 }), success({ csrfToken: ' ' }), success({ csrfToken: 'csrf\r\ntoken' })]) {
    mockRequests(t, [failure(501), response])
    await assert.rejects(readSession(), { name: 'BackendApiError' })
  }
})

test('session lookup honors cancellation without making another request', async (t) => {
  const controller = new AbortController()
  controller.abort()
  const fetch = mockRequests(t, [])
  await assert.rejects(readSession(controller.signal), { name: 'AbortError' })
  assert.equal(fetch.mock.callCount(), 0)
})

test('logout gets a fresh CSRF token for each attempt and never parses 204', async (t) => {
  const first = new Response(null, { status: 204 })
  const second = new Response(null, { status: 204 })
  const firstJson = t.mock.method(first, 'json', () => { throw new Error('must not parse 204') })
  const secondJson = t.mock.method(second, 'json', () => { throw new Error('must not parse 204') })
  const fetch = mockRequests(t, [success({ csrfToken: 'first-token' }), first, success({ csrfToken: 'second-token' }), second])
  await logout()
  await logout()
  assert.equal(firstJson.mock.callCount(), 0)
  assert.equal(secondJson.mock.callCount(), 0)
  assert.deepEqual(fetch.mock.calls.map(({ arguments: [url, options] }) => [new URL(url).pathname, options.method, options.headers['X-CSRF-Token']]), [
    ['/api/v1/auth/csrf', 'GET', undefined], ['/api/v1/auth/logout', 'POST', 'first-token'],
    ['/api/v1/auth/csrf', 'GET', undefined], ['/api/v1/auth/logout', 'POST', 'second-token'],
  ])
})

test('logout treats an absent session at either step as already signed out', async (t) => {
  let fetch = mockRequests(t, [failure(401)])
  await logout()
  assert.equal(fetch.mock.callCount(), 1)
  fetch = mockRequests(t, [success({ csrfToken: 'token' }), failure(401)])
  await logout()
  assert.equal(fetch.mock.callCount(), 2)
})

test('logout failures preserve the session and only 204 is successful', async (t) => {
  for (const response of [failure(500), failure(501), success({}), success({ csrfToken: '' })]) {
    const fetch = mockRequests(t, [response])
    await assert.rejects(logout(), { name: 'BackendApiError' })
    assert.equal(fetch.mock.callCount(), 1)
  }
  for (const response of [failure(500), failure(403, 'FORBIDDEN'), success({})]) {
    const fetch = mockRequests(t, [success({ csrfToken: 'token' }), response])
    await assert.rejects(logout(), { name: 'BackendApiError' })
    assert.equal(fetch.mock.callCount(), 2)
  }
})

test('invalid CSRF refreshes the token but never automatically repeats logout', async (t) => {
  const fetch = mockRequests(t, [success({ csrfToken: 'expired-token' }), failure(403, 'CSRF_INVALID'), success({ csrfToken: 'fresh-token' })])
  await assert.rejects(logout(), (error) => {
    assert.equal(error.status, 403)
    assert.equal(error.code, 'CSRF_INVALID')
    assert.match(error.message, /다시 시도/)
    return true
  })
  assert.equal(fetch.mock.callCount(), 3)
  assert.deepEqual(fetch.mock.calls.map(({ arguments: [url] }) => new URL(url).pathname), ['/api/v1/auth/csrf', '/api/v1/auth/logout', '/api/v1/auth/csrf'])
})

test('an expired session during CSRF refresh completes logout, other refresh failures do not', async (t) => {
  mockRequests(t, [success({ csrfToken: 'token' }), failure(403, 'CSRF_INVALID'), failure(401)])
  await logout()
  mockRequests(t, [success({ csrfToken: 'token' }), failure(403, 'CSRF_INVALID'), failure(500)])
  await assert.rejects(logout(), { name: 'BackendApiError', status: 500 })
})
