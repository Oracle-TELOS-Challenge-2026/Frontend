import { BACKEND_API_ORIGIN, BackendApiError, requestBackendApi } from './backend-api.ts'

export interface CurrentUser {
  id: string
  displayName: string
  roles: string[]
}

export type SessionResult =
  | { status: 'authenticated'; user: CurrentUser }
  | { status: 'anonymous' }
  | { status: 'profile-unavailable' }

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
    if (status !== 200 || typeof data?.id !== 'string' || !data.id.trim() ||
      typeof data.displayName !== 'string' || !data.displayName.trim() ||
      !Array.isArray(data.roles) || !data.roles.every((role) => typeof role === 'string' && role.trim())) {
      throw new BackendApiError(status, 'INVALID_RESPONSE', '서버 사용자 정보 형식이 올바르지 않아요. 사용자 API 응답을 확인해 주세요.')
    }
    return { status: 'authenticated', user: { id: data.id, displayName: data.displayName, roles: data.roles } }
  } catch (error) {
    if (error instanceof BackendApiError && error.status === 401) return { status: 'anonymous' }
    if (!(error instanceof BackendApiError) || error.status !== 501) throw error
  }

  try {
    await getCsrfToken(signal)
    return { status: 'profile-unavailable' }
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
