import { useEffect } from 'react'
import { Icon } from '../Icon'
import { ShopMapMarker } from './ShopMapMarker'
import { useKakaoMap } from '../../hooks/useKakaoMap'
import { getAvailableSlots } from '../../model'
import type { Reservation, Shop } from '../../model'

export function ShopMap({ shops, reservations }: { shops: Shop[]; reservations: Reservation[] }) {
  const { containerRef, instance, status, retry } = useKakaoMap()

  useEffect(() => {
    if (!instance || shops.length === 0) return
    const { map, maps } = instance
    const bounds = new maps.LatLngBounds()
    shops.forEach((shop) => bounds.extend(new maps.LatLng(shop.latitude, shop.longitude)))
    if (shops.length === 1) map.setCenter(new maps.LatLng(shops[0].latitude, shops[0].longitude))
    else {
      map.setBounds(bounds, 75, 65, 45, 65)
      map.setLevel(Math.max(1, map.getLevel() - 1))
    }
  }, [instance, shops])

  return <div className="neighborhood-map" aria-label="성수동 가게 지도">
    <div ref={containerRef} className="kakao-map-canvas" />
    {status !== 'ready' && <div className="map-status" role="status">
      <Icon name="pin" size={24} />
      <strong>{status === 'loading' ? '동네 지도를 불러오고 있어요' : status === 'error' ? '지도를 불러오지 못했어요' : '지도를 준비하고 있어요'}</strong>
      <span>아래 목록에서도 가게를 찾아볼 수 있어요.</span>
      {status === 'error' && <button className="button secondary small" onClick={retry}>다시 시도</button>}
    </div>}
    {instance && shops.map((shop) => {
      const slot = getAvailableSlots(shop, reservations)[0]
      return slot ? <ShopMapMarker key={shop.id} instance={instance} shop={shop} slot={slot} /> : null
    })}
    {status === 'ready' && <>
      <span className="map-caption">가게 위치·예약은 시연용이에요</span>
      <span className="map-legend"><i />코랄색은 빈자리 특가</span>
    </>}
  </div>
}
