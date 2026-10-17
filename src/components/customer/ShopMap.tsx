import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Icon } from '../Icon'
import { ShopMapMarker } from './ShopMapMarker'
import { UserLocation } from './UserLocation'
import { useKakaoMap } from '../../hooks/useKakaoMap'
import { getAvailableSlots } from '../../model'
import type { Shop } from '../../model'
import { hasSearchAreaChanged, type SearchBounds } from '../../lib/shop-search'
import type { KakaoMap } from '../../types/kakao-map'

function readBounds(map: KakaoMap): SearchBounds {
  const bounds = map.getBounds()
  const sw = bounds.getSouthWest()
  const ne = bounds.getNorthEast()
  return { south: sw.getLat(), west: sw.getLng(), north: ne.getLat(), east: ne.getLng() }
}

interface ShopMapProps {
  query: string
  shops: Shop[]
  expanded: boolean
  selectedId?: string
  onSelect: (id: string | null) => void
  onSearchArea: (bounds: SearchBounds) => void
}

export function ShopMap({ query, shops, expanded, selectedId, onSelect, onSearchArea }: ShopMapProps) {
  const { containerRef, instance, status, retry } = useKakaoMap()
  const [areaChanged, setAreaChanged] = useState(false)
  const searchedArea = useRef<{ bounds: SearchBounds; level: number } | null>(null)
  const fittedResults = useRef<Shop[] | null>(null)
  const searching = Boolean(query.trim())

  const searchArea = useCallback(() => {
    if (!instance) return
    const center = instance.map.getCenter()
    flushSync(() => onSelect(null))
    instance.map.relayout()
    instance.map.setCenter(center)
    const bounds = readBounds(instance.map)
    searchedArea.current = { bounds, level: instance.map.getLevel() }
    onSearchArea(bounds)
    setAreaChanged(false)
  }, [instance, onSelect, onSearchArea])

  useEffect(() => {
    if (!instance) return
    const { map, maps } = instance
    const onMove = () => {
      const previous = searchedArea.current
      const changed = Boolean(selectedId) || previous !== null && hasSearchAreaChanged(previous.bounds, readBounds(map), previous.level, map.getLevel())
      setAreaChanged(changed)
      if (changed) onSelect(null)
    }
    maps.event.addListener(map, 'dragend', onMove)
    maps.event.addListener(map, 'zoom_changed', onMove)
    return () => {
      maps.event.removeListener(map, 'dragend', onMove)
      maps.event.removeListener(map, 'zoom_changed', onMove)
    }
  }, [instance, onSelect, selectedId])

  useEffect(() => {
    if (!instance || searching) return
    const bounds = readBounds(instance.map)
    searchedArea.current = { bounds, level: instance.map.getLevel() }
    onSearchArea(bounds)
  }, [instance, onSearchArea, searching])

  useEffect(() => {
    if (!instance || fittedResults.current === shops) return
    fittedResults.current = shops
    if (!searching || !shops.length) return
    const { map, maps } = instance
    map.relayout()
    if (shops.length === 1) {
      map.setLevel(5)
      map.setCenter(new maps.LatLng(shops[0].latitude, shops[0].longitude))
    } else {
      const bounds = new maps.LatLngBounds()
      shops.forEach((shop) => bounds.extend(new maps.LatLng(shop.latitude, shop.longitude)))
      map.setBounds(bounds, 48, 32, 48, 32)
    }
  }, [instance, shops, searching])

  useEffect(() => {
    const shop = shops.find((item) => item.id === selectedId)
    if (instance && shop) {
      instance.map.relayout()
      instance.map.setCenter(new instance.maps.LatLng(shop.latitude, shop.longitude))
    }
  }, [instance, shops, selectedId])

  return <div className="neighborhood-map" aria-label="주변 가게 지도" inert={expanded}>
    <div ref={containerRef} className="kakao-map-canvas" />
    {status !== 'ready' && <div className="map-status" role="status">
      <Icon name="pin" size={24} />
      <strong>{status === 'loading' ? '동네 지도를 불러오고 있어요' : status === 'error' ? '지도를 불러오지 못했어요' : '지도를 준비하고 있어요'}</strong>
      <span>아래 목록에서도 가게를 찾아볼 수 있어요.</span>
      {status === 'error' && <button className="button secondary small" onClick={retry}>다시 시도</button>}
    </div>}
    {instance && shops.map((shop) => {
      const slot = getAvailableSlots(shop)[0]
      return <ShopMapMarker key={shop.id} instance={instance} shop={shop} slot={slot} selected={shop.id === selectedId} onSelect={(id) => { setAreaChanged(false); onSelect(id) }} />
    })}
    {status === 'ready' && <>
      <span className="map-caption">{searching ? '등록 가게 검색 · 반경 10km' : '주변 가게 · 최대 반경 10km'}</span>
      {areaChanged && !selectedId && !searching && <button className="map-search-area" onClick={searchArea}><Icon name="refresh" size={17} />이 지역 재검색</button>}
      {instance && <UserLocation instance={instance} onLocate={searchArea} />}
    </>}
  </div>
}
