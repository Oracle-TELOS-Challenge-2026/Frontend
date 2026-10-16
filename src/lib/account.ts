import { CATEGORY_LABELS, SHOP_CATEGORIES } from '../data/categories.ts'
import { apiId, BackendApiError, mutateBackendApi, requestBackendApi } from './backend-api.ts'
import { readStoreServices } from './customer-api.ts'
import type { AccountState, CategoryCode, RegisteredShop, Role, ShopRegistration } from '../types.ts'

export const WEEK_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const

export function validOpeningHours(value: unknown): value is ShopRegistration['openingHours'] {
  if (!Array.isArray(value) || value.length !== 7 || value.some((item) => !item || typeof item !== 'object')) return false
  if (WEEK_DAYS.some((day) => value.filter((item) => item.dayOfWeek === day).length !== 1)) return false
  return value.every((item) => typeof item.closed === 'boolean' && (item.closed
    ? item.opensAt === null && item.closesAt === null
    : typeof item.opensAt === 'string' && typeof item.closesAt === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.opensAt) && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.closesAt) && item.opensAt < item.closesAt))
}

export function validateShopRegistration(input: ShopRegistration): string | null {
  if (input.description !== undefined && (typeof input.description !== 'string' || input.description.trim().length > 1000)) return '가게 설명은 1,000자 이내로 입력해 주세요.'
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100) return '가게 이름을 100자 이내로 입력해 주세요.'
  if (!SHOP_CATEGORIES.some((item) => item.name !== '전체' && item.name === input.category)) return '가게 업종을 선택해 주세요.'
  if (typeof input.address !== 'string' || !input.address.trim() || input.address.trim().length > 300) return '가게 주소를 300자 이내로 입력해 주세요.'
  if (!Number.isFinite(input.latitude) || Math.abs(input.latitude) > 90 || !Number.isFinite(input.longitude) || Math.abs(input.longitude) > 180) return '가게의 위도와 경도를 올바르게 입력해 주세요.'
  if (!validOpeningHours(input.openingHours)) return '월요일부터 일요일까지 영업시간을 확인해 주세요. 영업 종료는 시작보다 늦어야 하며, 휴무일의 시간은 비워야 해요.'
  if (typeof input.service !== 'string' || !input.service.trim() || input.service.trim().length > 100) return '대표 시술을 100자 이내로 입력해 주세요.'
  if (!Number.isInteger(input.originalPrice) || input.originalPrice < 0 || input.originalPrice > 10000000) return '시술 가격을 0원부터 1,000만 원 사이로 입력해 주세요.'
  if (!Number.isInteger(input.duration) || input.duration < 15 || input.duration > 480 || input.duration % 5 !== 0) return '소요 시간을 15분부터 480분 사이에서 5분 단위로 입력해 주세요.'
  return null
}

function storeFromResponse(data: Record<string, unknown> | null): RegisteredShop {
  const location = data?.location as { latitude?: unknown; longitude?: unknown } | null
  const hours = Array.isArray(data?.openingHours) ? data.openingHours.map((item) => {
    if (!item || typeof item !== 'object') return item
    const day = item as Record<string, unknown>
    const minute = (value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d:00$/.test(value) ? value.slice(0, 5) : value
    return { ...day, opensAt: minute(day.opensAt), closesAt: minute(day.closesAt) }
  }) : null
  if (!data || (data.description !== undefined && data.description !== null && typeof data.description !== 'string') || typeof data.id !== 'string' || !data.id || typeof data.name !== 'string' ||
    typeof data.address !== 'string' || typeof data.category !== 'string' || !Object.hasOwn(CATEGORY_LABELS, data.category) ||
    !location || typeof location.latitude !== 'number' || (!Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90) || typeof location.longitude !== 'number' || (!Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180) ||
    !validOpeningHours(hours) || !Number.isSafeInteger(data.version) || Number(data.version) < 1) {
    throw new BackendApiError(200, 'INVALID_RESPONSE', '등록된 가게 정보를 확인하지 못했어요.')
  }
  return {
    id: data.id, name: data.name, category: CATEGORY_LABELS[data.category as CategoryCode], address: data.address,
    latitude: location.latitude, longitude: location.longitude, openingHours: WEEK_DAYS.map((day) => hours.find((item) => item.dayOfWeek === day)!),
    ...(data.description !== undefined ? { description: data.description === null ? '' : String(data.description) } : {}),
    version: Number(data.version), service: '', originalPrice: 0, duration: 0,
  }
}

export async function readRegisteredShop(storeId: string, signal?: AbortSignal): Promise<RegisteredShop> {
  const [response, services] = await Promise.all([
    requestBackendApi(`/api/v1/stores/${apiId(storeId)}`, { signal }),
    readStoreServices(storeId, signal),
  ])
  const shop = storeFromResponse(response.data)
  const service = services.find((item) => item.active) ?? services[0]
  return service ? { ...shop, serviceId: service.id, service: service.name, originalPrice: service.basePrice, duration: service.durationMinutes } : shop
}

export async function createRegisteredShop(input: ShopRegistration, idempotencyKey: string): Promise<RegisteredShop> {
  const { data } = await mutateBackendApi('/api/v1/owner/stores', { idempotencyKey, body: {
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    name: input.name.trim(), category: SHOP_CATEGORIES.find((item) => item.name === input.category)?.code,
    address: input.address.trim(), location: { latitude: input.latitude, longitude: input.longitude }, openingHours: input.openingHours,
  } })
  return storeFromResponse(data)
}

export async function createRegisteredService(shop: RegisteredShop, input: ShopRegistration, idempotencyKey: string): Promise<RegisteredShop> {
  const { data } = await mutateBackendApi(`/api/v1/owner/stores/${apiId(shop.id)}/services`, { idempotencyKey, body: {
    name: input.service.trim(), durationMinutes: input.duration, basePrice: input.originalPrice, active: true,
  } })
  if (typeof data?.id !== 'string' || !data.id || typeof data.name !== 'string' || typeof data.basePrice !== 'number' || typeof data.durationMinutes !== 'number') {
    throw new BackendApiError(200, 'INVALID_RESPONSE', '등록된 시술 정보를 확인하지 못했어요. 다시 시도해 주세요.')
  }
  return { ...shop, serviceId: data.id, service: data.name, originalPrice: data.basePrice, duration: data.durationMinutes }
}

export function restoreAccountRole(roles: string[], saved: string | null): Role | null {
  if ((saved === 'customer' || saved === 'owner') && roles.some((role) => role === 'CUSTOMER' || role === 'OWNER')) return saved
  return roles.includes('CUSTOMER') ? 'customer' : roles.includes('OWNER') ? 'owner' : null
}

export function accountStartPath(account: AccountState): string {
  if (!account.role) return '/choose-role'
  return account.role === 'owner' && !account.shop?.serviceId ? '/owner/register' : `/${account.role}`
}
