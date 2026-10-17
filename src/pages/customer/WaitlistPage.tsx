import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { dateLabel, timeLabel } from '../../model'
import type { Slot, WaitlistConditions, WaitlistItem } from '../../model'
import { cancelWaitlist, readWaitlist, readWaitlistItem } from '../../lib/customer-api'
import { CATEGORY_LABELS } from '../../data/categories'
import { Price } from '../../components/customer/Price'
import { WaitlistDialog } from '../../components/customer/WaitlistDialog'
import { IntentDialog } from '../../components/customer/IntentDialog'
import { ReservationDialog } from '../../components/customer/ReservationDialog'

export function WaitlistPage({ savedLocation = null, revision = 0 }: { savedLocation?: WaitlistConditions['location']; revision?: number }) {
  const { id } = useParams()
  const [params] = useSearchParams()
  const [showIntent, setShowIntent] = useState(params.get('new') === '1')
  const [items, setItems] = useState<WaitlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [editing, setEditing] = useState<WaitlistItem | null>(null)
  const [removing, setRemoving] = useState<WaitlistItem | null>(null)
  const [removeError, setRemoveError] = useState('')
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const request = useRef({ version: 0, key: '' })
  const [pendingBooking, setPendingBooking] = useState<{ shop: { id: string; name: string }; slot: Slot; waitlistId: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void (id ? readWaitlistItem(id, controller.signal).then((item) => [item]) : readWaitlist(controller.signal)).then((result) => { if (!controller.signal.aborted) setItems(result) })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '대기내역을 조회하지 못했어요.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt, id, revision])

  function reload() { setLoading(true); setError(''); setAttempt((value) => value + 1) }
  function closeRemove() { setRemoving(null); if (removeError) reload() }
  async function remove() {
    if (!removing || busy.current) return
    busy.current = true
    setPending(true)
    setRemoveError('')
    try {
      const latest = await readWaitlistItem(removing.id)
      if (latest.status !== 'CANCELED') {
        if (request.current.version !== latest.version) request.current = { version: latest.version, key: crypto.randomUUID() }
        await cancelWaitlist(latest, request.current.key)
      }
      setRemoving(null)
      reload()
    }
    catch (cause) { setRemoveError(cause instanceof Error ? cause.message : '대기를 취소하지 못했어요.') }
    finally { busy.current = false; setPending(false) }
  }

  return <div className="page"><header className="customer-record-heading"><p className="eyebrow">기다림도, 설레게</p><h1 className="page-heading">{id ? '대기 상세' : '대기내역'}</h1>{id && <Link to="/customer/waitlist">전체 대기내역</Link>}<button className="button secondary small" disabled={loading} onClick={reload}>새로고침</button><button className="button secondary small" onClick={() => setShowIntent(true)}>조건으로 대기 신청</button><p className="muted">원하던 시간에 빈자리가 생기면 알려드려요.</p></header><div className="customer-note"><Icon name="bell" size={19} /><span>대기는 예약 확정이 아니에요.<br />빈자리가 생기면 직접 예약해 주세요.</span></div>
    {loading ? <p role="status">대기내역을 불러오고 있어요…</p> : error ? <div className="form-error" role="alert">{error}<button className="button secondary" onClick={reload}>다시 시도</button></div> : <><p className="record-count">알림 신청 <strong>{items.length}</strong>건</p>
      {items.length ? items.map((item) => <article key={item.id} className="waitlist-card"><div className="record-status"><span className={`badge ${item.offers.length ? 'coral' : ''}`}>{item.offers.length ? '✦ 예약할 수 있어요' : item.availability === 'CLOSED' ? '대기 종료' : '빈자리 기다리는 중'}</span><span>{dateLabel(item.createdAt)} 신청</span></div>
        <h3>{item.store?.name ?? `${CATEGORY_LABELS[item.conditions.category]} 주변 가게`}</h3>{item.service && <p>{item.service.name}</p>}
        <div className="record-schedule"><Icon name="clock" size={15} /><span>{dateLabel(item.conditions.windowStart)} {timeLabel(item.conditions.windowStart)} ~<br />{dateLabel(item.conditions.windowEnd)} {timeLabel(item.conditions.windowEnd)}</span></div>
        {item.offers.map((slot) => <div key={slot.id} className="slot-option"><strong>{slot.shopName} · {slot.service}</strong><p>{dateLabel(slot.startsAt)} · {timeLabel(slot.startsAt)}</p><Price price={slot.price} originalPrice={slot.originalPrice} /><button className="button small" style={{ width: '100%' }} onClick={() => setPendingBooking({ shop: { id: slot.shopId, name: slot.shopName }, slot, waitlistId: item.id })}>이 시간 예약하기<Icon name="chevron-right" size={15} /></button></div>)}
        {!item.offers.length && item.conditions.storeId && <Link className="button secondary small" style={{ width: '100%' }} to={`/customer/shops/${encodeURIComponent(item.conditions.storeId)}`}>다른 시간 둘러보기</Link>}
        <div className="record-secondary-actions">{!id && <Link to={`/customer/waitlist/${encodeURIComponent(item.id)}`}>상세 보기</Link>}{item.status === 'ACTIVE' && <><button onClick={() => setEditing(item)}>시간 변경</button><button onClick={() => { setRemoving(item); setRemoveError(''); request.current = { version: item.version, key: crypto.randomUUID() } }}>대기 취소</button></>}</div>
      </article>) : <div className="empty-state"><Icon name="bell" size={35} /><h2>기다리는 빈자리가 없어요</h2><p>마음에 드는 가게에서 알림을 신청해 보세요.</p><Link className="button secondary" to="/customer">가게 둘러보기</Link></div>}
    </>}
    {showIntent && <IntentDialog savedLocation={savedLocation} onClose={() => setShowIntent(false)} onSaved={reload} />}
    {editing && <WaitlistDialog item={editing} onClose={() => { setEditing(null); reload() }} />}
    {pendingBooking && <ReservationDialog {...pendingBooking} onClose={() => { setPendingBooking(null); reload() }} />}
    {removing && <Modal title="빈자리 대기를 취소할까요?" onClose={() => { if (!busy.current) closeRemove() }} className="customer-dialog">
      <p className="muted">취소하면 이 조건의 빈자리 알림을 받을 수 없어요.</p>
      {removeError && <p className="form-error" role="alert">{removeError}</p>}
      <div className="customer-dialog-actions"><button type="button" className="button secondary" disabled={pending} onClick={closeRemove}>돌아가기</button><button type="button" className="button" disabled={pending} onClick={() => void remove()}>{pending ? '취소 중…' : '대기 취소하기'}</button></div>
    </Modal>}
  </div>
}
