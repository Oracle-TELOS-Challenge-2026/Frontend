import assert from 'node:assert/strict'
import test from 'node:test'
import { deletePushSubscription, registerPushSubscription } from '../src/lib/push.ts'

const success = (data, status = 200) => Response.json({ resultType: 'SUCCESS', success: { data }, error: null }, { status })

test('FID registration and removal use the authenticated server subscription ID', async (t) => {
  const responses = [success({ csrfToken: 'csrf' }), success({ id: 'push/1' }, 201), success({ csrfToken: 'csrf' }), new Response(null, { status: 204 })]
  const fetch = t.mock.method(globalThis, 'fetch', async () => responses.shift())
  const id = await registerPushSubscription('browser-fid')
  assert.equal(id, 'push/1')
  await deletePushSubscription(id)
  const create = fetch.mock.calls[1].arguments
  assert.equal(new URL(create[0]).pathname, '/api/v1/notifications/push-subscriptions')
  assert.equal(create[1].method, 'POST')
  assert.equal(create[1].headers['X-CSRF-Token'], 'csrf')
  assert.deepEqual(JSON.parse(create[1].body), { installationId: 'browser-fid' })
  const remove = fetch.mock.calls[3].arguments
  assert.equal(new URL(remove[0]).pathname, '/api/v1/notifications/push-subscriptions/push%2F1')
  assert.equal(remove[1].method, 'DELETE')
  assert.equal(remove[1].headers['X-CSRF-Token'], 'csrf')
})

test('invalid IDs and missing server confirmations never appear successful', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => success({ csrfToken: 'csrf' }))
  for (const fid of ['', '  ', 'bad\nfid', 'a'.repeat(129)]) await assert.rejects(registerPushSubscription(fid))
  await assert.rejects(deletePushSubscription(''))
  assert.equal(fetch.mock.callCount(), 0)
  await assert.rejects(registerPushSubscription('valid-fid'), /등록 결과/)
  await assert.rejects(deletePushSubscription('valid-id'), /해제 결과/)
})

test('lost subscription responses recover the existing ID by FID before deleting it', async (t) => {
  const responses = [success({ csrfToken: 'csrf' }), success({ id: 'recovered-push' }), success({ csrfToken: 'csrf' }), new Response(null, { status: 204 })]
  const fetch = t.mock.method(globalThis, 'fetch', async () => responses.shift())
  await deletePushSubscription('', 'saved-fid')
  assert.deepEqual(JSON.parse(fetch.mock.calls[1].arguments[1].body), { installationId: 'saved-fid' })
  assert.equal(new URL(fetch.mock.calls[3].arguments[0]).pathname, '/api/v1/notifications/push-subscriptions/recovered-push')
  assert.equal(fetch.mock.calls[3].arguments[1].method, 'DELETE')
})

test('failed FID recovery does not report a successful unsubscribe', async (t) => {
  const responses = [success({ csrfToken: 'csrf' }), Response.json({ resultType: 'FAILURE', success: null, error: { code: 'SERVER_ERROR' } }, { status: 500 })]
  const fetch = t.mock.method(globalThis, 'fetch', async () => responses.shift())
  await assert.rejects(deletePushSubscription('', 'saved-fid'), { status: 500 })
  assert.equal(fetch.mock.callCount(), 2)
})
