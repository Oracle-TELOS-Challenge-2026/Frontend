import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dateLabel, timeLabel } from '../../model'
import type { Slot } from '../../model'
import { prepareReservation, reserveSlot } from '../../lib/customer-api'
import { Modal } from '../Modal'
import { Price } from './Price'

export function ReservationDialog({ shop, slot, waitlistId, onClose }: { shop: { id: string; name: string }; slot: Slot; waitlistId?: string; onClose: () => void }) {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const prepared = useRef<Awaited<ReturnType<typeof prepareReservation>> | null>(null)
  const [requestId] = useState(() => crypto.randomUUID())

  async function confirm() {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    try {
      prepared.current ??= await prepareReservation(shop.id, slot, waitlistId)
      await reserveSlot(prepared.current, requestId)
      navigate('/customer/reservations')
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '예약하지 못했어요. 예약내역을 확인한 뒤 다시 시도해 주세요.')
    } finally { busy.current = false; setPending(false) }
  }

  return <Modal title="예약 확인" onClose={() => { if (!busy.current) onClose() }} className="customer-dialog">
    <p className="muted">예약 내용을 확인한 뒤 확정해 주세요.</p>
    <dl className="reservation-summary">
      <dt>가게</dt><dd>{shop.name}</dd>
      <dt>시술</dt><dd>{slot.service}</dd>
      <dt>날짜</dt><dd>{dateLabel(slot.startsAt)}</dd>
      <dt>시간</dt><dd>{timeLabel(slot.startsAt)}</dd>
      <dt>예약 금액</dt><dd><Price price={slot.price} originalPrice={slot.originalPrice} /></dd>
    </dl>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="customer-dialog-actions">
      <button type="button" className="button secondary" disabled={pending} onClick={onClose}>돌아가기</button>
      <button type="button" className="button" disabled={pending} onClick={() => void confirm()}>{pending ? '예약 확인 중…' : '예약 확정하기'}</button>
    </div>
  </Modal>
}
