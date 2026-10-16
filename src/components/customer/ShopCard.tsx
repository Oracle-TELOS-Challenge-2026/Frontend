import { Link } from 'react-router-dom'
import { Icon } from '../Icon'
import { DEMO_DAY, dateLabel, timeLabel } from '../../model'
import type { Shop, Slot } from '../../model'
import { Price } from './Price'

export function ShopCard({ shop, slot, compact = false }: { shop: Shop; slot?: Slot; compact?: boolean }) {
  return <Link to={`/customer/shops/${shop.id}`} className={compact ? 'record-shop' : 'shop-result'}>
    <img className="shop-thumb" src={shop.image} alt={`${shop.name} 시술 예시`} />
    <div className="shop-result-content">
      <div className="shop-result-title"><h3>{shop.name}</h3>{!compact && <Icon name="chevron-right" size={16} />}</div>
      {!compact && <>
        <p className="shop-result-meta">{shop.category} · {shop.distance} · <span aria-label={`평점 ${shop.rating}`}>★ {shop.rating}</span></p>
        <span className={`badge ${slot && slot.price < slot.originalPrice ? 'coral' : ''}`}>{slot ? `${slot.startsAt.startsWith(DEMO_DAY) ? '오늘' : dateLabel(slot.startsAt)} ${timeLabel(slot.startsAt)}${slot.price < slot.originalPrice ? ' 빈자리' : ' 예약 가능'}` : '빈자리 알림 신청 가능'}</span>
      </>}
      <p className="shop-result-service">{slot?.service ?? shop.service}</p>
      <Price price={slot?.price ?? shop.originalPrice} originalPrice={slot?.originalPrice ?? shop.originalPrice} />
    </div>
  </Link>
}
