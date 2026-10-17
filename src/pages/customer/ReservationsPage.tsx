import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { LoadingIndicator } from '../../components/LoadingIndicator'
import { Modal } from '../../components/Modal'
import { dateLabel, timeLabel, todayInSeoul } from '../../model'
import type { Reservation } from '../../model'
import { cancelReservation, readReservation, readReservations } from '../../lib/customer-api'
import { BackendApiError } from '../../lib/backend-api'
import { Price } from '../../components/customer/Price'

const scopes = [{ scope: 'UPCOMING', title: '다가오는 예약·신청' }, { scope: 'PAST', title: '지난 예약' }, { scope: 'CANCELED', title: '취소·종료한 예약' }] as const
const statusLabels = { PENDING: '사장님 확인 대기', CONFIRMED: '예약 확정', REJECTED: '신청 마감', WITHDRAWN: '신청 철회', EXPIRED: '신청 만료', COMPLETED: '이용 완료', CANCELED: '예약 취소', NO_SHOW: '미방문' }

export type ReservationsCache = Map<string, Reservation[][]>

export function ReservationsPage({ cache, refreshKey = '', onBookingChanged }: { cache: ReservationsCache; refreshKey?: string; onBookingChanged?: () => void }) {
  const { id } = useParams()
  const [result, setResult] = useState<{ key: string; requestKey: string; groups?: Reservation[][]; error: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [canceling, setCanceling] = useState<Reservation | null>(null)
  const [cancelError, setCancelError] = useState('')
  const [cancelConflict, setCancelConflict] = useState(false)
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const requestId = useRef('')
  const key = id ? `detail:${id}` : 'list'
  const requestKey = JSON.stringify([key, attempt, refreshKey])
  const current = result?.key === key ? result : null
  const groups = current?.groups ?? cache.get(key)
  const loading = current?.requestKey !== requestKey
  const error = loading ? '' : current?.error ?? ''

  useEffect(() => {
    const controller = new AbortController()
    const request = id ? readReservation(id, controller.signal).then((item) => {
      const index = ['CANCELED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'].includes(item.status) ? 2 : item.status === 'PENDING' || item.status === 'CONFIRMED' && Date.parse(item.endsAt!) > Date.now() ? 0 : 1
      return scopes.map((_, group) => group === index ? [item] : [])
    }) : Promise.all(scopes.map(({ scope }) => readReservations(scope, controller.signal)))
    void request.then((items) => {
      if (controller.signal.aborted) return
      cache.set(key, items)
      setResult({ key, requestKey, groups: items, error: '' })
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return
      const denied = cause instanceof BackendApiError && (cause.status === 401 || cause.status === 403)
      const missing = Boolean(id && cause instanceof BackendApiError && cause.status === 404)
      if (denied) cache.clear()
      else if (missing) cache.delete(key)
      if (denied || missing) setCanceling(null)
      setResult((previous) => ({
        key, requestKey, groups: denied || missing ? undefined : (previous?.key === key ? previous.groups : undefined) ?? cache.get(key),
        error: cause instanceof Error ? cause.message : '예약내역을 조회하지 못했어요.',
      }))
    })
    return () => controller.abort()
  }, [cache, id, key, requestKey])

  function reload() { setAttempt((value) => value + 1) }
  function closeCancel() { setCanceling(null); if (cancelError) reload() }
  async function cancel() {
    if (!canceling || busy.current) return
    busy.current = true
    setPending(true)
    setCancelError('')
    try {
      await cancelReservation(canceling, requestId.current)
      setResult((previous) => previous?.key === key ? previous : { key, requestKey, groups, error: '' })
      cache.delete('list'); cache.delete(`detail:${canceling.id}`)
      onBookingChanged?.()
      setCanceling(null); reload()
    }
    catch (cause) {
      setCancelError(cause instanceof Error ? cause.message : '예약을 취소하지 못했어요.')
      if (cause instanceof BackendApiError && cause.status === 409) {
        setCancelConflict(true); cache.delete('list'); cache.delete(`detail:${canceling.id}`); onBookingChanged?.(); reload()
      }
    }
    finally { busy.current = false; setPending(false) }
  }

  return <div className="page"><header className="customer-record-heading notification-heading"><div><p className="eyebrow">나를 위한 시간이 기다려요</p><h1 className="page-heading">{id ? '예약 상세' : '예약내역'}</h1>{id && <Link to="/customer/reservations">전체 예약내역</Link>}<p className="muted">기분 좋은 약속, 여기 모아두었어요.</p></div><button type="button" className="icon-button refresh-button" aria-label="새로고침" title="새로고침" aria-busy={loading} onClick={reload}><Icon name="refresh" size={20} /></button></header>
    {error && <div className="form-error" role="alert">{groups && '저장된 예약내역을 표시하고 있어요. '}{error}<button className="button secondary" onClick={reload}>다시 시도</button></div>}
    {!groups && loading ? <LoadingIndicator label="예약내역을 불러오고 있어요…" /> : groups && <>
      <div className="customer-note"><Icon name="calendar" size={20} /><span>{groups[0].length ? <>예약 확정 <strong>{groups[0].filter((item) => item.status === 'CONFIRMED').length}건</strong> · 사장님 확인 대기 <strong>{groups[0].filter((item) => item.status === 'PENDING').length}건</strong></> : '아직 다가오는 예약이 없어요.'}</span></div>
      {scopes.map((group, index) => (!id || groups[index].length > 0) && <section key={group.scope}><h2 className="record-count">{group.title} <strong>{groups[index].length}</strong></h2>{groups[index].map((item) => <article key={item.id} className={`reservation-card ${index > 0 ? 'completed' : ''}`}>
        <div className="record-status"><span className="badge">{statusLabels[item.status]}</span><span>{todayInSeoul(new Date(item.startsAt)) === todayInSeoul() ? '오늘' : dateLabel(item.startsAt)}</span></div>
        {item.status === 'PENDING' && <p className="muted">사장님이 선택하면 예약이 확정돼요. 신청만으로 시간을 선점하지 않아요.</p>}
        {item.status === 'REJECTED' && <p className="muted">사장님 거절, 모집 철회 또는 다른 고객 선택으로 신청이 마감되었어요.</p>}
        <Link className="record-shop" to={`/customer/shops/${encodeURIComponent(item.shopId)}`}><span className="shop-thumb">{item.shopImage ? <img src={item.shopImage} alt={item.shopName} /> : <Icon name="store" size={28} />}</span><div className="shop-result-content"><div className="shop-result-title"><h3>{item.shopName}</h3></div><p className="shop-result-service">{item.service}</p><Price price={item.price} originalPrice={item.originalPrice} /></div></Link>
        <div className="record-schedule"><Icon name="calendar" size={15} />{dateLabel(item.startsAt)} · {timeLabel(item.startsAt)} <span style={{ marginLeft: 'auto', fontSize: 10 }}>{item.duration}분</span></div>
        <div className="record-actions">{!id && <Link className="button secondary small" to={`/customer/reservations/${encodeURIComponent(item.id)}`}>상세 보기</Link>}<Link className="button secondary small" to={`/customer/shops/${encodeURIComponent(item.shopId)}`}>{index > 0 ? '다시 예약하기' : '가게 보기'}</Link><Link className="button secondary small" to={`/customer/chat/${encodeURIComponent(item.shopId)}`}><Icon name="chat" size={15} />채팅 문의</Link></div>
        {item.allowedActions.includes('CANCEL') && <div className="record-secondary-actions"><button type="button" onClick={() => { setCanceling(item); setCancelError(''); setCancelConflict(false); requestId.current = crypto.randomUUID() }}>{item.status === 'PENDING' ? '신청 철회' : '예약 취소'}</button></div>}
      </article>)}{!groups[index].length && <div className="empty-state"><p>표시할 {group.title}이 없어요.</p>{index === 0 && <Link className="button secondary" to="/customer">예약하러 가기</Link>}</div>}</section>)}
    </>}
    {canceling && <Modal title={canceling.status === 'PENDING' ? '예약 신청을 철회할까요?' : '예약을 취소할까요?'} onClose={() => { if (!busy.current) closeCancel() }} className="customer-dialog">
      <p>{canceling.status === 'PENDING' ? '사장님 확인을 기다리는 신청을 철회해요. 빈자리 알림 대기는 유지돼요.' : '취소한 시간은 다른 고객이 예약할 수 있어요.'}</p><div className="record-schedule"><Icon name="calendar" size={18} /><div><strong>{canceling.shopName}</strong><p>{dateLabel(canceling.startsAt)} · {timeLabel(canceling.startsAt)}</p></div></div>
      {cancelError && <p className="form-error" role="alert">{cancelError}</p>}
      <div className="customer-dialog-actions"><button type="button" className="button secondary" disabled={pending} onClick={closeCancel}>돌아가기</button><button type="button" className="button" disabled={pending || cancelConflict} onClick={() => void cancel()}>{pending ? '처리 중…' : canceling.status === 'PENDING' ? '신청 철회하기' : '예약 취소하기'}</button></div>
    </Modal>}
  </div>
}
