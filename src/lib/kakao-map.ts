import type { KakaoMaps } from '../types/kakao-map.ts'

let sdkPromise: Promise<KakaoMaps> | undefined

export function loadKakaoMaps(appKey: string): Promise<KakaoMaps> {
  if (!appKey.trim()) return Promise.reject(new Error('Kakao Maps JavaScript key is missing'))
  if (window.kakao?.maps?.Map) return Promise.resolve(window.kakao.maps)
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise<KakaoMaps>((resolve, reject) => {
    const script = document.createElement('script')
    let settled = false
    const timer = setTimeout(() => finish(new Error('Kakao Maps SDK timed out')), 15000)

    function finish(error?: Error) {
      if (settled) return
      settled = true
      clearTimeout(timer)
      script.onload = null
      script.onerror = null
      if (error) {
        script.remove()
        reject(error)
      } else {
        resolve(window.kakao!.maps)
      }
    }

    script.async = true
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey.trim())}&autoload=false`
    script.onerror = () => finish(new Error('Kakao Maps SDK request failed'))
    script.onload = () => {
      try {
        if (!window.kakao?.maps?.load) throw new Error('Kakao Maps SDK is unavailable')
        window.kakao.maps.load(() => {
          finish(window.kakao?.maps?.Map ? undefined : new Error('Kakao Maps SDK did not initialize'))
        })
      } catch {
        finish(new Error('Kakao Maps SDK initialization failed'))
      }
    }
    document.head.appendChild(script)
  }).catch((error: unknown) => {
    sdkPromise = undefined
    throw error
  })

  return sdkPromise
}
