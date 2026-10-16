import assert from 'node:assert/strict'
import test from 'node:test'
import { apiId, requestBackendApi, mutateBackendApi } from '../src/lib/backend-api.ts'

const success = (data = { items: [] }) => ({ resultType: 'SUCCESS', success: { data }, error: null })
const failure = (code = 'REJECTED') => ({ resultType: 'FAILURE', success: null, error: { code, message: '요청 실패' } })

test('opaque IDs are encoded and unsafe path segments are rejected', () => {
  assert.equal(apiId('store/한 글?x=#'), 'store%2F%ED%95%9C%20%EA%B8%80%3Fx%3D%23')
  for (const id of ['', ' ', '.', '..', 's'.repeat(65), 'shop\n1', '\ud800']) assert.throws(() => apiId(id), { code: 'INVALID_REQUEST' })
})

test('GET uses the frontend API path with session credentials and no request body', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/v1/stores/categories')
    assert.equal(new URL(url, 'https://frontend-oracle.vercel.app').origin, 'https://frontend-oracle.vercel.app')
    assert.equal(options.method, 'GET')
    assert.equal(options.credentials, 'include')
    assert.equal(options.cache, 'no-store')
    assert.deepEqual(options.headers, { Accept: 'application/json' })
    assert.equal(options.body, undefined)
    assert.ok(options.signal instanceof AbortSignal)
    return Response.json(success({ items: [] }))
  })
  assert.deepEqual(await requestBackendApi('/api/v1/stores/categories'), { status: 200, data: { items: [] } })
})

test('mutations carry JSON, a fresh CSRF token and the caller retry key', async (t) => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url, options })
    return Response.json(success(requests.length % 2 ? { csrfToken: 'csrf' } : { id: 'saved' }))
  })
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    await mutateBackendApi('/api/v1/resource', { method, body: { text: '한글' }, idempotencyKey: 'same-retry-key' })
    const { url, options } = requests.at(-1)
    assert.equal(url, '/api/v1/resource')
    assert.equal(options.method, method)
    assert.equal(options.headers['X-CSRF-Token'], 'csrf')
    assert.equal(options.headers['Idempotency-Key'], 'same-retry-key')
    assert.equal(options.headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(options.body), { text: '한글' })
    assert.equal(requests.at(-2).url, '/api/v1/auth/csrf')
  }
})

test('missing or malformed CSRF prevents writes, and an HTTP failure is never retried silently', async (t) => {
  for (const csrfToken of [undefined, '', ' ', 'bad\nvalue']) {
    const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json(success({ csrfToken })))
    await assert.rejects(mutateBackendApi('/api/v1/resource'), { code: 'INVALID_RESPONSE' })
    assert.equal(fetch.mock.callCount(), 1)
  }
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json(failure('CSRF_INVALID'), { status: 403 }))
  await assert.rejects(mutateBackendApi('/api/v1/resource'), { status: 403, code: 'CSRF_INVALID' })
  assert.equal(fetch.mock.callCount(), 1)
})

test('204 does not attempt to parse JSON', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 204 }))
  assert.deepEqual(await requestBackendApi('/api/v1/resource', { method: 'DELETE' }), { status: 204, data: null })
})

test('HTTP failures and a failure envelope at HTTP 200 remain failures', async (t) => {
  for (const status of [200, 400, 401, 403, 404, 409, 429, 500, 501, 503]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(failure('SERVER_REJECTED'), { status }))
    await assert.rejects(requestBackendApi('/api/v1/resource'), { name: 'BackendApiError', status, code: 'SERVER_REJECTED' })
  }
})

test('malformed JSON and success envelopes cannot become valid data', async (t) => {
  for (const body of ['<html>error</html>', 'null', '{}', JSON.stringify({ resultType: 'SUCCESS', success: {}, error: null }), JSON.stringify(success(null)), JSON.stringify({ ...success(), error: { code: 'ERROR' } }), JSON.stringify({ ...success(), resultType: 'UNKNOWN' })]) {
    t.mock.method(globalThis, 'fetch', async () => new Response(body, { status: 200 }))
    await assert.rejects(requestBackendApi('/api/v1/resource'), { code: 'INVALID_RESPONSE' })
  }
})

test('network failures, cancellation and timeout remain distinct', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch') })
  await assert.rejects(requestBackendApi('/api/v1/resource'), { code: 'NETWORK_ERROR' })
  const fetch = t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })))
  const stopped = new AbortController()
  stopped.abort()
  await assert.rejects(requestBackendApi('/api/v1/resource', { signal: stopped.signal }), { name: 'AbortError' })
  assert.equal(fetch.mock.callCount(), 0)
  const controller = new AbortController()
  const pending = requestBackendApi('/api/v1/resource', { signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const timeout = assert.rejects(requestBackendApi('/api/v1/resource'), { code: 'TIMEOUT' })
  t.mock.timers.tick(15000)
  await timeout
})
