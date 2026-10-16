import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BACKEND_API_ORIGIN, BackendApiError, publicApiPath, readPublicApi } from '../lib/backend-api'
import type { PublicApiRequest } from '../lib/backend-api'

interface CheckResult {
  label: string
  path: string
  status: 'success' | 'error'
  data?: unknown
  error?: string
}

export function BackendConnectionPage({ returnTo }: { returnTo: string }) {
  const [keyword, setKeyword] = useState('')
  const [storeId, setStoreId] = useState('')
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()))
  const [results, setResults] = useState<CheckResult[]>([])
  const [loading, setLoading] = useState(false)
  const currentRequest = useRef<AbortController | null>(null)

  useEffect(() => () => currentRequest.current?.abort(), [])

  async function checkConnection() {
    currentRequest.current?.abort()
    const controller = new AbortController()
    currentRequest.current = controller
    const requests: { label: string; request: PublicApiRequest }[] = [
      { label: 'ST-01 · 시술 카테고리', request: { operation: 'categories' } },
      { label: 'S-01 · 주변 가게 검색', request: { operation: 'search', keyword } },
    ]
    if (storeId.trim()) requests.push(
      { label: 'ST-02 · 가게 상세', request: { operation: 'store', storeId } },
      { label: 'ST-03 · 시술 목록', request: { operation: 'services', storeId } },
      { label: 'ST-04 · 예약 가능 시간', request: { operation: 'slots', storeId, date } },
    )
    setLoading(true)
    setResults([])
    const next = await Promise.all(requests.map(async ({ label, request }): Promise<CheckResult> => {
      let path = ''
      try {
        path = publicApiPath(request)
        const data = await readPublicApi(request, controller.signal)
        return { label, path, status: 'success', data }
      } catch (error) {
        const message = error instanceof Error ? error.message : '서버 응답을 확인하지 못했어요.'
        return { label, path, status: 'error', error: error instanceof BackendApiError ? `${error.status ? `HTTP ${error.status} · ` : ''}${error.code} — ${message}` : message }
      }
    }))
    if (controller.signal.aborted || currentRequest.current !== controller) return
    setResults(next)
    setLoading(false)
  }

  return <div className="page account-page backend-connection">
    <header className="account-heading">
      <Link className="account-text-button" to={returnTo}>시연 화면으로 돌아가기</Link>
      <h1 className="page-heading">서버 연결 확인</h1>
      <p className="muted">공개 조회 API의 실제 응답을 확인합니다. 예약·등록·채팅 등 기존 화면은 계속 시연 데이터로 동작합니다.</p>
    </header>
    <div className="account-notice"><div><strong>현재 백엔드는 명세 초안입니다</strong><p>501 NOT_IMPLEMENTED는 서버에 연결됐지만 해당 기능이 아직 구현되지 않았다는 뜻입니다. 조회 결과를 시연 데이터로 대체하거나 저장 완료로 표시하지 않습니다.</p></div></div>
    <p className="backend-origin"><a href={`${BACKEND_API_ORIGIN}/swagger-ui/index.html`} target="_blank" rel="noreferrer">Swagger 명세 열기</a><br /><code>{BACKEND_API_ORIGIN}</code></p>
    <form className="account-form" onSubmit={(event) => { event.preventDefault(); void checkConnection() }}>
      <div className="account-field"><label htmlFor="backend-keyword">가게·시술 검색어 <span>선택</span></label><input id="backend-keyword" value={keyword} maxLength={100} onChange={(event) => setKeyword(event.target.value)} /><small>동작캠퍼스 기준 반경 5km, 첫 10개 결과를 조회합니다.</small></div>
      <div className="account-field"><label htmlFor="backend-store">서버 매장 ID <span>선택</span></label><input id="backend-store" value={storeId} maxLength={64} onChange={(event) => setStoreId(event.target.value)} /><small>검색 응답의 store.id를 입력하면 상세·시술·예약 가능 시간도 조회합니다. 시연 가게 ID는 사용하지 않습니다.</small></div>
      <div className="account-field"><label htmlFor="backend-date">예약 가능 시간 조회일</label><input id="backend-date" type="date" value={date} required={Boolean(storeId.trim())} onChange={(event) => setDate(event.target.value)} /><small>Asia/Seoul 기준 날짜입니다. 시술·시간 목록은 첫 10개까지만 확인합니다.</small></div>
      <button className="button" type="submit" disabled={loading}>{loading ? '서버 응답 확인 중…' : '공개 API 조회'}</button>
    </form>
    <p role="status" className="muted">{loading ? '조회 중입니다. 요청당 최대 15초까지 기다립니다.' : results.length ? `${results.length}개 확인 · 성공 ${results.filter((result) => result.status === 'success').length}개 · 오류 ${results.filter((result) => result.status === 'error').length}개` : '조회 버튼을 누르면 실제 서버에 요청합니다.'}</p>
    {results.map((result) => <section className="account-card" key={result.label}>
      <h2>{result.label}</h2>
      {result.path && <code className="backend-path">GET {result.path}</code>}
      {result.status === 'error' ? <p className="account-error">{result.error}</p> : <details open><summary>조회 성공 · 응답 데이터</summary><pre>{JSON.stringify(result.data, null, 2)}</pre></details>}
    </section>)}
  </div>
}
