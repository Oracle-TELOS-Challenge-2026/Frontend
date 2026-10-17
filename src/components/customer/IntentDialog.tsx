import { useRef, useState } from 'react'
import { Modal } from '../Modal'
import { analyzeIntent, validateWaitlistConditions } from '../../lib/intent'
import { saveWaitlist } from '../../lib/customer-api'
import { CATEGORY_LABELS } from '../../data/categories'
import { timeLabel, todayInSeoul } from '../../lib/format'
import type { CategoryCode, WaitlistConditions } from '../../types'

const dateInput = (value: string | null) => value ? `${todayInSeoul(new Date(value))}T${timeLabel(value)}` : ''

export function IntentDialog({ savedLocation, onClose, onSaved }: { savedLocation: WaitlistConditions['location']; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState('')
  const [category, setCategory] = useState<CategoryCode | ''>('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [location, setLocation] = useState(savedLocation)
  const [locationLabel, setLocationLabel] = useState(savedLocation ? '최근 저장한 위치' : '')
  const [radius, setRadius] = useState('3000')
  const [price, setPrice] = useState('')
  const [keywords, setKeywords] = useState('')
  const [consent, setConsent] = useState(false)
  const [analyzed, setAnalyzed] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const request = useRef({ body: '', key: '' })

  async function act(action: () => Promise<void>) {
    if (busy.current) return
    busy.current = true; setPending(true); setError('')
    try { await action() } catch (cause) { setError(cause instanceof Error ? cause.message : '처리하지 못했어요. 다시 시도해 주세요.') }
    finally { busy.current = false; setPending(false) }
  }

  async function analyze() {
    const result = await analyzeIntent(text, location)
    const c = result.conditions
    setAnalyzed(true); setConsent(false)
    setCategory(c.category ?? ''); setStart(dateInput(c.windowStart)); setEnd(dateInput(c.windowEnd))
    setRadius(c.radiusMeters === null ? '' : String(c.radiusMeters)); setPrice(c.maxPrice === null ? '' : String(c.maxPrice)); setKeywords((c.keywords ?? []).join(', '))
    setNotice(result.resolution === 'UNSUPPORTED' ? '이 요청은 자동 분석이 어려워요. 아래 조건을 직접 입력해 주세요.' : result.clarificationQuestion ?? '아래 조건이 맞는지 확인하고 알림을 신청해 주세요.')
  }

  async function locate() {
    if (!navigator.geolocation) throw new Error('현재 위치를 지원하는 브라우저에서 이용해 주세요.')
    const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('위치를 확인하지 못했어요. 브라우저의 위치 권한을 확인해 주세요.')), { maximumAge: 0, timeout: 15000 }))
    setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }); setLocationLabel('현재 기기 위치'); setConsent(false)
  }

  async function save() {
    if (!category) throw new Error('시술 분류를 선택해 주세요.')
    const conditions: WaitlistConditions = { storeId: null, serviceId: null, category, windowStart: `${start}:00+09:00`, windowEnd: `${end}:00+09:00`, location: location ? { latitude: location.latitude, longitude: location.longitude } : null, radiusMeters: radius.trim() ? Number(radius) : null, maxPrice: price.trim() ? Number(price) : null, keywords: keywords.split(',').map((word) => word.trim()).filter(Boolean) }
    const problem = validateWaitlistConditions(conditions)
    if (problem) throw new Error(problem)
    if (!consent) throw new Error('조건을 확인한 뒤 빈자리 알림 수신에 동의해 주세요.')
    const source = analyzed ? 'NATURAL_LANGUAGE' : 'MANUAL'
    const body = JSON.stringify({ conditions, source })
    if (request.current.body !== body) request.current = { body, key: crypto.randomUUID() }
    await saveWaitlist(conditions, request.current.key, undefined, source)
    onSaved(); onClose()
  }

  return <Modal title="원하는 시간에 빈자리 찾기" onClose={() => { if (!busy.current) onClose() }} className="customer-dialog intent-dialog">
    <form onSubmit={(event) => { event.preventDefault(); void act(save) }}>
      <p>문장으로 조건을 정리하거나 직접 입력할 수 있어요. 확인하고 동의한 조건으로만 대기를 등록해요.</p>
      <label>원하는 조건<textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} placeholder="내일 오후 3~6시, 주변 3km에서 6만 원 이하 네일" disabled={pending} /></label>
      <button type="button" className="button secondary" disabled={pending || !text.trim()} onClick={() => void act(analyze)}>조건 분석하기</button>
      {notice && <p role="status">{notice}</p>}
      <label>시술 분류<select value={category} onChange={(event) => { setCategory(event.target.value as CategoryCode); setConsent(false) }} required disabled={pending}><option value="">선택해 주세요</option>{Object.entries(CATEGORY_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
      <p className="muted">선택한 분류의 전체 시술을 찾아요. 특정 시술은 가게 상세에서 알림을 신청해 주세요.</p>
      <label>방문 가능 시작<input type="datetime-local" value={start} onChange={(event) => { setStart(event.target.value); setConsent(false) }} required disabled={pending} /></label>
      <label>시술을 마칠 시간<input type="datetime-local" value={end} onChange={(event) => { setEnd(event.target.value); setConsent(false) }} required disabled={pending} /></label>
      <p>{locationLabel || '검색할 위치를 선택해 주세요.'}</p><button type="button" className="button secondary" disabled={pending} onClick={() => void act(locate)}>현재 위치 사용</button>
      <p className="muted">주변 가게 대기는 화면을 이용하는 동안 최근 저장한 위치를 기준으로 갱신해요. 선택한 반경과 시간·가격은 유지돼요.</p>
      <label>이동 반경(m)<input type="number" min="100" max="10000" step="100" value={radius} onChange={(event) => { setRadius(event.target.value); setConsent(false) }} required disabled={pending} /></label>
      <label>최대 금액(원)<input type="number" min="0" max="10000000" step="1" value={price} onChange={(event) => { setPrice(event.target.value); setConsent(false) }} placeholder="제한 없음" disabled={pending} /></label>
      <label>요청 사항<input value={keywords} onChange={(event) => { setKeywords(event.target.value); setConsent(false) }} placeholder="쉼표로 구분해 주세요" disabled={pending} /></label>
      <label className="wait-consent"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required disabled={pending} />위 조건을 확인했고 빈자리 알림 수신에 동의해요.</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="customer-dialog-actions"><button type="button" className="button secondary" disabled={pending} onClick={onClose}>닫기</button><button type="submit" className="button" disabled={pending}>{pending ? '처리 중…' : '이 조건으로 대기 신청'}</button></div>
    </form>
  </Modal>
}
