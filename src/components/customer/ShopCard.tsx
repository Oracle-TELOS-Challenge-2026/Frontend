import { Link } from 'react-router-dom'
import { Icon } from '../Icon'
import { todayInSeoul, dateLabel, timeLabel } from '../../model'
import type { Shop, Slot } from '../../model'
import { Price } from './Price'

export function ShopCard({ shop, slot, compact = false }: { shop: Shop; slot?: Slot; compact?: boolean }) {
  return <Link to={`/customer/shops/${encodeURIComponent(shop.id)}${slot ? `?date=${todayInSeoul(new Date(slot.startsAt))}&slotId=${encodeURIComponent(slot.id)}` : ''}`} className={compact ? 'record-shop' : 'shop-result'}>
    <span className="shop-thumb">{shop.image ? <img src={shop.image} alt={shop.image.startsWith('/images/shops/') ? `${shop.category} 예시 이미지` : shop.name} loading="lazy" /> : <Icon name="store" size={28} />}</span>
    <div className="shop-result-content">
      <div className="shop-result-title"><h3>{shop.name}</h3>{!compact && <Icon name="chevron-right" size={16} />}</div>
      {!compact && <>
        <p className="shop-result-meta">{shop.category}{shop.distance && ` · ${shop.distance}`}</p>
        <span className={`badge ${slot && slot.price < slot.originalPrice ? 'coral' : ''}`}>{slot ? `${todayInSeoul(new Date(slot.startsAt)) === todayInSeoul() ? '오늘' : dateLabel(slot.startsAt)} ${timeLabel(slot.startsAt)}${slot.price < slot.originalPrice ? ' 빈자리' : ' 예약 가능'}` : '빈자리 알림 신청 가능'}</span>
        {slot && <span className="badge">{slot.instantBooking === false ? '사장님 선택' : '즉시확정'}</span>}
      </>}
      <p className="shop-result-service">{slot?.service ?? shop.service}</p>
      {(slot || shop.originalPrice !== null) && <Price price={slot?.price ?? shop.originalPrice!} originalPrice={slot?.originalPrice ?? shop.originalPrice!} />}
    </div>
  </Link>
}
