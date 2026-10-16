export const BACKEND_API_ORIGIN = 'https://140.238.19.165'

export interface PublicApiRequest {
  operation: 'categories' | 'search' | 'store' | 'services' | 'slots'
  storeId?: string
  keyword?: string
  date?: string
}

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

export function publicApiPath(request: PublicApiRequest): string {
  if (request.operation === 'categories') return '/api/v1/stores/categories'
  if (request.operation === 'search') {
    const query = new URLSearchParams({ latitude: '37.51243', longitude: '126.92727', radiusMeters: '5000', limit: '10' })
    if (request.keyword?.trim()) query.set('keyword', request.keyword.trim())
    return `/api/v1/search/stores?${query}`
  }
  if (!['store', 'services', 'slots'].includes(request.operation)) throw new BackendApiError(0, 'INVALID_REQUEST', '지원하지 않는 조회 요청이에요.')
  const id = request.storeId
  if (!id?.trim() || id.length > 64 || id === '.' || id === '..' || /\p{Cc}/u.test(id)) {
    throw new BackendApiError(0, 'INVALID_REQUEST', '서버에서 받은 매장 ID를 1~64자로 입력해 주세요.')
  }
  let encodedId: string
  try { encodedId = encodeURIComponent(id) }
  catch { throw new BackendApiError(0, 'INVALID_REQUEST', '매장 ID에 올바르지 않은 문자가 있어요.') }
  const path = `/api/v1/stores/${encodedId}`
  if (request.operation === 'store') return path
  if (request.operation === 'services') return `${path}/services?limit=10`
  const date = request.date ?? ''
  const timestamp = Date.parse(`${date}T00:00:00.000Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
    throw new BackendApiError(0, 'INVALID_REQUEST', '예약 가능 시간을 조회할 날짜를 올바르게 입력해 주세요.')
  }
  return `${path}/slots?${new URLSearchParams({ from: date, to: date, limit: '10' })}`
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export async function requestBackendApi(path: string, { method = 'GET', headers, signal }: { method?: 'GET' | 'POST'; headers?: Record<string, string>; signal?: AbortSignal } = {}): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const timeout = new AbortController()
  const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal
  const timer = setTimeout(() => timeout.abort(), 15000)
  try {
    combined.throwIfAborted()
    const response = await fetch(`${BACKEND_API_ORIGIN}${path}`, {
      method, credentials: 'include', headers: { Accept: 'application/json', ...headers }, cache: 'no-store', signal: combined,
    })
    if (response.status === 204) {
      combined.throwIfAborted()
      return { status: 204, data: null }
    }
    const body: unknown = await response.json().catch(() => null)
    combined.throwIfAborted()
    if (!response.ok || (isObject(body) && body.resultType === 'FAILURE')) {
      const code = isObject(body) && isObject(body.error) && typeof body.error.code === 'string' ? body.error.code : `HTTP_${response.status}`
      const messages: Record<number, string> = {
        401: '로그인이 필요하거나 세션이 만료됐어요. 다시 로그인해 주세요.',
        403: '서버가 이 요청의 접근을 허용하지 않았어요.',
        404: '요청한 API 또는 매장을 찾을 수 없어요.',
        409: '서버 데이터가 변경되었어요. 다시 조회해 주세요.',
        429: '요청이 너무 많아요. 잠시 후 다시 조회해 주세요.',
        501: '서버에 연결됐지만 아직 명세만 정의되어 있어요. 백엔드 구현 후 데이터를 조회할 수 있어요.',
        503: '로그인 서버를 사용할 수 없어요. 백엔드 카카오 설정을 확인해 주세요.',
      }
      throw new BackendApiError(response.status, code, messages[response.status] ?? `서버가 실패 응답을 반환했어요. (HTTP ${response.status})`)
    }
    if (!isObject(body) || body.resultType !== 'SUCCESS' || body.error !== null || !isObject(body.success) || !isObject(body.success.data)) {
      throw new BackendApiError(response.status, 'INVALID_RESPONSE', '서버 응답이 명세의 성공 응답 형식과 달라요.')
    }
    return { status: response.status, data: body.success.data }
  } catch (error) {
    if (signal?.aborted) throw signal.reason
    if (timeout.signal.aborted) throw new BackendApiError(0, 'TIMEOUT', '서버 응답이 15초 안에 도착하지 않았어요. 다시 조회해 주세요.')
    if (error instanceof BackendApiError) throw error
    throw new BackendApiError(0, 'NETWORK_ERROR', '서버에 연결하지 못했어요. 네트워크 또는 서버의 CORS 설정을 확인해 주세요.')
  } finally {
    clearTimeout(timer)
  }
}

export async function readPublicApi(request: PublicApiRequest, signal?: AbortSignal): Promise<unknown> {
  const response = await requestBackendApi(publicApiPath(request), { signal })
  if (response.data === null) throw new BackendApiError(response.status, 'INVALID_RESPONSE', '서버 응답에 조회 데이터가 없어요.')
  return response.data
}
