import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../Modal'
import { validateChatBooking } from '../../lib/chat-booking'
import { readStoreServices } from '../../lib/customer-api'
import { dateLabel, money, timeLabel, todayInSeoul } from '../../lib/format'
import type { RegisteredShop, StoreService } from '../../types'
import type { ChatBookingInput } from '../../lib/chat-booking'

export function BookingProposalDialog({ source, initial, shop, onSend, onClose }: {
  source: { id: string; content: string }
  initial: { date: string | null; time: string | null; serviceDescription: string | null }
  shop?: RegisteredShop | null
  onSend: (serviceId: string, input: ChatBookingInput, key: string) => Promise<void>
  onClose: () => void
}) {
  const [service, setService] = useState(initial.serviceDescription ?? '')
  const [serviceId, setServiceId] = useState('')
  const [date, setDate] = useState(initial.date ?? '')
  const [time, setTime] = useState(initial.time ?? '')
  const [duration, setDuration] = useState('')
  const [price, setPrice] = useState('')
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; services?: StoreService[]; error?: string } | null>(null)
  const [preview, setPreview] = useState<ChatBookingInput | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const pending = useRef(false)
  const request = useRef<{ input: string; key: string } | null>(null)
  const storeId = shop?.id
  const catalogKey = `${storeId}:${revision}`
  const catalog = result?.key === catalogKey ? result : null
  const services = catalog?.services?.filter((item) => item.active) ?? []
  const selectedService = services.find((item) => item.id === serviceId)

  useEffect(() => {
    if (!storeId) return
    const controller = new AbortController()
    void readStoreServices(storeId, controller.signal).then((services) => {
      if (!controller.signal.aborted) setResult({ key: catalogKey, services })
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setResult({ key: catalogKey, error: cause instanceof Error ? cause.message : '등록된 시술을 불러오지 못했어요.' })
    })
    return () => controller.abort()
  }, [storeId, catalogKey])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    if (!selectedService) { setError('현재 제공 중인 시술을 선택해 주세요.'); return }
    const input = { service: service.trim(), startsAt: `${date}T${time}:00+09:00`, duration: Number(duration), price: Number(price) }
    const problem = validateChatBooking(input)
    if (problem) { setError(problem); return }
    setPreview(input)
  }

  async function send() {
    if (!preview || !selectedService || pending.current) return
    pending.current = true
    setSending(true)
    setError('')
    const input = JSON.stringify({ serviceId, ...preview })
    if (request.current?.input !== input) request.current = { input, key: crypto.randomUUID() }
    try {
      await onSend(serviceId, preview, request.current.key)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '예약 제안을 보내지 못했어요.')
    } finally { pending.current = false; setSending(false) }
  }

  return <Modal className="owner-dialog" title="예약 제안 검토" onClose={() => { if (!sending) onClose() }}>
    <p className="muted">고객의 요청과 영업시간을 확인하고 제안 내용을 작성해 주세요.</p>
    <blockquote className="chat-request-quote">{source.content}</blockquote>
    {storeId && !catalog && <p role="status">등록된 시술을 불러오는 중이에요.</p>}
    {catalog?.error && <div role="alert"><p className="form-error">{catalog.error}</p><button type="button" className="button secondary small" onClick={() => setRevision((value) => value + 1)}>시술 다시 조회</button></div>}
    {catalog?.services && !services.length && <p className="form-error" role="alert">현재 제공 중인 시술이 없어요. 매장 관리에서 시술을 확인해 주세요.</p>}
    <form className="account-form" onSubmit={submit} onChange={() => { setError(''); setPreview(null) }}>
      <fieldset disabled={sending} className="chat-proposal-fields">
      <div className="account-field"><label htmlFor="proposal-service-id">등록된 시술</label><select id="proposal-service-id" value={serviceId} disabled={!services.length} onChange={(event) => {
        const selected = services.find((item) => item.id === event.target.value)
        setServiceId(selected?.id ?? '')
        setDuration(selected ? String(selected.durationMinutes) : '')
        setPrice(selected ? String(selected.basePrice) : '')
      }} required><option value="">시술을 선택해 주세요</option>{services.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes}분 · {money(item.basePrice)}</option>)}</select></div>
      <div className="account-field"><label htmlFor="proposal-service">시술·추가 옵션</label><input id="proposal-service" value={service} onChange={(event) => setService(event.target.value)} required maxLength={1000} /><small>고객 요청을 정리한 초안이에요. 원문과 선택한 시술·추가 옵션을 확인해 주세요.</small></div>
      <div className="chat-review-row">
        <div className="account-field"><label htmlFor="proposal-date">예약 날짜 (한국 시간)</label><input id="proposal-date" type="date" min={todayInSeoul()} value={date} onChange={(event) => setDate(event.target.value)} required /></div>
        <div className="account-field"><label htmlFor="proposal-time">시작 시간</label><input id="proposal-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></div>
      </div>
      <div className="chat-review-row">
        <div className="account-field"><label htmlFor="proposal-duration">소요 시간 · 분</label><input id="proposal-duration" type="number" inputMode="numeric" min={15} max={480} step={5} value={duration} onChange={(event) => setDuration(event.target.value)} required /></div>
        <div className="account-field"><label htmlFor="proposal-price">예약 금액 · 원</label><input id="proposal-price" type="number" inputMode="numeric" min={0} max={10000000} step={1} value={price} onChange={(event) => setPrice(event.target.value)} required /></div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="button secondary" disabled={!selectedService}>제안 미리보기</button>
      </fieldset>
    </form>
    <div aria-live="polite">{preview && <section className="chat-booking-card" aria-label="예약 제안 미리보기">
      <span className="badge">미리보기 · 전송 전</span><h3>{preview.service}</h3>
      <dl><dt>날짜</dt><dd>{dateLabel(preview.startsAt)}</dd><dt>시간</dt><dd>{timeLabel(preview.startsAt)} – {timeLabel(new Date(Date.parse(preview.startsAt) + preview.duration * 60000).toISOString())}</dd><dt>소요 시간</dt><dd>{preview.duration}분</dd><dt>예약 금액</dt><dd>{money(preview.price)}</dd></dl>
      <small>고객이 최종 확인하기 전에는 시간이 확보되지 않아요.</small>
    </section>}</div>
    <p className="owner-dialog-note">{storeId ? '고객이 내용을 확인하면 예약이 확정돼요. 새 제안을 보내면 이전 미확정 제안은 사용할 수 없어요.' : '등록된 매장 정보를 불러온 뒤 제안을 보낼 수 있어요.'}</p>
    <div className="customer-dialog-actions"><button type="button" className="button secondary" disabled={sending} onClick={onClose}>닫기</button><button type="button" className="button" disabled={!preview || !selectedService || sending} onClick={() => void send()}>{sending ? '전송 중…' : '예약 제안 보내기'}</button></div>
  </Modal>
}
