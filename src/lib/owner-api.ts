import { apiId, BackendApiError, mutateBackendApi, requestBackendApi } from './backend-api.ts'
import { readItems } from './customer-api.ts'
import { discountPrice } from './booking.ts'
import { validOpeningHours, WEEK_DAYS } from './account.ts'
import { CATEGORY_LABELS } from '../data/categories.ts'
import type { DiscountMode, RegisteredShop, Reservation, StoreService } from '../types.ts'

export interface OwnerSlot {
  instantBooking?: boolean
  id: string
  storeId: string
  serviceId: string
  startAt: string
  endAt: string
  price: { original: number; payable: number }
}

export interface OwnerReservation {
  id: string
  resourceId: string
  status: Reservation['status']
  startAt: string
  endAt: string
  customer: { id: string; displayName: string }
  service: { id: string; name: string; durationMinutes: number }
  price: { original: number; payable: number }
}

export interface OwnerReservationDetail extends OwnerReservation {
  store: { id: string; name: string }
  version: number
  allowedActions: string[]
}

export interface OwnerReservationRequest extends OwnerReservationDetail {
  slotId: string
  createdAt: string
}

export type OwnerReservationAction = 'CONFIRMED' | 'REJECTED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELED'

export interface OwnerStoreSettings {
  id: string
  description: string
  openingHours: RegisteredShop['openingHours']
  version: number
}

export interface OwnerTimetable {
  date: string
  summary: { total: number; remainingConfirmed: number }
  resources: { id: string; label: string }[]
  reservations: OwnerReservation[]
  availableSlots: OwnerSlot[]
}

export interface Vacancy {
  instantBooking?: boolean
  id: string
  storeId: string
  resourceId: string
  reason: 'CANCELLATION' | 'NO_SHOW'
  status: 'DRAFT' | 'PUBLISHED' | 'FILLED' | 'WITHDRAWN' | 'EXPIRED'
  availableFrom: string
  availableUntil: string
  originalServiceId: string
  originalPrice: number
  publishedAt: string | null
  occurredAt: string
  version: number
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const validTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const nonnegativeInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const invalidResponse = () => new BackendApiError(200, 'INVALID_RESPONSE', '사장님 데이터의 응답 형식이 올바르지 않아요. 다시 조회해 주세요.')

function parseOwnerSlot(value: unknown): OwnerSlot {
  if (!isObject(value) || !['id', 'storeId', 'serviceId'].every((key) => typeof value[key] === 'string' && value[key] !== '') || !validTime(value.startAt) || !validTime(value.endAt) || Date.parse(value.endAt) <= Date.parse(value.startAt) || !isObject(value.price) || !nonnegativeInteger(value.price.original) || !nonnegativeInteger(value.price.payable)) throw invalidResponse()
  if (value.instantBooking != null && typeof value.instantBooking !== 'boolean') throw invalidResponse()
  return { ...value, instantBooking: value.instantBooking ?? true } as unknown as OwnerSlot
}

function parseReservation(value: unknown): OwnerReservation {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.resourceId !== 'string' || !['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELED', 'NO_SHOW', 'REJECTED', 'WITHDRAWN', 'EXPIRED'].includes(String(value.status)) || !validTime(value.startAt) || !validTime(value.endAt) || Date.parse(value.endAt) <= Date.parse(value.startAt) || !isObject(value.customer) || typeof value.customer.id !== 'string' || typeof value.customer.displayName !== 'string' || !isObject(value.service) || typeof value.service.id !== 'string' || typeof value.service.name !== 'string' || !nonnegativeInteger(value.service.durationMinutes) || value.service.durationMinutes === 0 || !isObject(value.price) || !nonnegativeInteger(value.price.original) || !nonnegativeInteger(value.price.payable)) throw invalidResponse()
  return value as unknown as OwnerReservation
}

