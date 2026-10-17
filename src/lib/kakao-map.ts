import type { KakaoMaps } from '../types/kakao-map.ts'

let sdkPromise: Promise<KakaoMaps> | undefined

export function loadKakaoMaps(appKey: string): Promise<KakaoMaps> {
  if (!appKey.trim()) return Promise.reject(new Error('Kakao Maps JavaScript key is missing'))
  if (window.kakao?.maps?.Map && window.kakao.maps.services?.Geocoder) return Promise.resolve(window.kakao.maps)
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
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey.trim())}&autoload=false&libraries=services`
    script.onerror = () => finish(new Error('Kakao Maps SDK request failed'))
    script.onload = () => {
      try {
        if (!window.kakao?.maps?.load) throw new Error('Kakao Maps SDK is unavailable')
        window.kakao.maps.load(() => {
          finish(window.kakao?.maps?.Map && window.kakao.maps.services?.Geocoder ? undefined : new Error('Kakao Maps SDK did not initialize'))
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

export interface RoadAddress {
  address: string
  latitude: number
  longitude: number
}

export async function searchRoadAddresses(query: string, appKey: string): Promise<RoadAddress[]> {
  if (!query.trim()) throw new Error('도로명과 건물번호를 입력해 주세요.')
  if (!appKey.trim()) throw new Error('주소 검색 설정이 없어 검색할 수 없어요. 관리자에게 문의해 주세요.')
  const maps = await loadKakaoMaps(appKey).catch(() => { throw new Error('주소 검색을 불러오지 못했어요. 잠시 후 다시 검색해 주세요.') })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('주소 검색이 지연되고 있어요. 다시 검색해 주세요.')), 15000)
    try {
      new maps.services.Geocoder().addressSearch(query.trim(), (results, status) => {
        clearTimeout(timer)
        if (status === maps.services.Status.ZERO_RESULT) { resolve([]); return }
        if (status !== maps.services.Status.OK) { reject(new Error('주소를 검색하지 못했어요. 잠시 후 다시 시도해 주세요.')); return }
        if (!Array.isArray(results)) { reject(new Error('주소 검색 결과를 확인하지 못했어요. 다시 검색해 주세요.')); return }
        const addresses = results.filter((item) => item && typeof item.road_address?.address_name === 'string' && item.road_address.address_name.trim() && typeof item.x === 'string' && item.x.trim() && typeof item.y === 'string' && item.y.trim()).map((item) => ({ address: item.road_address!.address_name, latitude: Number(item.y), longitude: Number(item.x) }))
        if (addresses.some((item) => !Number.isFinite(item.latitude) || Math.abs(item.latitude) > 90 || !Number.isFinite(item.longitude) || Math.abs(item.longitude) > 180)) { reject(new Error('주소의 위치를 확인하지 못했어요. 다시 검색해 주세요.')); return }
        resolve(addresses)
      }, { size: 10 })
    } catch {
      clearTimeout(timer)
      reject(new Error('주소 검색을 시작하지 못했어요. 다시 검색해 주세요.'))
    }
  })
}

export interface Place {
  id: string
  name: string
  address: string
  latitude: number
  longitude: number
}

export async function searchPlaces(query: string, appKey: string): Promise<Place[]> {
  if (!query.trim()) return []
  if (!appKey.trim()) throw new Error('장소 검색 설정이 없어 검색할 수 없어요.')
  const maps = await loadKakaoMaps(appKey).catch(() => { throw new Error('장소 검색을 불러오지 못했어요. 다시 시도해 주세요.') })
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('장소 검색이 지연되고 있어요. 다시 시도해 주세요.')), 15000)
    try {
      new maps.services.Places().keywordSearch(query.trim(), (results, status) => {
        clearTimeout(timer)
        if (status === maps.services.Status.ZERO_RESULT) { resolve([]); return }
        if (status !== maps.services.Status.OK) { reject(new Error('장소를 검색하지 못했어요. 다시 시도해 주세요.')); return }
        if (!Array.isArray(results)) { reject(new Error('장소 검색 결과를 확인하지 못했어요.')); return }
        const places = results.filter((item) => item && typeof item.id === 'string' && item.id && typeof item.place_name === 'string' && item.place_name.trim() && typeof item.address_name === 'string' && typeof item.x === 'string' && item.x.trim() && typeof item.y === 'string' && item.y.trim()).map((item) => ({ id: item.id, name: item.place_name, address: item.address_name, latitude: Number(item.y), longitude: Number(item.x) }))
        if (places.some((item) => !Number.isFinite(item.latitude) || Math.abs(item.latitude) > 90 || !Number.isFinite(item.longitude) || Math.abs(item.longitude) > 180)) { reject(new Error('장소의 위치를 확인하지 못했어요.')); return }
        resolve(places)
      }, { size: 5 })
    } catch {
      clearTimeout(timer)
      reject(new Error('장소 검색을 시작하지 못했어요. 다시 시도해 주세요.'))
    }
  })
}
