import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { todayInSeoul, timeLabel, validWaitPreference } from '../../model'
import type { Shop, WaitlistConditions, WaitlistItem } from '../../model'
import { saveWaitlist } from '../../lib/customer-api'
import { Modal } from '../Modal'

const inputDate = (value: string) => `${todayInSeoul(new Date(value))}T${timeLabel(value)}`

export function WaitlistDialog({ shop, item, date = todayInSeoul(), onSaved, onClose }: { shop?: Shop; item?: WaitlistItem; date?: string; onSaved?: () => void; onClose: () => void }) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const request = useRef({ body: '', key: crypto.randomUUID() })

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current || (!shop && !item)) return
    const data = new FormData(event.currentTarget)
    const start = String(data.get('start')), end = String(data.get('end'))
    if (!validWaitPreference(start.slice(0, 10), start.slice(11)) || !validWaitPreference(end.slice(0, 10), end.slice(11)) || start >= end || data.get('consent') !== 'on') {
      setError('미래의 방문 가능 구간과 빈자리 알림 동의를 확인해 주세요.')
      return
    }
    const conditions: WaitlistConditions = {
      ...(item?.conditions ?? { storeId: shop!.id, category: shop!.categoryCode, serviceId: null, location: null, radiusMeters: null, maxPrice: null, keywords: [] }),
      windowStart: `${start}:00+09:00`, windowEnd: `${end}:00+09:00`,
      ...(shop ? { serviceId: String(data.get('service')) || null } : {}),
    }
    const body = JSON.stringify(conditions)
    if (request.current.body !== body) request.current = { body, key: crypto.randomUUID() }
    busy.current = true
    setPending(true)
    setError('')
    try {
      await saveWaitlist(conditions, request.current.key, item)
      onSaved?.()
      onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '알림 신청을 저장하지 못했어요.') }
    finally { busy.current = false; setPending(false) }
  }

  return <Modal title={item ? '대기 시간 바꾸기' : '빈자리 알림 신청'} onClose={() => { if (!busy.current) onClose() }} className="customer-dialog">
    <form onSubmit={(event) => void submit(event)}>
      <p>{shop?.name ?? item?.store?.name ?? '선택한 조건'}에 맞는 빈자리가 생기면 알려드려요.<br />시술을 마칠 수 있는 시간까지 선택해 주세요.</p>
      {shop && <label>원하는 시술<select name="service" disabled={pending} defaultValue=""><option value="">시술 전체</option>{shop.services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.durationMinutes}분</option>)}</select></label>}
      <label>방문 가능 시작<input name="start" type="datetime-local" min={`${todayInSeoul()}T00:00`} defaultValue={item ? inputDate(item.conditions.windowStart) : `${date}T17:00`} disabled={pending} required /></label>
      <label>시술을 마칠 시간<input name="end" type="datetime-local" min={`${todayInSeoul()}T00:00`} defaultValue={item ? inputDate(item.conditions.windowEnd) : `${date}T20:00`} disabled={pending} required /></label>
      <label className="wait-consent"><input name="consent" type="checkbox" disabled={pending} required />빈자리 알림 수신에 동의해요.</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="customer-dialog-actions"><button type="button" className="button secondary" disabled={pending} onClick={onClose}>닫기</button><button className="button" type="submit" disabled={pending}>{pending ? '저장 중…' : item ? '변경하기' : '알림 신청하기'}</button></div>
    </form>
  </Modal>
}