export function parseVacancy(value: unknown): Vacancy {
  if (!isObject(value) || !['id', 'storeId', 'resourceId', 'originalServiceId'].every((key) => typeof value[key] === 'string' && value[key] !== '') || !['CANCELLATION', 'NO_SHOW'].includes(String(value.reason)) || !['DRAFT', 'PUBLISHED', 'FILLED', 'WITHDRAWN', 'EXPIRED'].includes(String(value.status)) || !validTime(value.availableFrom) || !validTime(value.availableUntil) || Date.parse(value.availableUntil) <= Date.parse(value.availableFrom) || !validTime(value.occurredAt) || !(value.publishedAt === null || validTime(value.publishedAt)) || !nonnegativeInteger(value.originalPrice) || !nonnegativeInteger(value.version) || value.version === 0) throw invalidResponse()
  if (value.instantBooking != null && typeof value.instantBooking !== 'boolean') throw invalidResponse()
  return { ...value, instantBooking: value.instantBooking ?? true } as unknown as Vacancy
}

export async function readOwnerTimetable(storeId: string, date: string, signal?: AbortSignal): Promise<OwnerTimetable> {
  const timestamp = Date.parse(`${date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) throw new Error('올바른 예약 날짜를 선택해 주세요.')
  const { data } = await requestBackendApi(`/api/v1/owner/stores/${apiId(storeId)}/timetable?${new URLSearchParams({ date })}`, { signal })
  if (!data || data.date !== date || !isObject(data.summary) || !nonnegativeInteger(data.summary.total) || !nonnegativeInteger(data.summary.remainingConfirmed) || !Array.isArray(data.resources) || !data.resources.every((value) => isObject(value) && typeof value.id === 'string' && typeof value.label === 'string') || !Array.isArray(data.reservations) || !Array.isArray(data.availableSlots)) throw invalidResponse()
  return { date, summary: { total: data.summary.total, remainingConfirmed: data.summary.remainingConfirmed }, resources: data.resources as OwnerTimetable['resources'], reservations: data.reservations.map(parseReservation), availableSlots: data.availableSlots.map(parseOwnerSlot) }
}

export async function readOwnerVacancies(storeId: string, signal?: AbortSignal): Promise<Vacancy[]> {
  return (await readItems(`/api/v1/owner/stores/${apiId(storeId)}/vacancies?limit=100`, signal)).map(parseVacancy)
}

export function vacancyPublishInput(vacancy: Vacancy, service: StoreService, startAt: string, mode: DiscountMode, value: number, instantBooking = true, now = Date.now()) {
  const start = Date.parse(startAt)
  if (typeof instantBooking !== 'boolean') throw new Error('예약 확정 방식을 선택해 주세요.')
  if (vacancy.status !== 'DRAFT' && vacancy.status !== 'WITHDRAWN') throw new Error('발행할 수 있는 빈자리가 아니에요. 다시 조회해 주세요.')
  if (!service.active || !Number.isSafeInteger(service.durationMinutes) || service.durationMinutes <= 0 || !Number.isSafeInteger(service.basePrice) || service.basePrice <= 0) throw new Error('현재 제공 중인 시술을 선택해 주세요.')
  if (!Number.isFinite(start) || start < now || start < Date.parse(vacancy.availableFrom) || start + service.durationMinutes * 60000 > Date.parse(vacancy.availableUntil)) throw new Error('시술이 빈 시간 안에 끝나도록 시작 시간을 선택해 주세요.')
  if (discountPrice(service.basePrice, mode, value) === null) throw new Error(mode === 'percent' ? '할인율은 1~99 사이의 정수로 입력해 주세요.' : '할인 가격은 정가보다 낮은 양의 정수로 입력해 주세요.')
  return { serviceId: service.id, startAt, discount: { type: mode === 'percent' ? 'PERCENT' : 'FIXED_PRICE', value }, expectedVersion: vacancy.version, instantBooking }
}

export async function publishVacancy(vacancy: Vacancy, input: ReturnType<typeof vacancyPublishInput>, idempotencyKey: string): Promise<Vacancy> {
  const { data } = await mutateBackendApi(`/api/v1/owner/stores/${apiId(vacancy.storeId)}/vacancies/${apiId(vacancy.id)}/publish`, { body: input, idempotencyKey })
  const published = parseVacancy(data?.vacancy)
  if (published.id !== vacancy.id || published.storeId !== vacancy.storeId || published.status !== 'PUBLISHED' || published.instantBooking !== input.instantBooking) throw invalidResponse()
  return published
}

function parseReservationDetail(value: unknown, storeId: string, reservationId: string): OwnerReservationDetail {
  const reservation = parseReservation(value)
  if (!isObject(value) || reservation.id !== reservationId || !isObject(value.store) || value.store.id !== storeId || typeof value.store.name !== 'string' || !nonnegativeInteger(value.version) || value.version === 0 || !Array.isArray(value.allowedActions) || !value.allowedActions.every((action) => typeof action === 'string')) throw invalidResponse()
  return value as unknown as OwnerReservationDetail
}

export async function readOwnerReservation(storeId: string, reservationId: string, signal?: AbortSignal): Promise<OwnerReservationDetail> {
  const { data } = await requestBackendApi(`/api/v1/owner/stores/${apiId(storeId)}/reservations/${apiId(reservationId)}`, { signal })
  return parseReservationDetail(data, storeId, reservationId)
}

export async function readOwnerReservationRequests(storeId: string, signal?: AbortSignal): Promise<OwnerReservationRequest[]> {
  const items = await readItems(`/api/v1/owner/stores/${apiId(storeId)}/reservation-requests?limit=20`, signal)
  return items.map((value) => {
    if (!isObject(value) || typeof value.id !== 'string' || !value.id || typeof value.slotId !== 'string' || !value.slotId || !validTime(value.createdAt)) throw invalidResponse()
    const reservation = parseReservationDetail(value, storeId, value.id)
    if (reservation.status !== 'PENDING') throw invalidResponse()
    return { ...reservation, slotId: value.slotId, createdAt: value.createdAt }
  })
}

export async function updateOwnerReservationStatus(storeId: string, reservation: OwnerReservationDetail, status: OwnerReservationAction, idempotencyKey: string): Promise<OwnerReservationDetail> {
  const action = { CONFIRMED: 'APPROVE', REJECTED: 'REJECT', COMPLETED: 'COMPLETE', NO_SHOW: 'NO_SHOW', CANCELED: 'CANCEL' }[status]
  const choosing = status === 'CONFIRMED' || status === 'REJECTED'
  if (reservation.store.id !== storeId || reservation.status !== (choosing ? 'PENDING' : 'CONFIRMED') || !action || !reservation.allowedActions.includes(action)) throw new Error('현재 처리할 수 없는 예약이에요. 최신 예약 정보를 다시 조회해 주세요.')
  const cancel = status === 'CANCELED'
  const { data } = await mutateBackendApi(cancel ? `/api/v1/reservations/${apiId(reservation.id)}/cancel` : `/api/v1/owner/stores/${apiId(storeId)}/reservations/${apiId(reservation.id)}/status`, { body: cancel ? { reasonCode: 'STORE_REQUEST', expectedVersion: reservation.version } : { status, expectedVersion: reservation.version }, idempotencyKey })
  // 본인 예약의 취소 응답에는 고객 정보가 빠질 수 있어 사장 상세로 결과를 다시 확인한다.
  const updated = cancel ? await readOwnerReservation(storeId, reservation.id) : parseReservationDetail(data?.reservation, storeId, reservation.id)
  if (updated.status !== status) throw invalidResponse()
  return updated
}

export async function withdrawVacancy(vacancy: Vacancy, idempotencyKey: string): Promise<Vacancy> {
  if (vacancy.status !== 'PUBLISHED') throw new Error('발행 중인 빈자리만 철회할 수 있어요. 다시 조회해 주세요.')
  const { data } = await mutateBackendApi(`/api/v1/owner/stores/${apiId(vacancy.storeId)}/vacancies/${apiId(vacancy.id)}/withdraw`, { body: { expectedVersion: vacancy.version }, idempotencyKey })
  const updated = parseVacancy(data?.vacancy)
  if (updated.id !== vacancy.id || updated.storeId !== vacancy.storeId || updated.status !== 'WITHDRAWN') throw invalidResponse()
  return updated
}

function parseStoreSettings(data: Record<string, unknown> | null, storeId: string): OwnerStoreSettings {
  const hours = Array.isArray(data?.openingHours) ? data.openingHours.map((value) => {
    if (!isObject(value)) return value
    const minute = (time: unknown) => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d:00$/.test(time) ? time.slice(0, 5) : time
    return { ...value, opensAt: minute(value.opensAt), closesAt: minute(value.closesAt) }
  }) : null
  if (!data || data.id !== storeId || !(data.description === null || typeof data.description === 'string') || !validOpeningHours(hours) || !nonnegativeInteger(data.version) || data.version === 0) throw invalidResponse()
  return { id: storeId, description: data.description ?? '', openingHours: WEEK_DAYS.map((day) => hours.find((item) => item.dayOfWeek === day)!), version: data.version }
}

export async function readOwnerStoreSettings(storeId: string, signal?: AbortSignal): Promise<OwnerStoreSettings> {
  const { data } = await requestBackendApi(`/api/v1/stores/${apiId(storeId)}`, { signal })
  return parseStoreSettings(data, storeId)
}

export async function updateOwnerStore(settings: OwnerStoreSettings): Promise<OwnerStoreSettings> {
  if (typeof settings.description !== 'string' || settings.description.trim().length > 1000) throw new Error('매장 소개는 1,000자 이내로 입력해 주세요.')
  if (!validOpeningHours(settings.openingHours)) throw new Error('요일별 영업시간을 확인해 주세요. 종료 시간은 시작보다 늦어야 해요.')
  const { data } = await mutateBackendApi(`/api/v1/owner/stores/${apiId(settings.id)}`, { method: 'PATCH', body: { description: settings.description.trim(), openingHours: settings.openingHours, expectedVersion: settings.version } })
  return parseStoreSettings(data, settings.id)
}

type ServiceFields = Pick<StoreService, 'name' | 'basePrice' | 'active'>

function serviceFields(input: ServiceFields): ServiceFields {
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100) throw new Error('시술 이름을 100자 이내로 입력해 주세요.')
  if (!nonnegativeInteger(input.basePrice) || input.basePrice > 10000000) throw new Error('시술 가격을 0원부터 1,000만 원 사이의 정수로 입력해 주세요.')
  if (typeof input.active !== 'boolean') throw new Error('시술 제공 여부를 선택해 주세요.')
  return { name: input.name.trim(), basePrice: input.basePrice, active: input.active }
}

function parseService(data: Record<string, unknown> | null, storeId: string): StoreService {
  if (!data || typeof data.id !== 'string' || !data.id || data.storeId !== storeId || typeof data.category !== 'string' || !Object.hasOwn(CATEGORY_LABELS, data.category) || typeof data.name !== 'string' || !data.name.trim() || !nonnegativeInteger(data.basePrice) || !nonnegativeInteger(data.durationMinutes) || data.durationMinutes < 15 || data.durationMinutes > 480 || data.durationMinutes % 5 !== 0 || typeof data.active !== 'boolean' || !nonnegativeInteger(data.version) || data.version === 0) throw invalidResponse()
  return data as unknown as StoreService
}

export async function createOwnerService(storeId: string, input: ServiceFields & { durationMinutes: number }, idempotencyKey: string): Promise<StoreService> {
  const fields = serviceFields(input)
  if (!nonnegativeInteger(input.durationMinutes) || input.durationMinutes < 15 || input.durationMinutes > 480 || input.durationMinutes % 5 !== 0) throw new Error('소요 시간은 15~480분, 5분 단위로 입력해 주세요.')
  const { data } = await mutateBackendApi(`/api/v1/owner/stores/${apiId(storeId)}/services`, { body: { ...fields, durationMinutes: input.durationMinutes }, idempotencyKey })
  return parseService(data, storeId)
}

export async function updateOwnerService(storeId: string, service: StoreService, input: ServiceFields): Promise<StoreService> {
  const fields = serviceFields(input)
  const { data } = await mutateBackendApi(`/api/v1/owner/stores/${apiId(storeId)}/services/${apiId(service.id)}`, { method: 'PATCH', body: { ...fields, expectedVersion: service.version } })
  const updated = parseService(data, storeId)
  if (updated.id !== service.id || updated.durationMinutes !== service.durationMinutes) throw invalidResponse()
  return updated
}
