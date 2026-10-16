import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../Modal'
import { validateChatBooking } from '../../lib/chat-booking'
import { dateLabel, money, timeLabel, todayInSeoul } from '../../lib/format'
import type { ChatMessage } from '../../lib/chat'
import type { RegisteredShop } from '../../types'
import type { ChatBookingInput } from '../../lib/chat-booking'

export function BookingProposalDialog({ source, initial, shop, onSend, onClose }: {
  source: ChatMessage
  initial: { date: string; time: string }
  shop?: RegisteredShop | null
  onSend: (serviceId: string, input: ChatBookingInput, key: string) => Promise<void>
  onClose: () => void
}) {
  const [service, setService] = useState(shop?.service ?? '')
  const [date, setDate] = useState(initial.date)
  const [time, setTime] = useState(initial.time)
  const [duration, setDuration] = useState(shop ? String(shop.duration) : '')
  const [price, setPrice] = useState(shop ? String(shop.originalPrice) : '')
  const [preview, setPreview] = useState<ChatBookingInput | null>(null)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const pending = useRef(false)
  const request = useRef<{ input: string; key: string } | null>(null)

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = { service: service.trim(), startsAt: `${date}T${time}:00+09:00`, duration: Number(duration), price: Number(price) }
    const problem = validateChatBooking(input)
    if (problem) { setError(problem); return }
    setPreview(input)
  }

  async function send() {
    if (!preview || !shop?.serviceId || pending.current) return
    pending.current = true
    setSending(true)
    setError('')
    const input = JSON.stringify(preview)
    if (request.current?.input !== input) request.current = { input, key: crypto.randomUUID() }
    try {
      await onSend(shop.serviceId, preview, request.current.key)
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '예약 제안을 보내지 못했어요.')
    } finally { pending.current = false; setSending(false) }
  }

  return <Modal className="owner-dialog" title="예약 제안 검토" onClose={() => { if (!sending) onClose() }}>
    <p className="muted">고객의 요청과 영업시간을 확인하고 제안 내용을 작성해 주세요.</p>
    <blockquote className="chat-request-quote">{source.content}</blockquote>
    <form className="account-form" onSubmit={submit} onChange={() => { setError(''); setPreview(null) }}>
      <fieldset disabled={sending} className="chat-proposal-fields">
      <div className="account-field"><label htmlFor="proposal-service">시술·추가 옵션</label><input id="proposal-service" value={service} onChange={(event) => setService(event.target.value)} required maxLength={1000} />{shop && <small>등록된 시술을 기본으로 넣었어요. 고객이 요청한 옵션을 확인해 주세요.</small>}</div>
      <div className="chat-review-row">
        <div className="account-field"><label htmlFor="proposal-date">예약 날짜 (한국 시간)</label><input id="proposal-date" type="date" min={todayInSeoul()} value={date} onChange={(event) => setDate(event.target.value)} required /></div>
        <div className="account-field"><label htmlFor="proposal-time">시작 시간</label><input id="proposal-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></div>
      </div>
      <div className="chat-review-row">
        <div className="account-field"><label htmlFor="proposal-duration">소요 시간 · 분</label><input id="proposal-duration" type="number" inputMode="numeric" min={15} max={480} step={5} value={duration} onChange={(event) => setDuration(event.target.value)} required /></div>
        <div className="account-field"><label htmlFor="proposal-price">예약 금액 · 원</label><input id="proposal-price" type="number" inputMode="numeric" min={0} max={10000000} step={1} value={price} onChange={(event) => setPrice(event.target.value)} required /></div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="button secondary">제안 미리보기</button>
      </fieldset>
    </form>
    <div aria-live="polite">{preview && <section className="chat-booking-card" aria-label="예약 제안 미리보기">
      <span className="badge">미리보기 · 전송 전</span><h3>{preview.service}</h3>
      <dl><dt>날짜</dt><dd>{dateLabel(preview.startsAt)}</dd><dt>시간</dt><dd>{timeLabel(preview.startsAt)} – {timeLabel(new Date(Date.parse(preview.startsAt) + preview.duration * 60000).toISOString())}</dd><dt>소요 시간</dt><dd>{preview.duration}분</dd><dt>예약 금액</dt><dd>{money(preview.price)}</dd></dl>
      <small>고객이 최종 확인하기 전에는 시간이 확보되지 않아요.</small>
    </section>}</div>
    <p className="owner-dialog-note">{shop?.serviceId ? '고객이 내용을 확인하면 예약이 확정돼요. 새 제안을 보내면 이전 미확정 제안은 사용할 수 없어요.' : '등록된 시술 정보를 불러온 뒤 제안을 보낼 수 있어요.'}</p>
    <div className="customer-dialog-actions"><button type="button" className="button secondary" disabled={sending} onClick={onClose}>닫기</button><button type="button" className="button" disabled={!preview || !shop?.serviceId || sending} onClick={() => void send()}>{sending ? '전송 중…' : '예약 제안 보내기'}</button></div>
  </Modal>
}
