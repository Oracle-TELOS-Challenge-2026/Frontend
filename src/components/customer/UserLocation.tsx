import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icon'
import type { KakaoMapInstance } from '../../types/kakao-map'

export function UserLocation({ instance, onLocate }: { instance: KakaoMapInstance; onLocate: () => void }) {
  const [watching, setWatching] = useState(false)
  const [message, setMessage] = useState('')
  const latestPosition = useRef<GeolocationCoordinates | null>(null)
  const centerOnFix = useRef(false)
  const onLocateRef = useRef(onLocate)

  useEffect(() => { onLocateRef.current = onLocate }, [onLocate])

  useEffect(() => {
    if (!watching) return
    const { map, maps } = instance
    let active = true
    let dot: InstanceType<typeof maps.CustomOverlay> | undefined
    const content = document.createElement('div')
    content.className = 'user-location-dot'
    content.setAttribute('role', 'img')
    content.setAttribute('aria-label', '내 현재 위치')

    const watchId = navigator.geolocation.watchPosition(({ coords }) => {
      if (!active) return
      latestPosition.current = coords
      const position = new maps.LatLng(coords.latitude, coords.longitude)
      if (!dot) {
        dot = new maps.CustomOverlay({ map, content, position, clickable: false, yAnchor: 0.5 })
        dot.setZIndex(3)
      } else {
        dot.setPosition(position)
      }
      setMessage('')
      if (centerOnFix.current) {
        centerOnFix.current = false
        map.relayout()
        map.setLevel(4)
        map.setCenter(position)
        onLocateRef.current()
      }
    }, (error) => {
      if (!active) return
      latestPosition.current = null
      setWatching(false)
      setMessage(error.code === 1 ? '위치 권한이 꺼져 있어요. 브라우저 설정에서 위치를 허용한 뒤 다시 눌러 주세요.' : error.code === 3 ? '위치 확인이 늦어지고 있어요. 내 위치 버튼을 다시 눌러 주세요.' : '현재 위치를 확인할 수 없어요. 기기의 위치 설정을 확인하고 다시 눌러 주세요.')
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })

    return () => {
      active = false
      navigator.geolocation.clearWatch(watchId)
      dot?.setMap(null)
      latestPosition.current = null
    }
  }, [instance, watching])

  const locate = () => {
    if (!navigator.geolocation) {
      setMessage('이 브라우저에서는 위치를 사용할 수 없어요. 위치를 지원하는 브라우저에서 열어 주세요.')
      return
    }
    const coords = latestPosition.current
    if (coords) {
      const { map, maps } = instance
      map.relayout()
      map.setLevel(4)
      map.setCenter(new maps.LatLng(coords.latitude, coords.longitude))
      onLocate()
    } else {
      centerOnFix.current = true
      setMessage('현재 위치를 확인하고 있어요…')
      setWatching(true)
    }
  }

  return <>
    <button type="button" className="map-location-button" onClick={locate} aria-label="내 현재 위치로 이동"><Icon name="locate" size={22} /><span>내 위치</span></button>
    {message && <p className="map-location-status" role="status">{message}</p>}
  </>
}
