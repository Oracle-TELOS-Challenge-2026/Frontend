import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { dateLabel, getAvailableSlots, timeLabel } from '../../model'
import type { DemoProps } from '../../model'
import { Price } from '../../components/customer/Price'
import { WaitlistDialog } from '../../components/customer/WaitlistDialog'

export function ShopDetail({ shops, reservations, onReserve, onWaitlist }: DemoProps) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [selectedTime, setSelectedTime] = useState('')
  const [showWaitlist, setShowWaitlist] = useState(false)
  const [error, setError] = useState('')
  const shop = shops.find((item) => item.id === id)
  if (!shop) return <div className="page empty-state"><h1>가게를 찾을 수 없어요</h1><Link className="button secondary" to="/customer">주변 가게 보기</Link></div>
  const slots = getAvailableSlots(shop, reservations)
  const selected = slots.find((slot) => slot.startsAt === selectedTime) ?? slots[0]

  return <div className="shop-detail">
    <div className="detail-header"><img src={shop.image} alt={`${shop.name} 시술 예시`} /><Link to="/customer" className="icon-button detail-back" aria-label="주변 가게로 돌아가기"><Icon name="arrow-left" /></Link><span className="detail-image-caption">시술 분위기 참고 이미지</span></div>
    <div className="detail-content"><div className="detail-title-row"><div><span className="badge">{shop.category} · 성수동</span><h1>{shop.name}</h1></div><Link to={`/customer/chat/${shop.id}`} className="icon-button" aria-label={`${shop.name}에 채팅 문의`}><Icon name="chat" size={23} /></Link></div>
      <p className="detail-info"><span style={{ color: '#e7ad57' }}>★</span> {shop.rating} <span>·</span> {shop.distance}</p><p className="detail-description">{shop.description}</p><p className="detail-info"><Icon name="pin" size={15} />{shop.address}</p><p className="detail-info"><Icon name="clock" size={15} />시술 소요 시간 약 {shop.duration}분</p>
      <section className="detail-section"><h2>나에게 딱 맞는 시간</h2><p>빈자리를 발견했다면, 기분 좋게 예약해 보세요.</p>{slots.length ? <fieldset style={{ border: 0, padding: 0, margin: 0 }}><legend className="sr-only">예약할 시술 시간 선택</legend>{slots.map((slot) => <label key={slot.startsAt} className={`slot-option ${selected?.startsAt === slot.startsAt ? 'selected' : ''}`}><input type="radio" name="reservation-slot" value={slot.startsAt} checked={selected?.startsAt === slot.startsAt} onChange={() => { setSelectedTime(slot.startsAt); setError('') }} /><span className={`badge ${slot.price < slot.originalPrice ? 'coral' : ''}`}>{slot.price < slot.originalPrice ? '✦ 반가운 빈자리 특가' : '예약 가능'}</span><h3>{slot.service}</h3><p>{dateLabel(slot.startsAt)} · {timeLabel(slot.startsAt)}</p><Price price={slot.price} originalPrice={slot.originalPrice} /></label>)}</fieldset> : <div className="empty-state"><Icon name="calendar" size={28} /><p>지금은 예약 가능한 시간이 없어요.<br />빈자리 알림을 신청해 보세요.</p></div>}
        {error && <p className="form-error" role="alert">{error}</p>}<div className="detail-actions"><button className="button secondary" onClick={() => setShowWaitlist(true)}><Icon name="bell" size={16} />빈자리 알림</button><button className="button" disabled={!selected} onClick={() => { if (selected && onReserve(shop.id, selected.startsAt)) navigate('/customer/reservations'); else setError('방금 예약된 시간이에요. 다른 시간을 선택해 주세요.') }}>{selected ? `${timeLabel(selected.startsAt)} 예약하기` : '예약 마감'}</button></div><Link className="detail-chat" to={`/customer/chat/${shop.id}`}><Icon name="chat" size={15} />궁금한 점은 사장님께 물어보세요<Icon name="chevron-right" size={13} /></Link>
      </section>
    </div>
    {showWaitlist && <WaitlistDialog shop={shop} onSave={(date, time) => onWaitlist(shop.id, date, time)} onClose={() => setShowWaitlist(false)} />}
  </div>
}
