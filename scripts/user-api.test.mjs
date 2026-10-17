import assert from 'node:assert/strict'
import test from 'node:test'
import { updateDisplayName, saveUserLocation, deleteUserLocation } from '../src/lib/user-api.ts'

const success = (data) => Response.json({ resultType: 'SUCCESS', success: { data }, error: null })

test('profile updates send the current version and preserve Unicode names', async (t) => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/auth/csrf')) return success({ csrfToken: 'csrf' })
    requests.push({ url, options })
    return success({ displayName: '새 이름', version: 8 })
  })
  await updateDisplayName(' 새 이름 ', 7)
  assert.deepEqual(JSON.parse(requests[0].options.body), { displayName: '새 이름', expectedVersion: 7 })
  assert.equal(requests[0].options.method, 'PATCH')
  assert.equal(requests[0].options.headers['X-CSRF-Token'], 'csrf')
  for (const name of ['', '가'.repeat(31)]) await assert.rejects(updateDisplayName(name, 7))
  await assert.rejects(updateDisplayName('이름', 0))
  assert.equal(requests.length, 1)
})

test('device coordinates accept server six-decimal rounding and location deletion needs 204', async (t) => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/auth/csrf')) return success({ csrfToken: 'csrf' })
    requests.push({ url, options })
    return options.method === 'DELETE' ? new Response(null, { status: 204 }) : success({ latitude: 37.504727, longitude: 126.953834, savedAt: '2028-01-01T00:00:00Z' })
  })
  const position = { coords: { latitude: 37.50472672, longitude: 126.95383388, accuracy: 22.7 }, timestamp: Date.parse('2028-01-01T00:00:00Z') }
  assert.deepEqual(await saveUserLocation(position), { latitude: 37.504727, longitude: 126.953834, savedAt: '2028-01-01T00:00:00Z' })
  assert.deepEqual(JSON.parse(requests[0].options.body), { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: 23, source: 'DEVICE', observedAt: '2028-01-01T00:00:00.000Z' })
  await deleteUserLocation()
  assert.equal(requests[1].options.method, 'DELETE')
  await assert.rejects(saveUserLocation({ ...position, coords: { ...position.coords, latitude: 91 } }))
  assert.equal(requests.length, 2)
})

test('profile conflict and malformed location replies remain errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => url.endsWith('/auth/csrf') ? success({ csrfToken: 'csrf' }) : Response.json({ resultType: 'FAILURE', success: null, error: { code: 'VERSION_CONFLICT' } }, { status: 409 }))
  await assert.rejects(updateDisplayName('이름', 7), { code: 'VERSION_CONFLICT' })
  t.mock.method(globalThis, 'fetch', async (url) => url.endsWith('/auth/csrf') ? success({ csrfToken: 'csrf' }) : success({ latitude: null, longitude: 127, savedAt: '2028-01-01T00:00:00Z' }))
  await assert.rejects(saveUserLocation({ coords: { latitude: 37, longitude: 127, accuracy: 10 }, timestamp: 100000 }), { code: 'INVALID_RESPONSE' })
  await assert.rejects(deleteUserLocation(), { code: 'INVALID_RESPONSE' })
})

test('canceling location tracking aborts an in-flight location save', async (t) => {
  const controller = new AbortController()
  let saving
  const started = new Promise((resolve) => { saving = resolve })
  t.mock.method(globalThis, 'fetch', async (url, { method, signal }) => {
    if (url.endsWith('/auth/csrf')) return success({ csrfToken: 'csrf' })
    assert.equal(url, '/api/v1/users/me/location')
    assert.equal(method, 'PUT')
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      saving()
    })
  })
  const pending = saveUserLocation({ coords: { latitude: 37, longitude: 127, accuracy: 10 }, timestamp: 100000 }, controller.signal)
  await started
  controller.abort()
  await assert.rejects(pending, { name: 'AbortError' })
})
