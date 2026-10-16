import { Link } from 'react-router-dom'
import { Icon } from '../Icon'
import { getAvailableSlots, money } from '../../model'
import type { Reservation, Shop } from '../../model'

export function ShopMap({ shops, reservations }: { shops: Shop[]; reservations: Reservation[] }) {
  return <div className="neighborhood-map" aria-label="성수동 예시 지도">
      <svg viewBox="0 0 480 395" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="480" height="395" fill="#f1f1e9" />
        <path d="M0 235L78 218L123 269L106 395H0Z" fill="#dfe9d4" />
        <path d="M368 0H480V110L430 124L376 83Z" fill="#e2ead7" />
        <g fill="#e7e8df" stroke="#dedfd5" strokeWidth="1"><rect x="30" y="38" width="56" height="37" rx="5" /><rect x="115" y="28" width="66" height="51" rx="5" /><rect x="198" y="20" width="32" height="54" rx="4" /><rect x="276" y="20" width="63" height="39" rx="5" /><rect x="34" y="123" width="43" height="59" rx="5" /><rect x="94" y="116" width="70" height="68" rx="5" /><rect x="185" y="118" width="47" height="62" rx="5" /><rect x="282" y="110" width="56" height="65" rx="5" /><rect x="374" y="147" width="73" height="39" rx="5" /><rect x="144" y="234" width="77" height="47" rx="5" /><rect x="281" y="233" width="43" height="46" rx="5" /><rect x="357" y="232" width="86" height="51" rx="5" /><rect x="153" y="320" width="68" height="56" rx="5" /><rect x="282" y="323" width="71" height="53" rx="5" /><rect x="378" y="321" width="66" height="47" rx="5" /></g>
        <g fill="none" stroke="#fff" strokeWidth="21"><path d="M-10 95L488 84" /><path d="M-10 210L490 205" /><path d="M129 -20L108 212" /><path d="M254 -10L249 409" /><path d="M355 94L338 395" /><path d="M116 302L490 301" /></g>
        <path d="M-10 208L490 202" fill="none" stroke="#e4ddc5" strokeWidth="2" strokeDasharray="7 6" />
        <path d="M461 -10L461 400" fill="none" stroke="#e7dfc9" strokeWidth="4" />
        <text x="294" y="98" className="map-label">연무장길</text><text x="27" y="278" className="map-park-label">서울숲</text><text x="28" y="294" className="map-label">초록이 가득한 산책길</text>
        <circle cx="398" cy="207" r="10" fill="#a0b979" /><text x="398" y="211" fill="white" textAnchor="middle" fontSize="11" fontWeight="700">2</text><text x="413" y="211" className="map-subway-label">성수역</text>
        <text x="129" y="353" className="map-label">성수동 1가</text><text x="283" y="35" className="map-label">성수동 2가</text>
      </svg>
      {shops.map((shop) => {
        const slot = getAvailableSlots(shop, reservations)[0]
        if (!slot) return null
        const discounted = slot.price < slot.originalPrice
        return <Link key={shop.id} to={`/customer/shops/${shop.id}`} className={`map-pin ${discounted ? 'discount' : ''}`} style={{ left: `${shop.mapX}%`, top: `${shop.mapY}%` }} aria-label={`${shop.name}, ${discounted ? '빈자리 특가' : '예약 가능'}, ${money(slot.price)}`}><span className="map-bubble">{discounted ? <><Icon name="sparkle" size={13} /><strong>{money(slot.price)}</strong></> : <><Icon name="calendar" size={12} />예약 가능</>}</span><span className="map-pin-name">{shop.name}</span></Link>
      })}
      <span className="map-location" aria-label="예시 내 위치" />
      <span className="map-caption">데모 지도 · 실제 위치와 다를 수 있어요</span>
      <span className="map-legend"><i />코랄색은 빈자리 특가</span>
    </div>
}
