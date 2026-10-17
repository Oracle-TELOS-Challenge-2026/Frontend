// 로그인 쿠키가 사이트 간 쿠키로 차단되지 않도록 현재 사이트의 /api 프록시를 사용한다.
export const BACKEND_API_ORIGIN = ''

export class BackendApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'BackendApiError'
    this.status = status
    this.code = code
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export async function requestBackendApi(path: string, { method = 'GET', body, headers, signal }: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {}): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const timeout = new AbortController()
  const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal
  const timer = setTimeout(() => timeout.abort(), 15000)
  try {
    combined.throwIfAborted()
    const response = await fetch(`${BACKEND_API_ORIGIN}${path}`, {
      method, credentials: 'include', headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: combined,
    })
    if (response.status === 204) {
      combined.throwIfAborted()
      return { status: 204, data: null }
    }
    const responseBody: unknown = await response.json().catch(() => null)
    combined.throwIfAborted()
    if (!response.ok || (isObject(responseBody) && responseBody.resultType === 'FAILURE')) {
      const code = isObject(responseBody) && isObject(responseBody.error) && typeof responseBody.error.code === 'string' ? responseBody.error.code : `HTTP_${response.status}`
      const messages: Record<number, string> = {
        401: '로그인이 필요하거나 세션이 만료됐어요. 다시 로그인해 주세요.',
        403: '서버가 이 요청의 접근을 허용하지 않았어요.',
        404: '요청한 API 또는 매장을 찾을 수 없어요.',
        409: '서버 오류가 발생했어요. 잠시 후 다시 시도해 주세요.',
        429: '요청이 너무 많아요. 잠시 후 다시 조회해 주세요.',
        501: '서버에서 아직 지원하지 않는 기능이에요.',
        503: '서버를 잠시 사용할 수 없어요. 잠시 후 다시 시도해 주세요.',
      }
      const message = isObject(responseBody) && isObject(responseBody.error) && typeof responseBody.error.message === 'string' ? responseBody.error.message : undefined
      if (response.status === 409 && message?.trim()) messages[409] = message
      throw new BackendApiError(response.status, code, messages[response.status] ?? message ?? `요청을 처리하지 못했어요. (HTTP ${response.status})`)
    }
    if (!isObject(responseBody) || responseBody.resultType !== 'SUCCESS' || responseBody.error !== null || !isObject(responseBody.success) || !isObject(responseBody.success.data)) {
      throw new BackendApiError(response.status, 'INVALID_RESPONSE', '서버 응답이 명세의 성공 응답 형식과 달라요.')
    }
    return { status: response.status, data: responseBody.success.data }
  } catch (error) {
    if (signal?.aborted) throw signal.reason
    if (timeout.signal.aborted) throw new BackendApiError(0, 'TIMEOUT', '서버 응답이 15초 안에 도착하지 않았어요. 다시 조회해 주세요.')
    if (error instanceof BackendApiError) throw error
    throw new BackendApiError(0, 'NETWORK_ERROR', '서버에 연결하지 못했어요. 네트워크 또는 서버의 CORS 설정을 확인해 주세요.')
  } finally {
    clearTimeout(timer)
  }
}

export async function mutateBackendApi(path: string, { method = 'POST', body, idempotencyKey, signal }: { method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown; idempotencyKey?: string; signal?: AbortSignal } = {}) {
  const { data } = await requestBackendApi('/api/v1/auth/csrf', { signal })
  if (typeof data?.csrfToken !== 'string' || !data.csrfToken.trim() || /\p{Cc}/u.test(data.csrfToken)) {
    throw new BackendApiError(0, 'INVALID_RESPONSE', '보안 확인 정보를 받지 못했어요. 다시 로그인해 주세요.')
  }
  return requestBackendApi(path, { method, body, signal, headers: {
    'X-CSRF-Token': data.csrfToken,
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
  } })
}

export function apiId(id: string): string {
  if (!id.trim() || id.length > 64 || id === '.' || id === '..' || /\p{Cc}/u.test(id)) throw new BackendApiError(0, 'INVALID_REQUEST', '올바르지 않은 항목 ID예요.')
  try { return encodeURIComponent(id) }
  catch { throw new BackendApiError(0, 'INVALID_REQUEST', '올바르지 않은 항목 ID예요.') }
}
