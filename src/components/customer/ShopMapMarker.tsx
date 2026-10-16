import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../Icon'
import { money } from '../../model'
import { SHOP_CATEGORIES } from '../../data/categories'
import type { Shop, Slot } from '../../model'
import type { KakaoMapInstance } from '../../types/kakao-map'

export function ShopMapMarker({ instance, shop, slot, selected, onSelect }: { instance: KakaoMapInstance; shop: Shop; slot: Slot; selected: boolean; onSelect: (id: string) => void }) {
  const [content] = useState(() => document.createElement('div'))
  const overlayRef = useRef<InstanceType<KakaoMapInstance['maps']['CustomOverlay']> | null>(null)
  const { latitude, longitude } = shop
  const discounted = slot.price < slot.originalPrice

  useEffect(() => {
    const { map, maps } = instance
    const overlay = new maps.CustomOverlay({
      map, content, clickable: true, yAnchor: 1,
      position: new maps.LatLng(latitude, longitude),
    })
    overlayRef.current = overlay
    return () => { overlay.setMap(null); overlayRef.current = null }
  }, [instance, content, latitude, longitude])

  useEffect(() => { overlayRef.current?.setZIndex(selected ? 2 : 1) }, [instance, latitude, longitude, selected])

  return createPortal(<button type="button" className={`map-pin ${discounted ? 'discount' : ''} ${selected ? 'selected' : ''}`} aria-label={`${shop.name}, ${shop.category}, ${discounted ? '빈자리 특가' : '예약 가능'}, ${money(slot.price)}`} aria-pressed={selected} aria-controls="shop-results-list" onClick={() => onSelect(shop.id)}>
    <span className="map-bubble"><span className="map-pin-icon"><Icon name={SHOP_CATEGORIES.find((item) => item.name === shop.category)?.icon ?? 'pin'} size={16} /></span><strong>{money(slot.price)}</strong></span>
    <span className="map-pin-name">{shop.name}</span>
  </button>, content)
}
