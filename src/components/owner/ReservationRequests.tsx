import { useEffect, useState } from 'react'
import { OwnerReservationDialog } from './ReservationDialog'
import { dateLabel, money, timeLabel } from '../../lib/format'
import { readOwnerReservationRequests } from '../../lib/owner-api'
import type { OwnerReservationDetail, OwnerReservationRequest } from '../../lib/owner-api'

export function ReservationRequests({ storeId, refreshKey, onRefresh, onUpdated, onConflict }: { storeId: string; refreshKey: string; onRefresh: () => void; onUpdated: (reservation: OwnerReservationDetail) => void; onConflict: () => void }) {
  const [items, setItems] = useState<OwnerReservationRequest[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    let controller: AbortController | undefined
    let stopped = false
    async function refresh() {
      if (stopped || controller || document.visibilityState !== 'visible') return
      controller = new AbortController()
      const request = controller
      setLoading(true)
      try {
        const next = await readOwnerReservationRequests(storeId, request.signal)
        if (!stopped && !request.signal.aborted) { setItems(next); setError('') }
      } catch (cause) {
        if (!stopped && !request.signal.aborted) setError(cause instanceof Error ? cause.message : '예약 신청을 불러오지 못했어요.')
      } finally {
        if (controller === request) { controller = undefined; if (!stopped) setLoading(false) }
      }
    }
    function resume() { if (document.visibilityState === 'visible') void refresh() }
    void refresh()
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    document.addEventListener('visibilitychange', resume)
    return () => {
      stopped = true
      controller?.abort()
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [storeId, refreshKey])

  const groups = new Map<string, OwnerReservationRequest[]>()
  for (const item of items ?? []) groups.set(item.slotId, [...(groups.get(item.slotId) ?? []), item])

  return <section className="owner-slots" aria-label="예약 신청 목록">
    <div className="owner-list-heading"><h2>예약 신청</h2><button className="button secondary small" type="button" aria-busy={loading} onClick={onRefresh}>{loading ? '새로고침 중…' : '새로고침'}</button></div>
    <p className="muted">빈자리별 신청순으로 보여드려요. 한 명을 선택하면 같은 빈자리의 다른 신청은 마감돼요.</p>
    {loading && !items && <p role="status">예약 신청을 불러오는 중이에요.</p>}
    {error && <p className="owner-form-error" role="alert">{items && '저장된 신청을 표시하고 있어요. '}{error}</p>}
    {items?.length === 0 && !error && <p className="muted">선택을 기다리는 신청이 없어요.</p>}
    <div className="owner-alert-list">{[...groups].map(([slotId, requests]) => <article className="owner-alert-card" key={slotId}>
      <h3>{dateLabel(requests[0].startAt)} · {timeLabel(requests[0].startAt)} – {timeLabel(requests[0].endAt)}</h3>
      <p>{requests[0].service.name} · {money(requests[0].price.payable)} · 신청 {requests.length}명</p>
      <ol className="owner-request-list">{requests.map((item) => <li key={item.id}>
        <button className="button secondary" type="button" onClick={() => setSelected(item.id)}><span>{item.customer.displayName} 고객님<br /><small>{dateLabel(item.createdAt)} {timeLabel(item.createdAt)} 신청</small></span><span>확인 · 선택</span></button>
      </li>)}</ol>
    </article>)}</div>
    {selected && <OwnerReservationDialog key={selected} storeId={storeId} reservationId={selected} onClose={() => setSelected(null)} onUpdated={(reservation) => { setSelected(null); onUpdated(reservation) }} onConflict={onConflict} />}
  </section>
}
