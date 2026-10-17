import assert from 'node:assert/strict'
import test from 'node:test'
import { loadKakaoMaps, searchRoadAddresses } from '../src/lib/kakao-map.ts'

test('SDK loader rejects missing keys, shares requests, recovers after failure, and waits for initialization', async (t) => {
  const scripts = []
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  globalThis.window = {}
  globalThis.document = {
    createElement: () => ({ remove() { this.removed = true } }),
    head: { appendChild: (script) => scripts.push(script) },
  }
  t.after(() => {
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  })

  await assert.rejects(loadKakaoMaps('  '), /key is missing/)
  assert.equal(scripts.length, 0)

  const first = loadKakaoMaps('test-public-key')
  const duplicate = loadKakaoMaps('test-public-key')
  assert.equal(first, duplicate)
  assert.equal(scripts.length, 1)
  const rejected = assert.rejects(first, /request failed/)
  scripts[0].onerror()
  await rejected
  assert.equal(scripts[0].removed, true)

  const retry = loadKakaoMaps('test-public-key')
  assert.equal(scripts.length, 2)
  assert.equal(new URL(scripts[1].src).searchParams.get('autoload'), 'false')
  assert.equal(new URL(scripts[1].src).searchParams.get('libraries'), 'services')
  let initialize
  const maps = { load: (callback) => { initialize = callback } }
  window.kakao = { maps }
  scripts[1].onload()
  let resolved = false
  retry.then(() => { resolved = true })
  await Promise.resolve()
  assert.equal(resolved, false)
  maps.Map = class {}
  maps.services = { Geocoder: class {} }
  initialize()
  assert.equal(await retry, maps)
  assert.equal(await loadKakaoMaps('test-public-key'), maps)
  assert.equal(scripts.length, 2)
})

test('road address search uses the selected canonical road address and maps x/y to longitude/latitude', async (t) => {
  const originalWindow = globalThis.window
  t.after(() => { if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow })
  const road = { x: '126.978388', y: '37.56661', road_address: { address_name: '서울 중구 세종대로 110' } }
  let results = [road, { ...road, road_address: null }], status = 'OK'
  globalThis.window = { kakao: { maps: { Map: class {}, services: { Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT', ERROR: 'ERROR' }, Geocoder: class {
    addressSearch(query, callback, options) {
      assert.equal(query, '세종대로 110')
      assert.equal(options.size, 10)
      callback(results, status)
    }
  } } } } }
  assert.deepEqual(await searchRoadAddresses('  세종대로 110  ', 'public-key'), [{ address: road.road_address.address_name, latitude: 37.56661, longitude: 126.978388 }])
  status = 'ZERO_RESULT'
  assert.deepEqual(await searchRoadAddresses('세종대로 110', 'public-key'), [])
  status = 'ERROR'
  await assert.rejects(searchRoadAddresses('세종대로 110', 'public-key'), /검색하지 못했어요/)
  status = 'OK'
  for (const bad of [{ ...road, x: '200' }, { ...road, y: 'NaN' }]) {
    results = [bad]
    await assert.rejects(searchRoadAddresses('세종대로 110', 'public-key'), /위치를 확인하지 못했어요/)
  }
  results = [null, { ...road, x: '' }, { ...road, y: 37 }, { ...road, road_address: {} }]
  assert.deepEqual(await searchRoadAddresses('세종대로 110', 'public-key'), [])
  results = null
  await assert.rejects(searchRoadAddresses('세종대로 110', 'public-key'), /검색 결과를 확인하지 못했어요/)
  await assert.rejects(searchRoadAddresses(' ', 'public-key'), /도로명과 건물번호/)
  await assert.rejects(searchRoadAddresses('세종대로 110', ''), /주소 검색 설정/)
})

test('address search times out and allows a later retry', async (t) => {
  const originalWindow = globalThis.window
  t.after(() => { if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow })
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let respond
  globalThis.window = { kakao: { maps: { Map: class {}, services: { Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT' }, Geocoder: class {
    addressSearch(query, callback) { respond = callback }
  } } } } }
  const pending = searchRoadAddresses('세종대로 110', 'public-key')
  const rejected = assert.rejects(pending, /검색이 지연/)
  for (let i = 0; i < 4; i++) await Promise.resolve()
  t.mock.timers.tick(15000)
  await rejected
  const retry = searchRoadAddresses('세종대로 110', 'public-key')
  for (let i = 0; i < 4; i++) await Promise.resolve()
  respond([], 'ZERO_RESULT')
  assert.deepEqual(await retry, [])
})

test('place search validates coordinates and handles empty results, errors and timeouts', async (t) => {
  const { searchPlaces } = await import('../src/lib/kakao-map.ts')
  const originalWindow = globalThis.window
  t.after(() => { if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow })
  const place = { id: '1', place_name: '강남역', address_name: '서울 강남구', x: '127.0276', y: '37.4979' }
  let results = [place], status = 'OK', respond = true
  globalThis.window = { kakao: { maps: { Map: class {}, services: { Geocoder: class {}, Status: { OK: 'OK', ZERO_RESULT: 'ZERO_RESULT' }, Places: class {
    keywordSearch(query, callback, options) {
      assert.equal(query, '강남역')
      assert.equal(options.size, 5)
      if (respond) callback(results, status)
    }
  } } } } }
  assert.deepEqual(await searchPlaces('  강남역 ', 'public-key'), [{ id: '1', name: '강남역', address: '서울 강남구', latitude: 37.4979, longitude: 127.0276 }])
  assert.deepEqual(await searchPlaces(' ', ''), [])
  await assert.rejects(searchPlaces('강남역', ''), /검색 설정/)
  status = 'ZERO_RESULT'
  assert.deepEqual(await searchPlaces('강남역', 'public-key'), [])
  status = 'ERROR'
  await assert.rejects(searchPlaces('강남역', 'public-key'), /검색하지 못했어요/)
  status = 'OK'
  results = null
  await assert.rejects(searchPlaces('강남역', 'public-key'), /검색 결과/)
  results = [null, { ...place, x: '' }, { ...place, place_name: null }]
  assert.deepEqual(await searchPlaces('강남역', 'public-key'), [])
  for (const bad of [{ ...place, x: '181' }, { ...place, y: 'NaN' }]) {
    results = [bad]
    await assert.rejects(searchPlaces('강남역', 'public-key'), /위치를 확인/)
  }
  t.mock.timers.enable({ apis: ['setTimeout'] })
  respond = false
  const rejected = assert.rejects(searchPlaces('강남역', 'public-key'), /검색이 지연/)
  for (let i = 0; i < 4; i++) await Promise.resolve()
  t.mock.timers.tick(15000)
  await rejected
})
