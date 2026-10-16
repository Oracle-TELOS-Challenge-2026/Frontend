import assert from 'node:assert/strict'
import test from 'node:test'
import { analyzeIntent, validateWaitlistConditions } from '../src/lib/intent.ts'
import { saveWaitlist } from '../src/lib/customer-api.ts'

const conditions = { storeId: null, serviceId: null, category: 'NAIL', windowStart: '2028-01-01T10:00:00+09:00', windowEnd: '2028-01-01T12:00:00+09:00', location: { latitude: 37.5, longitude: 127 }, radiusMeters: 3000, maxPrice: 50000, keywords: ['젤'] }
const success = (data) => Response.json({ resultType: 'SUCCESS', success: { data }, error: null })

test('analysis uses explicit location context and never creates a waitlist', async (t) => {
  const writes = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/auth/csrf')) return success({ csrfToken: 'csrf' })
    writes.push({ url, options })
    return success({ conditions: { ...conditions, windowStart: null }, resolution: 'NEEDS_CLARIFICATION', missingFields: ['timeWindow'], clarificationQuestion: '시작 시간을 알려주세요.' })
  })
  const result = await analyzeIntent(' 내일 네일 ', conditions.location)
  assert.equal(result.conditions.windowStart, null)
  assert.equal(result.resolution, 'NEEDS_CLARIFICATION')
  assert.equal(writes.length, 1)
  assert.ok(writes[0].url.endsWith('/search/intents/analyze'))
  assert.deepEqual(JSON.parse(writes[0].options.body), { text: '내일 네일', context: { location: conditions.location } })
  await assert.rejects(analyzeIntent('', null))
})

test('AI failure and invalid extracted fields stay errors for manual fallback', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => url.endsWith('/auth/csrf') ? success({ csrfToken: 'csrf' }) : new Response(null, { status: 503 }))
  await assert.rejects(analyzeIntent('네일', null), { status: 503 })
  t.mock.method(globalThis, 'fetch', async (url) => url.endsWith('/auth/csrf') ? success({ csrfToken: 'csrf' }) : success({ conditions: { ...conditions, location: { latitude: 100, longitude: 127 } }, resolution: 'RESOLVED', missingFields: [], clarificationQuestion: null }))
  await assert.rejects(analyzeIntent('네일', null), { code: 'INVALID_RESPONSE' })
})

test('confirmed conditions enforce time, location, budget and keyword boundaries', () => {
  const now = Date.parse('2027-01-01T00:00:00Z')
  assert.equal(validateWaitlistConditions(conditions, now), null)
  assert.equal(validateWaitlistConditions({ ...conditions, storeId: 'store', location: null, radiusMeters: null, maxPrice: 0 }, now), null)
  for (const update of [{ category: '' }, { windowEnd: conditions.windowStart }, { windowStart: 'invalid' }, { location: null }, { radiusMeters: 99 }, { maxPrice: 10000001 }, { maxPrice: 0.5 }, { keywords: Array(31).fill('젤') }]) assert.equal(typeof validateWaitlistConditions({ ...conditions, ...update }, now), 'string')
})

test('confirmed analysis registration sends consent, source and stable idempotency key', async (t) => {
  const writes = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.endsWith('/auth/csrf')) return success({ csrfToken: 'csrf' })
    writes.push(options)
    if (writes.length === 1) throw new TypeError('lost response')
    return success({ id: 'wait-1' })
  })
  await assert.rejects(saveWaitlist(conditions, 'same-key', undefined, 'NATURAL_LANGUAGE'))
  await saveWaitlist(conditions, 'same-key', undefined, 'NATURAL_LANGUAGE')
  assert.equal(writes[0].body, writes[1].body)
  assert.deepEqual(JSON.parse(writes[1].body), { conditions, notificationConsent: true, source: 'NATURAL_LANGUAGE' })
  assert.equal(writes[1].headers['Idempotency-Key'], 'same-key')
})
