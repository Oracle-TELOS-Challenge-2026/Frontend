import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { dateLabel, timeLabel, todayInSeoul } from '../../model'
import type { Reservation } from '../../model'
import { cancelReservation, readReservation, readReservations } from '../../lib/customer-api'
import { Price } from '../../components/customer/Price'

const scopes = [{ scope: 'UPCOMING', title: '다가오는 예약' }, { scope: 'PAST', title: '지난 예약' }, { scope: 'CANCELED', title: '취소한 예약' }] as const
const statusLabels = { CONFIRMED: '예약 확정', COMPLETED: '이용 완료', CANCELED: '예약 취소', NO_SHOW: '미방문' }

export function ReservationsPage() {
  const { id } = useParams()
  const [groups, setGroups] = useState<Reservation[][]>([[], [], []])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [canceling, setCanceling] = useState<Reservation | null>(null)
  const [cancelError, setCancelError] = useState('')
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const requestId = useRef('')

  useEffect(() => {
    const controller = new AbortController()
    const request = id ? readReservation(id, controller.signal).then((item) => {
      const index = item.status === 'CANCELED' ? 2 : item.status === 'CONFIRMED' && Date.parse(item.endsAt!) > Date.now() ? 0 : 1
      return scopes.map((_, group) => group === index ? [item] : [])
    }) : Promise.all(scopes.map(({ scope }) => readReservations(scope, controller.signal)))
    void request.then((items) => {
      if (!controller.signal.aborted) setGroups(items)
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '예약내역을 조회하지 못했어요.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt, id])

  function reload() { setLoading(true); setError(''); setAttempt((value) => value + 1) }
  function closeCancel() { setCanceling(null); if (cancelError) reload() }
  async function cancel() {
    if (!canceling || busy.current) return
    busy.current = true
    setPending(true)
    setCancelError('')
    try { await cancelReservation(canceling, requestId.current); setCanceling(null); reload() }
    catch (cause) { setCancelError(cause instanceof Error ? cause.message : '예약을 취소하지 못했어요.') }
    finally { busy.current = false; setPending(false) }
  }

  return <div className="page"><header className="customer-record-heading"><p className="eyebrow">나를 위한 시간이 기다려요</p><h1 className="page-heading">{id ? '예약 상세' : '예약내역'}</h1>{id && <Link to="/customer/reservations">전체 예약내역</Link>}<button className="button secondary small" disabled={loading} onClick={reload}>새로고침</button><p className="muted">기분 좋은 약속, 여기 모아두었어요.</p></header>
    {loading ? <p role="status">예약내역을 불러오고 있어요…</p> : error ? <div className="form-error" role="alert">{error}<button className="button secondary" onClick={reload}>다시 시도</button></div> : <>
      <div className="customer-note"><Icon name="calendar" size={20} /><span>{groups[0].length ? <>다가오는 예약이 <strong>{groups[0].length}건</strong> 있어요.</> : '아직 다가오는 예약이 없어요.'}</span></div>
      {scopes.map((group, index) => (!id || groups[index].length > 0) && <section key={group.scope}><h2 className="record-count">{group.title} <strong>{groups[index].length}</strong></h2>{groups[index].map((item) => <article key={item.id} className={`reservation-card ${index > 0 ? 'completed' : ''}`}>
        <div className="record-status"><span className="badge">{statusLabels[item.status]}</span><span>{todayInSeoul(new Date(item.startsAt)) === todayInSeoul() ? '오늘' : dateLabel(item.startsAt)}</span></div>
        <Link className="record-shop" to={`/customer/shops/${encodeURIComponent(item.shopId)}`}><span className="shop-thumb">{item.shopImage ? <img src={item.shopImage} alt={item.shopName} /> : <Icon name="store" size={28} />}</span><div className="shop-result-content"><div className="shop-result-title"><h3>{item.shopName}</h3></div><p className="shop-result-service">{item.service}</p><Price price={item.price} originalPrice={item.originalPrice} /></div></Link>
        <div className="record-schedule"><Icon name="calendar" size={15} />{dateLabel(item.startsAt)} · {timeLabel(item.startsAt)} <span style={{ marginLeft: 'auto', fontSize: 10 }}>{item.duration}분</span></div>
        <div className="record-actions">{!id && <Link className="button secondary small" to={`/customer/reservations/${encodeURIComponent(item.id)}`}>상세 보기</Link>}<Link className="button secondary small" to={`/customer/shops/${encodeURIComponent(item.shopId)}`}>{index > 0 ? '다시 예약하기' : '가게 보기'}</Link><Link className="button secondary small" to={`/customer/chat/${encodeURIComponent(item.shopId)}`}><Icon name="chat" size={15} />채팅 문의</Link></div>
        {item.allowedActions.includes('CANCEL') && <div className="record-secondary-actions"><button type="button" onClick={() => { setCanceling(item); setCancelError(''); requestId.current = crypto.randomUUID() }}>예약 취소</button></div>}
      </article>)}{!groups[index].length && <div className="empty-state"><p>표시할 {group.title}이 없어요.</p>{index === 0 && <Link className="button secondary" to="/customer">예약하러 가기</Link>}</div>}</section>)}
    </>}
    {canceling && <Modal title="예약을 취소할까요?" onClose={() => { if (!busy.current) closeCancel() }} className="customer-dialog">
      <p>취소한 시간은 다른 고객이 예약할 수 있어요.</p><div className="record-schedule"><Icon name="calendar" size={18} /><div><strong>{canceling.shopName}</strong><p>{dateLabel(canceling.startsAt)} · {timeLabel(canceling.startsAt)}</p></div></div>
      {cancelError && <p className="form-error" role="alert">{cancelError}</p>}
      <div className="customer-dialog-actions"><button type="button" className="button secondary" disabled={pending} onClick={closeCancel}>돌아가기</button><button type="button" className="button" disabled={pending} onClick={() => void cancel()}>{pending ? '취소 중…' : '예약 취소하기'}</button></div>
    </Modal>}
  </div>
}
