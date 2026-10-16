import { BackendApiError, mutateBackendApi } from './backend-api.ts'
import { CATEGORY_LABELS } from '../data/categories.ts'
import type { WaitlistConditions } from '../types.ts'

export type PartialConditions = { [K in keyof WaitlistConditions]: WaitlistConditions[K] | null }
export interface IntentAnalysis {
  conditions: PartialConditions
  resolution: 'RESOLVED' | 'NEEDS_CLARIFICATION' | 'UNSUPPORTED'
  missingFields: string[]
  clarificationQuestion: string | null
}

export function validateWaitlistConditions(value: WaitlistConditions, now = Date.now()): string | null {
  if (!Object.hasOwn(CATEGORY_LABELS, value.category)) return '시술 분류를 선택해 주세요.'
  const start = Date.parse(value.windowStart), end = Date.parse(value.windowEnd)
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end <= now) return '방문 가능 시작과 시술 종료 기한을 확인해 주세요.'
  if (value.storeId !== null && (!value.storeId.trim() || value.storeId.length > 64)) return '가게를 다시 선택해 주세요.'
  if (value.serviceId !== null && (!value.serviceId.trim() || value.serviceId.length > 64)) return '시술을 다시 선택해 주세요.'
  if (!value.storeId && (!value.location || value.radiusMeters === null)) return '주변 가게를 찾을 위치와 반경을 선택해 주세요.'
  if (value.location && (!Number.isFinite(value.location.latitude) || Math.abs(value.location.latitude) > 90 || !Number.isFinite(value.location.longitude) || Math.abs(value.location.longitude) > 180)) return '위치를 다시 확인해 주세요.'
  if (value.radiusMeters !== null && (!Number.isInteger(value.radiusMeters) || value.radiusMeters < 100 || value.radiusMeters > 10000)) return '반경은 100~10,000m로 입력해 주세요.'
  if (value.maxPrice !== null && (!Number.isSafeInteger(value.maxPrice) || value.maxPrice < 0 || value.maxPrice > 10000000)) return '최대 금액은 0~1,000만 원으로 입력해 주세요.'
  if (value.keywords.length > 30 || value.keywords.some((word) => word.length > 100)) return '요청 사항은 100자 이내로 최대 30개까지 입력해 주세요.'
  return null
}

export async function analyzeIntent(text: string, location: WaitlistConditions['location']): Promise<IntentAnalysis> {
  if (!text.trim() || text.trim().length > 4000) throw new Error('원하는 조건을 4,000자 이내로 입력해 주세요.')
  const { data } = await mutateBackendApi('/api/v1/search/intents/analyze', { body: { text: text.trim(), ...(location ? { context: { location } } : {}) } })
  const invalid = () => { throw new BackendApiError(200, 'INVALID_RESPONSE', '분석 결과를 확인하지 못했어요. 아래에서 직접 조건을 입력해 주세요.') }
  if (!data || !['RESOLVED', 'NEEDS_CLARIFICATION', 'UNSUPPORTED'].includes(String(data.resolution)) || !Array.isArray(data.missingFields) || !data.missingFields.every((value) => typeof value === 'string') || (data.clarificationQuestion !== null && typeof data.clarificationQuestion !== 'string')) return invalid()
  const c = data.conditions as PartialConditions | null
  if (!c || typeof c !== 'object' || Array.isArray(c) ||
    (c.category !== null && (typeof c.category !== 'string' || !Object.hasOwn(CATEGORY_LABELS, c.category))) ||
    ['storeId', 'serviceId', 'windowStart', 'windowEnd'].some((key) => c[key as keyof PartialConditions] !== null && typeof c[key as keyof PartialConditions] !== 'string') ||
    [c.windowStart, c.windowEnd].some((value) => value !== null && !Number.isFinite(Date.parse(value))) ||
    [c.radiusMeters, c.maxPrice].some((value) => value !== null && !Number.isSafeInteger(value)) ||
    (c.keywords !== null && (!Array.isArray(c.keywords) || !c.keywords.every((value) => typeof value === 'string'))) ||
    (c.location !== null && (!c.location || !Number.isFinite(c.location.latitude) || Math.abs(c.location.latitude) > 90 || !Number.isFinite(c.location.longitude) || Math.abs(c.location.longitude) > 180))) return invalid()
  return { conditions: c, resolution: data.resolution as IntentAnalysis['resolution'], missingFields: data.missingFields, clarificationQuestion: data.clarificationQuestion as string | null }
}
