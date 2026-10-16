import assert from 'node:assert/strict'
import test from 'node:test'
import { BACKEND_API_ORIGIN, BackendApiError, publicApiPath, readPublicApi } from '../src/lib/backend-api.ts'

const success = (data = { items: [] }) => ({ resultType: 'SUCCESS', success: { data }, error: null })
const failure = (code = 'NOT_IMPLEMENTED') => ({ resultType: 'FAILURE', success: null, error: { code, message: '미구현' } })

test('public API paths encode identifiers and filters without changing the destination', () => {
  assert.equal(publicApiPath({ operation: 'categories' }), '/api/v1/stores/categories')
  const search = new URL(publicApiPath({ operation: 'search', keyword: ' 네일 & ?한글 ' }), BACKEND_API_ORIGIN)
  assert.equal(search.pathname, '/api/v1/search/stores')
  assert.deepEqual(Object.fromEntries(search.searchParams), { latitude: '37.51243', longitude: '126.92727', radiusMeters: '5000', limit: '10', keyword: '네일 & ?한글' })
  assert.equal(new URL(publicApiPath({ operation: 'search', keyword: '  ' }), BACKEND_API_ORIGIN).searchParams.has('keyword'), false)
  const storeId = 'shop/한 글?x=#'
  const path = `/api/v1/stores/${encodeURIComponent(storeId)}`
  assert.equal(publicApiPath({ operation: 'store', storeId }), path)
  assert.equal(publicApiPath({ operation: 'services', storeId }), `${path}/services?limit=10`)
  assert.equal(publicApiPath({ operation: 'slots', storeId, date: '2028-02-29' }), `${path}/slots?from=2028-02-29&to=2028-02-29&limit=10`)
})

test('invalid identifiers, dates and unsupported operations never send a request', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => { throw new Error('must not fetch') })
  const invalid = [
    ...[undefined, '', '  ', '.', '..', 's'.repeat(65), 'shop\n1', 'shop\u007f', '\ud800'].map((storeId) => ({ operation: 'store', storeId })),
    ...[undefined, '', '2026-02-29', '2026-04-31', '2026-13-01', '2026-10-0', '2026-10-16&limit=100'].map((date) => ({ operation: 'slots', storeId: 'shop', date })),
    { operation: 'delete', storeId: 'shop' },
  ]
  for (const request of invalid) await assert.rejects(readPublicApi(request), { name: 'BackendApiError', status: 0, code: 'INVALID_REQUEST' })
  assert.equal(fetch.mock.callCount(), 0)
})

test('the five public operations only GET with session credentials and unwrap successful data', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).origin, BACKEND_API_ORIGIN)
    assert.equal(options.method, 'GET')
    assert.equal(options.credentials, 'include')
    assert.equal(options.cache, 'no-store')
    assert.deepEqual(options.headers, { Accept: 'application/json' })
    assert.equal(options.body, undefined)
    assert.ok(options.signal instanceof AbortSignal)
    return Response.json(success({ id: 'from-server' }))
  })
  for (const operation of ['categories', 'search', 'store', 'services', 'slots']) {
    await assert.doesNotReject(async () => assert.deepEqual(await readPublicApi({ operation, storeId: 'shop', date: '2026-10-16' }), { id: 'from-server' }))
  }
  assert.equal(fetch.mock.callCount(), 5)
})

test('501 remains an explicit unimplemented error, including non-JSON error bodies', async (t) => {
  for (const response of [Response.json(failure(), { status: 501 }), new Response('<html>not implemented</html>', { status: 501 })]) {
    t.mock.method(globalThis, 'fetch', async () => response)
    await assert.rejects(readPublicApi({ operation: 'categories' }), (error) => {
      assert.ok(error instanceof BackendApiError)
      assert.equal(error.status, 501)
      assert.match(error.message, /명세만 정의/)
      return true
    })
  }
})

test('HTTP errors and a failure envelope with HTTP 200 cannot become success', async (t) => {
  for (const status of [200, 401, 403, 404, 409, 429, 500]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(failure('SERVER_REJECTED'), { status }))
    await assert.rejects(readPublicApi({ operation: 'categories' }), { name: 'BackendApiError', status, code: 'SERVER_REJECTED' })
  }
})

test('malformed JSON and success envelopes cannot be displayed as valid data', async (t) => {
  for (const body of ['<html>error</html>', 'null', JSON.stringify({}), JSON.stringify({ resultType: 'SUCCESS', success: {}, error: null }), JSON.stringify(success(null)), JSON.stringify({ ...success(), error: { code: 'ERROR' } }), JSON.stringify({ ...success(), resultType: 'UNKNOWN' })]) {
    t.mock.method(globalThis, 'fetch', async () => new Response(body, { status: 200 }))
    await assert.rejects(readPublicApi({ operation: 'categories' }), { name: 'BackendApiError', status: 200, code: 'INVALID_RESPONSE' })
  }
})

test('network errors explain connectivity without pretending to have HTTP status', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch') })
  await assert.rejects(readPublicApi({ operation: 'categories' }), { name: 'BackendApiError', status: 0, code: 'NETWORK_ERROR' })
})

test('caller cancellation works before and during fetch', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })))
  const stopped = new AbortController()
  stopped.abort()
  await assert.rejects(readPublicApi({ operation: 'categories' }, stopped.signal), { name: 'AbortError' })
  assert.equal(fetch.mock.callCount(), 0)
  const controller = new AbortController()
  const pending = readPublicApi({ operation: 'categories' }, controller.signal)
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
})

test('a request that exceeds 15 seconds aborts and reports timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })))
  const pending = assert.rejects(readPublicApi({ operation: 'categories' }), { name: 'BackendApiError', status: 0, code: 'TIMEOUT' })
  t.mock.timers.tick(15000)
  await pending
})
