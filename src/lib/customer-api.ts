import { apiId, BackendApiError, mutateBackendApi, requestBackendApi } from './backend-api.ts'
import { CATEGORY_LABELS } from '../data/categories.ts'
import type { CategoryCode, Reservation, Shop, Slot, StoreService, WaitlistConditions, WaitlistItem } from '../types.ts'
import type { SearchBounds } from './shop-search.ts'
import { isCalendarDate } from './format.ts'
import { categoryImage } from './shop-images.ts'

// 위치를 선택하기 전 지도의 시작점이며, 매장 데이터는 서버에서 조회한다.
export const DEFAULT_MAP_CENTER = { latitude: 37.5665, longitude: 126.978 }

function invalid(): never { throw new BackendApiError(0, 'INVALID_RESPONSE', '서버에서 받은 데이터 형식이 올바르지 않아요. 다시 조회해 주세요.') }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  return value as Record<string, unknown>
}
function text(value: unknown): string { return typeof value === 'string' ? value : invalid() }
function number(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : invalid() }
function integer(value: unknown, minimum = 0): number {
  const result = number(value)
  return Number.isSafeInteger(result) && result >= minimum ? result : invalid()
}
function category(value: unknown): CategoryCode {
  if (typeof value !== 'string' || !Object.hasOwn(CATEGORY_LABELS, value)) return invalid()
  return value as CategoryCode
}
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : invalid() }
function picture(value: unknown): string {
  if (value === null || value === '') return ''
  const url = text(value)
  return /^https?:\/\//i.test(url) ? url : ''
}
function timestamp(value: unknown): string {
  const date = text(value)
  return Number.isFinite(Date.parse(date)) ? date : invalid()
}
function instantBooking(value: unknown): boolean { return value == null ? true : typeof value === 'boolean' ? value : invalid() }

export async function readItems(path: string, signal?: AbortSignal): Promise<unknown[]> {
  const items: unknown[] = []
  const cursors = new Set<string>()
  let cursor: string | null = null
  do {
    const { data } = await requestBackendApi(path + (cursor ? `${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cursor)}` : ''), { signal })
    items.push(...array(data?.items))
    const page = record(data?.page)
    if (typeof page.hasNext !== 'boolean') return invalid()
    cursor = page.hasNext ? text(page.nextCursor) : null
    if (cursor !== null && (!cursor || cursors.has(cursor))) return invalid()
    if (cursor) cursors.add(cursor)
  } while (cursor)
  return items
}

export async function readCategories(signal?: AbortSignal) {
  const { data } = await requestBackendApi('/api/v1/stores/categories', { signal })
  return array(data?.items).map((item) => { const row = record(item); return { code: category(row.code), label: text(row.label) } })
}

export async function readStoreServices(storeId: string, signal?: AbortSignal): Promise<StoreService[]> {
  return (await readItems(`/api/v1/stores/${apiId(storeId)}/services?limit=100`, signal)).map((item) => {
    const row = record(item)
    if (typeof row.active !== 'boolean') return invalid()
    return { id: text(row.id), name: text(row.name), category: category(row.category), durationMinutes: integer(row.durationMinutes), basePrice: integer(row.basePrice), active: row.active, version: integer(row.version, 1) }
  })
}

export async function readStore(storeId: string, signal?: AbortSignal): Promise<Shop> {
  const path = `/api/v1/stores/${apiId(storeId)}`
  const [{ data }, services] = await Promise.all([
    requestBackendApi(path, { signal }), readStoreServices(storeId, signal),
  ])
  const row = record(data), location = record(row.location), code = category(row.category)
  const active = services.filter((service) => service.active)
  return {
    id: text(row.id), name: text(row.name), category: CATEGORY_LABELS[code], categoryCode: code,
    image: picture(row.imageUrl) || categoryImage(text(row.id), code), address: text(row.address), distance: '',
    description: row.description === null ? '' : text(row.description),
    service: active[0]?.name ?? '', originalPrice: active[0]?.basePrice ?? null, duration: active[0]?.durationMinutes ?? null,
    latitude: number(location.latitude), longitude: number(location.longitude), services: active,
    slots: [],
  }
}

