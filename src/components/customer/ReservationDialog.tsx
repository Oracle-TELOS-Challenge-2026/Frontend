import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { dateLabel, timeLabel } from '../../model'
import type { DemoProps, Shop, Slot } from '../../model'
import { Modal } from '../Modal'
import { Price } from './Price'

export function ReservationDialog({ shop, slot, onReserve, onClose }: { shop: Shop; slot: Slot; onReserve: DemoProps['onReserve']; onClose: () => void }) {
  const navigate = useNavigate()
  const [error, setError] = useState('')

  return <Modal title="예약 확인" onClose={onClose} className="customer-dialog">
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
      <button type="button" className="button secondary" onClick={onClose}>돌아가기</button>
      <button type="button" className="button" onClick={() => {
        if (onReserve(shop.id, slot.startsAt)) navigate('/customer/reservations')
        else setError('예약할 수 없는 시간이에요. 돌아가서 다른 빈자리를 선택해 주세요.')
      }}>예약 확정하기</button>
    </div>
  </Modal>
}
