import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { dateLabel, getAvailableSlots, timeLabel, todayInSeoul, isCalendarDate } from '../../model'
import type { Shop, Slot } from '../../model'
import { readStore } from '../../lib/customer-api'
import { Price } from '../../components/customer/Price'
import { WaitlistDialog } from '../../components/customer/WaitlistDialog'
import { ReservationDialog } from '../../components/customer/ReservationDialog'

export function ShopDetail() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const requestedDate = searchParams.get('date') ?? ''
  const [date, setDate] = useState(isCalendarDate(requestedDate) && requestedDate >= todayInSeoul() ? requestedDate : todayInSeoul())
  const [selectedId, setSelectedId] = useState(searchParams.get('slotId') ?? '')
  const [shop, setShop] = useState<Shop | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [showWaitlist, setShowWaitlist] = useState(false)
  const [pendingBooking, setPendingBooking] = useState<Slot | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void readStore(id ?? '', date, controller.signal).then((result) => { if (!controller.signal.aborted) setShop(result) }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '가게를 조회하지 못했어요.')
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [id, date, attempt])

  function reload() { setLoading(true); setError(''); setAttempt((value) => value + 1) }
  if (loading && !shop) return <div className="page" role="status">가게를 불러오고 있어요…</div>
  if (!shop) return <div className="page empty-state"><h1>가게를 불러오지 못했어요</h1><p role="alert">{error}</p><button className="button secondary" onClick={reload}>다시 시도</button><Link to="/customer">주변 가게 보기</Link></div>
  const slots = loading || error ? [] : getAvailableSlots(shop)
  const selected = slots.find((slot) => slot.id === selectedId) ?? slots[0]
  const exampleImage = shop.image.startsWith('/images/shops/')

  return <div className="shop-detail">
    <div className="detail-header">{shop.image ? <img src={shop.image} alt={exampleImage ? `${shop.category} 예시 이미지` : shop.name} /> : <div className="detail-placeholder"><Icon name="store" size={48} /></div>}<Link to="/customer" className="icon-button detail-back" aria-label="주변 가게로 돌아가기"><Icon name="arrow-left" /></Link></div>
    <div className="detail-content"><div className="detail-title-row"><div><span className="badge">{shop.category}</span><h1>{shop.name}</h1></div><Link to={`/customer/chat/${encodeURIComponent(shop.id)}`} className="icon-button" aria-label={`${shop.name}에 채팅 문의`}><Icon name="chat" size={23} /></Link></div>
      {exampleImage && <p className="detail-info">카테고리 예시 이미지입니다.</p>}
      <p className="detail-description">{shop.description}</p><p className="detail-info"><Icon name="pin" size={15} />{shop.address}</p>
      <section className="detail-section"><h2>나에게 딱 맞는 시간</h2><p>빈자리를 발견했다면, 기분 좋게 예약해 보세요.</p>
        <label className="detail-date">방문 날짜<input type="date" min={todayInSeoul()} value={date} onChange={(event) => { if (event.target.value) { setLoading(true); setError(''); setSelectedId(''); setDate(event.target.value) } }} /></label>
        {error ? <p className="form-error" role="alert">{error} <button className="button secondary small" onClick={reload}>다시 시도</button></p> : loading ? <p role="status">예약 가능한 시간을 조회하고 있어요…</p> : slots.length ? <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="sr-only">예약할 시술 시간 선택</legend>{slots.map((slot) => <label key={slot.id} className={`slot-option ${selected?.id === slot.id ? 'selected' : ''}`}><input type="radio" name="reservation-slot" value={slot.id} checked={selected?.id === slot.id} onChange={() => setSelectedId(slot.id)} /><span className={`badge ${slot.price < slot.originalPrice ? 'coral' : ''}`}>{slot.price < slot.originalPrice ? '✦ 반가운 빈자리 특가' : '예약 가능'}</span><h3>{slot.service}</h3><p>{dateLabel(slot.startsAt)} · {timeLabel(slot.startsAt)}{slot.endsAt && ` ~ ${timeLabel(slot.endsAt)}`}</p><Price price={slot.price} originalPrice={slot.originalPrice} /></label>)}</fieldset> : <div className="empty-state"><Icon name="calendar" size={28} /><p>이 날짜에는 예약 가능한 시간이 없어요.<br />다른 날짜를 선택하거나 빈자리 알림을 신청해 보세요.</p></div>}
        <div className="detail-actions"><button className="button secondary" onClick={() => setShowWaitlist(true)}><Icon name="bell" size={16} />빈자리 알림</button><button className="button" disabled={!selected} onClick={() => { if (selected) setPendingBooking(selected) }}>{selected ? `${timeLabel(selected.startsAt)} 예약하기` : '예약 마감'}</button></div><Link className="detail-chat" to={`/customer/chat/${encodeURIComponent(shop.id)}`}><Icon name="chat" size={15} />궁금한 점은 사장님께 물어보세요<Icon name="chevron-right" size={13} /></Link>
      </section>
    </div>
    {showWaitlist && <WaitlistDialog shop={shop} date={date} onClose={() => setShowWaitlist(false)} />}
    {pendingBooking && <ReservationDialog shop={shop} slot={pendingBooking} onClose={() => { setPendingBooking(null); reload() }} />}
  </div>
}
