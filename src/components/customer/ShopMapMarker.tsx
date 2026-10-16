import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { Icon } from '../Icon'
import { money } from '../../model'
import type { Shop, Slot } from '../../model'
import type { KakaoMapInstance } from '../../types/kakao-map'

export function ShopMapMarker({ instance, shop, slot }: { instance: KakaoMapInstance; shop: Shop; slot: Slot }) {
  const [content] = useState(() => document.createElement('div'))
  const { latitude, longitude } = shop
  const discounted = slot.price < slot.originalPrice

  useEffect(() => {
    const { map, maps } = instance
    const overlay = new maps.CustomOverlay({
      map, content, clickable: true, yAnchor: 1,
      position: new maps.LatLng(latitude, longitude),
    })
    return () => overlay.setMap(null)
  }, [instance, content, latitude, longitude])

  return createPortal(<Link to={`/customer/shops/${shop.id}`} className={`map-pin ${discounted ? 'discount' : ''}`} aria-label={`${shop.name}, ${discounted ? '빈자리 특가' : '예약 가능'}, ${money(slot.price)}`}>
    <span className="map-bubble">{discounted ? <><Icon name="sparkle" size={13} /><strong>{money(slot.price)}</strong></> : <><Icon name="calendar" size={12} />예약 가능</>}</span>
    <span className="map-pin-name">{shop.name}</span>
  </Link>, content)
}
