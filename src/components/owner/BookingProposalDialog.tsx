import { useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../Modal'
import { DEMO_DAY } from '../../data/demo'
import { validateChatBooking } from '../../lib/chat-booking'
import type { ChatBookingInput, DemoProps, Message } from '../../types'

export function BookingProposalDialog({ conversationId, source, initial, onPropose, onClose }: {
  conversationId: string
  source: Message
  initial: ChatBookingInput
  onPropose: DemoProps['onProposeBooking']
  onClose: () => void
}) {
  const [service, setService] = useState(initial.service)
  const [date, setDate] = useState(initial.startsAt.split('T')[0])
  const [time, setTime] = useState(initial.startsAt.split('T')[1]?.slice(0, 5) ?? '')
  const [duration, setDuration] = useState(String(initial.duration))
  const [price, setPrice] = useState(String(initial.price))
  const [error, setError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = { service, startsAt: `${date}T${time}:00+09:00`, duration: Number(duration), price: Number(price) }
    const problem = validateChatBooking(input)
    if (problem) { setError(problem); return }
    if (onPropose(conversationId, source.id, input)) onClose()
    else setError('이미 예약된 시간이나 변경된 요청이에요. 대화와 캘린더를 확인해 주세요.')
  }

  return <Modal className="owner-dialog" title="예약 제안 검토" onClose={onClose}>
    <p className="muted">고객의 요청과 영업시간을 확인하고 제안해 주세요.</p>
    <blockquote className="chat-request-quote">{source.body}</blockquote>
    <form className="account-form" onSubmit={submit} onChange={() => setError('')}>
      <div className="account-field"><label htmlFor="proposal-service">시술·추가 옵션</label><input id="proposal-service" value={service} onChange={(event) => setService(event.target.value)} required maxLength={160} /><small>대표 시술을 기본으로 넣었어요. 고객이 요청한 옵션을 함께 확인해 주세요.</small></div>
      <div className="chat-review-row">
        <div className="account-field"><label htmlFor="proposal-date">예약 날짜</label><input id="proposal-date" type="date" min={DEMO_DAY} value={date} onChange={(event) => setDate(event.target.value)} required /></div>
        <div className="account-field"><label htmlFor="proposal-time">시작 시간</label><input id="proposal-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></div>
      </div>
      <div className="chat-review-row">
        <div className="account-field"><label htmlFor="proposal-duration">소요 시간 · 분</label><input id="proposal-duration" type="number" inputMode="numeric" min={10} max={480} step={1} value={duration} onChange={(event) => setDuration(event.target.value)} required /></div>
        <div className="account-field"><label htmlFor="proposal-price">예약 금액 · 원</label><input id="proposal-price" type="number" inputMode="numeric" min={1} max={10000000} step={1} value={price} onChange={(event) => setPrice(event.target.value)} required /></div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="customer-dialog-actions"><button type="button" className="button secondary" onClick={onClose}>돌아가기</button><button type="submit" className="button">예약 제안 보내기</button></div>
      <p className="owner-dialog-note">고객이 최종 확인해야 캘린더에 예약이 등록돼요.<br />제안을 보내는 동안에는 시간이 확보되지 않아요.</p>
    </form>
  </Modal>
}