export interface StoreTimetable {
  date: string
  timezone: 'Asia/Seoul'
  openingHours: { closed: boolean; opensAt: string | null; closesAt: string | null }
  busyTimes: { startAt: string; endAt: string }[]
  availableTimes: { startAt: string; endAt: string }[]
}

export async function readStoreTimetable(storeId: string, date: string, signal?: AbortSignal): Promise<StoreTimetable> {
  if (!isCalendarDate(date)) throw new Error('올바른 방문 날짜를 선택해 주세요.')
  const { data } = await requestBackendApi(`/api/v1/stores/${apiId(storeId)}/timetable?${new URLSearchParams({ date })}`, { signal })
  const row = record(data), hours = record(row.openingHours)
  const validHour = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(value)
  if (row.date !== date || row.timezone !== 'Asia/Seoul' || typeof hours.closed !== 'boolean') return invalid()
  if (hours.closed ? hours.opensAt !== null || hours.closesAt !== null : !validHour(hours.opensAt) || !validHour(hours.closesAt) || hours.opensAt >= hours.closesAt) return invalid()
  const ranges = (value: unknown) => array(value).map((value) => {
    const range = record(value), startAt = timestamp(range.startAt), endAt = timestamp(range.endAt)
    if (Date.parse(startAt) >= Date.parse(endAt)) return invalid()
    return { startAt, endAt }
  })
  return { date, timezone: 'Asia/Seoul', openingHours: { closed: hours.closed, opensAt: hours.opensAt as string | null, closesAt: hours.closesAt as string | null }, busyTimes: ranges(row.busyTimes), availableTimes: ranges(row.availableTimes) }
}

export function storeSearchPath(query: string, code: string, bounds: SearchBounds | null): string {
  const latitude = bounds ? (bounds.north + bounds.south) / 2 : DEFAULT_MAP_CENTER.latitude
  const longitude = bounds ? (bounds.east + bounds.west) / 2 : DEFAULT_MAP_CENTER.longitude
  const radius = bounds ? Math.ceil(Math.hypot((bounds.north - latitude) * 111320, (bounds.east - longitude) * 111320 * Math.cos(latitude * Math.PI / 180))) : 5000
  const params = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), radiusMeters: String(Math.min(10000, Math.max(100, radius))), limit: '50' })
  if (query.trim()) params.set('keyword', query.trim())
  if (code) params.set('category', category(code))
  return `/api/v1/search/stores?${params}`
}

export async function searchStores(query: string, code: string, bounds: SearchBounds | null, signal?: AbortSignal): Promise<Shop[]> {
  const rows = await readItems(storeSearchPath(query, code, bounds), signal)
  return Promise.all(rows.map(async (item) => {
    const row = record(item), store = record(row.store), location = record(row.location), code = category(store.category)
    const slot = row.bestSlot === null ? null : record(row.bestSlot)
    const distance = number(row.distanceMeters)
    const id = text(store.id)
    // shortcut: 슬롯 없는 매장은 시술을 개별 조회하며, 검색량이 늘면 검색 응답에 대표 가격을 포함한다.
    const services = slot ? [] : (await readStoreServices(id, signal)).filter((service) => service.active)
    return {
      id, name: text(store.name), category: CATEGORY_LABELS[code], categoryCode: code,
      image: picture(store.imageUrl) || categoryImage(id, code), address: '', distance: distance < 1000 ? `${distance}m` : `${(distance / 1000).toFixed(1)}km`,
      description: '',
      service: slot ? text(slot.serviceName) : services[0]?.name ?? '', originalPrice: slot ? integer(slot.originalPrice) : services[0]?.basePrice ?? null, duration: services[0]?.durationMinutes ?? null,
      latitude: number(location.latitude), longitude: number(location.longitude), services,
      slots: slot ? [{ id: text(slot.id), serviceId: text(slot.serviceId), startsAt: timestamp(slot.startAt), service: text(slot.serviceName), originalPrice: integer(slot.originalPrice), price: integer(slot.payablePrice), version: integer(slot.version, 1), instantBooking: instantBooking(slot.instantBooking) }] : [],
    }
  }))
}

