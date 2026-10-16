import { useEffect, useRef, useState } from 'react'
import { loadKakaoMaps } from '../lib/kakao-map'
import type { KakaoMapInstance } from '../types/kakao-map'
import { DEMO_MAP_CENTER } from '../data/demo'

const appKey = import.meta.env.VITE_KAKAO_MAP_APP_KEY?.trim() ?? ''

export function useKakaoMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [instance, setInstance] = useState<KakaoMapInstance | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!appKey || !container) return
    let cancelled = false
    let observer: ResizeObserver | undefined

    loadKakaoMaps(appKey).then((maps) => {
      if (cancelled) return
      const map = new maps.Map(container, { center: new maps.LatLng(DEMO_MAP_CENTER.latitude, DEMO_MAP_CENTER.longitude), level: 5 })
      // 핀에 초점을 맞출 때 브라우저가 지도 내부를 스크롤하지 않도록 한다.
      container.style.overflow = 'clip'
      observer = new ResizeObserver(() => {
        const center = map.getCenter()
        map.relayout()
        map.setCenter(center)
      })
      observer.observe(container)
      setInstance({ map, maps })
    }).catch(() => {
      if (!cancelled) setFailed(true)
    })

    return () => {
      cancelled = true
      observer?.disconnect()
      container.replaceChildren()
    }
  }, [attempt])

  return {
    containerRef,
    instance,
    status: !appKey ? 'unconfigured' : failed ? 'error' : instance ? 'ready' : 'loading',
    retry: () => { setFailed(false); setAttempt((value) => value + 1) },
  }
}
