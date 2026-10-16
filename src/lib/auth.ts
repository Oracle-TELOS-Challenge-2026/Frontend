import { BACKEND_API_ORIGIN, BackendApiError, requestBackendApi } from './backend-api.ts'

export interface CurrentUser {
  id: string
  displayName: string
  roles: string[]
  ownedStoreIds: string[]
  preferences: { categories: string[]; keywords: string[]; maxPrice: number | null; text: string }
  location: { latitude: number; longitude: number; accuracyMeters: number | null; source: string; observedAt: string; savedAt: string } | null
  version: number
}

export type SessionResult =
  | { status: 'authenticated'; user: CurrentUser }
  | { status: 'anonymous' }

export const KAKAO_LOGIN_URL = `${BACKEND_API_ORIGIN}/api/v1/auth/oauth/kakao/start`

async function getCsrfToken(signal?: AbortSignal): Promise<string> {
  const { status, data } = await requestBackendApi('/api/v1/auth/csrf', { signal })
  if (status !== 200 || typeof data?.csrfToken !== 'string' || !data.csrfToken.trim() || /\p{Cc}/u.test(data.csrfToken)) {
    throw new BackendApiError(status, 'INVALID_RESPONSE', '서버에서 유효한 보안 확인 정보를 받지 못했어요.')
  }
  return data.csrfToken
}

export async function readSession(signal?: AbortSignal): Promise<SessionResult> {
  try {
    const { status, data } = await requestBackendApi('/api/v1/users/me', { signal })
    const preferences = data?.preferences
    if (status !== 200 || typeof data?.id !== 'string' || !data.id.trim() ||
      typeof data.displayName !== 'string' || !data.displayName.trim() ||
      !Array.isArray(data.roles) || !data.roles.every((role) => typeof role === 'string' && role.trim()) ||
      !Array.isArray(data.ownedStoreIds) || !data.ownedStoreIds.every((id) => typeof id === 'string' && id.trim()) ||
      !Number.isSafeInteger(data.version) || Number(data.version) < 1 ||
      !preferences || typeof preferences !== 'object' || Array.isArray(preferences)) {
      throw new BackendApiError(status, 'INVALID_RESPONSE', '서버 사용자 정보 형식이 올바르지 않아요.')
    }
    const saved = preferences as CurrentUser['preferences']
    if (!Array.isArray(saved.categories) || !saved.categories.every((value) => typeof value === 'string') ||
      !Array.isArray(saved.keywords) || !saved.keywords.every((value) => typeof value === 'string') ||
      typeof saved.text !== 'string' || saved.text.length > 2000 ||
      (saved.maxPrice !== null && (!Number.isSafeInteger(saved.maxPrice) || saved.maxPrice < 0 || saved.maxPrice > 10000000))) {
      throw new BackendApiError(status, 'INVALID_RESPONSE', '서버 취향 정보 형식이 올바르지 않아요.')
    }
    const location = data.location as CurrentUser['location']
    if (location !== null && (!location || typeof location !== 'object' || typeof location.latitude !== 'number' || !Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90 || typeof location.longitude !== 'number' || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180)) {
      throw new BackendApiError(status, 'INVALID_RESPONSE', '서버 위치 정보 형식이 올바르지 않아요.')
    }
    return { status: 'authenticated', user: data as unknown as CurrentUser }
  } catch (error) {
    if (error instanceof BackendApiError && error.status === 401) return { status: 'anonymous' }
    throw error
  }
}

export async function logout(): Promise<void> {
  try {
    const csrfToken = await getCsrfToken()
    const { status } = await requestBackendApi('/api/v1/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } })
    if (status !== 204) throw new BackendApiError(status, 'INVALID_RESPONSE', '로그아웃 완료 응답을 받지 못했어요. 다시 시도해 주세요.')
  } catch (error) {
    if (error instanceof BackendApiError && error.status === 401) return
    if (!(error instanceof BackendApiError) || error.status !== 403 || error.code !== 'CSRF_INVALID') throw error
    try {
      await getCsrfToken()
    } catch (refreshError) {
      if (refreshError instanceof BackendApiError && refreshError.status === 401) return
      throw refreshError
    }
    throw new BackendApiError(403, 'CSRF_INVALID', '보안 확인 정보를 갱신했어요. 로그아웃을 다시 시도해 주세요.')
  }
}