export async function prepareReservation(shopId: string, slot: Slot, waitlistId?: string) {
  const { data } = await requestBackendApi(`/api/v1/stores/${apiId(shopId)}/slots/${apiId(slot.id)}`)
  const current = record(data), price = record(current.price)
  if (current.id !== slot.id || current.storeId !== shopId) return invalid()
  if (current.bookable !== true) throw new Error('이미 예약되었거나 예약할 수 없는 시간이에요. 다른 시간을 골라주세요.')
  if (instantBooking(current.instantBooking) !== (slot.instantBooking !== false) || integer(price.payable) !== slot.price || text(current.serviceId) !== slot.serviceId || Date.parse(timestamp(current.startAt)) !== Date.parse(slot.startsAt) || (slot.endsAt !== undefined && Date.parse(timestamp(current.endAt)) !== Date.parse(slot.endsAt)) || (slot.version !== undefined && integer(current.version, 1) !== slot.version)) {
    throw new Error('예약 조건이 변경됐어요. 가게에서 최신 가격과 시간을 다시 확인해 주세요.')
  }
  return { slotId: slot.id, expectedPrice: slot.price, expectedSlotVersion: integer(current.version, 1), ...(waitlistId ? { waitlistId } : {}) }
}

export async function readStoreSlot(shop: Shop, slotId: string, signal?: AbortSignal): Promise<Slot & { bookable: boolean }> {
  const { data } = await requestBackendApi(`/api/v1/stores/${apiId(shop.id)}/slots/${apiId(slotId)}`, { signal })
  const row = record(data), price = record(row.price)
  const service = shop.services.find((item) => item.id === row.serviceId)
  if (row.id !== slotId || row.storeId !== shop.id || !service || typeof row.bookable !== 'boolean') return invalid()
  return { id: slotId, serviceId: service.id, service: service.name, startsAt: timestamp(row.startAt), endsAt: timestamp(row.endAt), originalPrice: integer(price.original), price: integer(price.payable), version: integer(row.version, 1), instantBooking: instantBooking(row.instantBooking), bookable: row.bookable }
}

export async function reserveSlot(body: Awaited<ReturnType<typeof prepareReservation>>, idempotencyKey: string) {
  const { data } = await mutateBackendApi('/api/v1/reservations', { body, idempotencyKey })
  const reservation = reservationFromResponse(data)
  if (reservation.status !== 'PENDING' && reservation.status !== 'CONFIRMED') return invalid()
  return reservation
}

export async function readReservations(scope: 'UPCOMING' | 'PAST' | 'CANCELED', signal?: AbortSignal): Promise<Reservation[]> {
  return (await readItems(`/api/v1/reservations/me?scope=${scope}&limit=100`, signal)).map(reservationFromResponse)
}

function reservationFromResponse(item: unknown): Reservation {
  const row = record(item), store = record(row.store), service = record(row.service), price = record(row.price)
  if (!['PENDING', 'CONFIRMED', 'REJECTED', 'WITHDRAWN', 'EXPIRED', 'COMPLETED', 'CANCELED', 'NO_SHOW'].includes(text(row.status))) return invalid()
  return { id: text(row.id), shopId: text(store.id), shopName: text(store.name), shopImage: picture(store.imageUrl), serviceId: text(service.id), service: service.serviceDescription == null ? text(service.name) : text(service.serviceDescription), duration: integer(service.durationMinutes), startsAt: timestamp(row.startAt), endsAt: timestamp(row.endAt), originalPrice: integer(price.original), price: integer(price.payable), status: row.status as Reservation['status'], createdAt: timestamp(row.createdAt), version: integer(row.version, 1), allowedActions: array(row.allowedActions).map(text) }
}

