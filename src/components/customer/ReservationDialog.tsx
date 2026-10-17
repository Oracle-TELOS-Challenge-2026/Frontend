import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dateLabel, timeLabel } from '../../model'
import type { Slot } from '../../model'
import { prepareReservation, reserveSlot } from '../../lib/customer-api'
import { BackendApiError } from '../../lib/backend-api'
import { Modal } from '../Modal'
import { Price } from './Price'

export function ReservationDialog({ shop, slot, waitlistId, onClose, onChanged }: { shop: { id: string; name: string }; slot: Slot; waitlistId?: string; onClose: () => void; onChanged?: () => void }) {
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<Awaited<ReturnType<typeof reserveSlot>> | null>(null)
  const [conflict, setConflict] = useState(false)
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
      setResult(await reserveSlot(prepared.current, requestId))
      onChanged?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '예약하지 못했어요. 예약내역을 확인한 뒤 다시 시도해 주세요.')
      if (cause instanceof BackendApiError && cause.status === 409) { setConflict(true); onChanged?.() }
    } finally { busy.current = false; setPending(false) }
  }

  if (result) return <Modal title={result.status === 'PENDING' ? '사장님 확인 대기' : '예약 확정'} onClose={onClose} className="customer-dialog">
    <p role="status">{result.status === 'PENDING' ? '예약 신청을 보냈어요. 아직 확정된 예약이 아니며, 사장님이 선택하면 예약이 확정돼요.' : '예약이 확정됐어요.'}</p>
    {result.status === 'PENDING' && <p className="muted">신청만으로 시간이 선점되지는 않아요. 결과는 예약내역에서 확인할 수 있어요.</p>}
    <button className="button" onClick={() => { navigate(`/customer/reservations/${encodeURIComponent(result.id)}`); onClose() }}>예약내역 확인</button>
  </Modal>

  return <Modal title={slot.instantBooking === false ? '예약 신청 확인' : '예약 확인'} onClose={() => { if (!busy.current) onClose() }} className="customer-dialog">
    <p className="muted">{slot.instantBooking === false ? '사장님이 신청을 확인하고 선택하면 예약이 확정돼요. 신청만으로 시간을 선점하지 않아요.' : '예약 내용을 확인한 뒤 확정해 주세요.'}</p>
    <dl className="reservation-summary">
      <dt>가게</dt><dd>{shop.name}</dd>
      <dt>시술</dt><dd>{slot.service}</dd>
      <dt>날짜</dt><dd>{dateLabel(slot.startsAt)}</dd>
      <dt>시간</dt><dd>{timeLabel(slot.startsAt)}</dd>
      <dt>예약 금액</dt><dd><Price price={slot.price} originalPrice={slot.originalPrice} /></dd>
      <dt>확정 방식</dt><dd>{slot.instantBooking === false ? '사장님 선택' : '즉시확정'}</dd>
    </dl>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="customer-dialog-actions">
      <button type="button" className="button secondary" disabled={pending} onClick={onClose}>돌아가기</button>
      <button type="button" className="button" disabled={pending || conflict} onClick={() => void confirm()}>{pending ? '예약 확인 중…' : slot.instantBooking === false ? '예약 신청' : '예약 확정하기'}</button>
    </div>
  </Modal>
}
