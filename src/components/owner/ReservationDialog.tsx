import { useEffect, useRef, useState } from 'react'
import { Modal } from '../Modal'
import { dateLabel, money, timeLabel } from '../../lib/format'
import { readOwnerReservation, updateOwnerReservationStatus } from '../../lib/owner-api'
import type { OwnerReservationDetail } from '../../lib/owner-api'

const statusLabel = { CONFIRMED: '예약 확정', COMPLETED: '시술 완료', CANCELED: '예약 취소', NO_SHOW: '노쇼' }

export function OwnerReservationDialog({ storeId, reservationId, onClose, onUpdated }: { storeId: string; reservationId: string; onClose: () => void; onUpdated: (reservation: OwnerReservationDetail) => void }) {
  const [reservation, setReservation] = useState<OwnerReservationDetail | null>(null)
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [action, setAction] = useState<'COMPLETED' | 'NO_SHOW' | null>(null)
  const busy = useRef(false)
  const request = useRef<{ status: 'COMPLETED' | 'NO_SHOW'; key: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    readOwnerReservation(storeId, reservationId, controller.signal).then((item) => { if (!controller.signal.aborted) setReservation(item) }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '예약을 불러오지 못했어요.')
    })
    return () => controller.abort()
  }, [storeId, reservationId, revision])

  function reload() {
    setReservation(null)
    setError('')
    setAction(null)
    request.current = null
    setRevision((value) => value + 1)
  }

  async function update() {
    if (!reservation || !action || busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    if (request.current?.status !== action) request.current = { status: action, key: crypto.randomUUID() }
    try { onUpdated(await updateOwnerReservationStatus(storeId, reservation, action, request.current.key)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '예약 상태를 변경하지 못했어요.') }
    finally { busy.current = false; setPending(false) }
  }

  return <Modal className="owner-dialog" title="예약 상세" onClose={() => { if (!busy.current) onClose() }}>
    {!reservation && !error && <p role="status">예약 정보를 불러오는 중이에요.</p>}
    {reservation && <>
      <p className="owner-dialog-date">{dateLabel(reservation.startAt)} · {timeLabel(reservation.startAt)} – {timeLabel(reservation.endAt)}</p>
      <span className="badge">{statusLabel[reservation.status]}</span>
      <dl className="owner-booking-detail"><dt>고객</dt><dd>{reservation.customer.displayName} 고객님</dd><dt>시술</dt><dd>{reservation.service.name}</dd><dt>소요 시간</dt><dd>{reservation.service.durationMinutes}분</dd><dt>예약 금액</dt><dd>{money(reservation.price.payable)}</dd></dl>
      {action ? <div className="owner-status-confirm">
        <p>{action === 'COMPLETED' ? '시술을 완료한 예약으로 처리할까요?' : '고객이 방문하지 않았나요? 노쇼로 처리하면 남은 시간을 빈자리로 발행할 수 있어요.'}</p>
        <div className="account-form-actions"><button className="button secondary" disabled={pending} onClick={() => setAction(null)}>돌아가기</button><button className="button" disabled={pending} onClick={() => void update()}>{pending ? '처리 중…' : `${statusLabel[action]} 처리`}</button></div>
      </div> : <>
        {reservation.status === 'CONFIRMED' && <p className="muted">시술 완료는 종료 시간 이후, 노쇼는 시작 10분 이후에 처리할 수 있어요.</p>}
        <div className="account-form-actions">
          {reservation.allowedActions.includes('COMPLETE') && <button className="button" onClick={() => setAction('COMPLETED')}>시술 완료</button>}
          {reservation.allowedActions.includes('NO_SHOW') && <button className="button secondary" onClick={() => setAction('NO_SHOW')}>노쇼 처리</button>}
        </div>
      </>}
    </>}
    {error && <p className="owner-form-error" role="alert">{error}</p>}
    <button className="account-text-button" disabled={pending} onClick={reload}>최신 정보 다시 조회</button>
  </Modal>
}