export async function readReservation(id: string, signal?: AbortSignal): Promise<Reservation> {
  const { data } = await requestBackendApi(`/api/v1/reservations/${apiId(id)}`, { signal })
  const item = reservationFromResponse(data)
  if (item.id !== id) return invalid()
  return item
}

export async function cancelReservation(item: Reservation, idempotencyKey: string) {
  await mutateBackendApi(`/api/v1/reservations/${apiId(item.id)}/cancel`, { body: { reasonCode: 'CUSTOMER_REQUEST', expectedVersion: item.version }, idempotencyKey })
}

function conditionsFromResponse(value: unknown): WaitlistConditions {
  const row = record(value)
  return {
    storeId: row.storeId === null ? null : text(row.storeId), category: category(row.category), serviceId: row.serviceId === null ? null : text(row.serviceId),
    windowStart: timestamp(row.windowStart), windowEnd: timestamp(row.windowEnd),
    location: row.location === null ? null : { latitude: number(record(row.location).latitude), longitude: number(record(row.location).longitude) },
    radiusMeters: row.radiusMeters === null ? null : number(row.radiusMeters), maxPrice: row.maxPrice === null ? null : number(row.maxPrice), keywords: array(row.keywords).map(text),
  }
}

export async function readWaitlist(signal?: AbortSignal): Promise<WaitlistItem[]> {
  return (await readItems('/api/v1/search/waitlists/me?status=ACTIVE&limit=100', signal)).map(waitlistFromResponse)
}

function waitlistFromResponse(item: unknown): WaitlistItem {
  const row = record(item)
  if (!['ACTIVE', 'FULFILLED', 'CANCELED', 'EXPIRED'].includes(text(row.status)) || !['WAITING', 'AVAILABLE', 'CLOSED'].includes(text(row.availability))) return invalid()
  const summary = (value: unknown) => { if (value === null) return null; const item = record(value); return { id: text(item.id), name: text(item.name), imageUrl: picture(item.imageUrl) } }
  return { id: text(row.id), status: row.status as WaitlistItem['status'], availability: row.availability as WaitlistItem['availability'], conditions: conditionsFromResponse(row.conditions), store: summary(row.store), service: summary(row.service), createdAt: timestamp(row.createdAt), version: integer(row.version, 1),
    offers: array(row.offers).map((value) => { const offer = record(value); return { id: text(offer.slotId), shopId: text(offer.storeId), shopName: text(offer.storeName), image: picture(offer.imageUrl), serviceId: text(offer.serviceId), service: text(offer.serviceName), startsAt: timestamp(offer.startAt), endsAt: timestamp(offer.endAt), originalPrice: integer(offer.originalPrice), price: integer(offer.payablePrice), instantBooking: instantBooking(offer.instantBooking) } }),
  }
}

export async function readWaitlistItem(id: string, signal?: AbortSignal): Promise<WaitlistItem> {
  const { data } = await requestBackendApi(`/api/v1/search/waitlists/${apiId(id)}`, { signal })
  const item = waitlistFromResponse(data)
  if (item.id !== id) return invalid()
  return item
}

export async function saveWaitlist(conditions: WaitlistConditions, idempotencyKey: string, item?: WaitlistItem, source: 'STORE_DETAIL' | 'NATURAL_LANGUAGE' | 'MANUAL' = 'STORE_DETAIL', signal?: AbortSignal) {
  const body = { conditions, notificationConsent: true }
  if (item) await mutateBackendApi(`/api/v1/search/waitlists/${apiId(item.id)}`, { method: 'PATCH', body: { ...body, expectedVersion: item.version }, signal })
  else await mutateBackendApi('/api/v1/search/waitlists', { body: { ...body, source }, idempotencyKey, signal })
}

export async function cancelWaitlist(item: WaitlistItem, idempotencyKey: string) {
  await mutateBackendApi(`/api/v1/search/waitlists/${apiId(item.id)}/cancel`, { body: { expectedVersion: item.version }, idempotencyKey })
}
