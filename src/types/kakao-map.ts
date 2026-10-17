interface LatLng {
  getLat(): number
  getLng(): number
}

interface LatLngBounds {
  extend(position: LatLng): void
  getSouthWest(): LatLng
  getNorthEast(): LatLng
}

export interface KakaoMap {
  getCenter(): LatLng
  getBounds(): LatLngBounds
  setCenter(position: LatLng): void
  getLevel(): number
  setLevel(level: number): void
  setBounds(bounds: LatLngBounds, top: number, right: number, bottom: number, left: number): void
  relayout(): void
}

export interface KakaoMaps {
  load(callback: () => void): void
  services: {
    Status: { OK: string; ZERO_RESULT: string; ERROR: string }
    Places: new () => {
      keywordSearch(query: string, callback: (results: { id: string; place_name: string; address_name: string; x: string; y: string }[], status: string) => void, options?: { size: number }): void
    }
    Geocoder: new () => {
      addressSearch(address: string, callback: (results: { x: string; y: string; road_address: { address_name: string } | null }[], status: string) => void, options?: { size: number }): void
    }
  }
  event: {
    addListener(target: KakaoMap, type: 'dragend' | 'zoom_changed', handler: () => void): void
    removeListener(target: KakaoMap, type: 'dragend' | 'zoom_changed', handler: () => void): void
  }
  Map: new (container: HTMLElement, options: { center: LatLng; level: number }) => KakaoMap
  LatLng: new (latitude: number, longitude: number) => LatLng
  LatLngBounds: new () => LatLngBounds
  CustomOverlay: new (options: {
    map: KakaoMap
    position: LatLng
    content: HTMLElement
    clickable: boolean
    yAnchor: number
  }) => { setMap(map: KakaoMap | null): void; setZIndex(zIndex: number): void; setPosition(position: LatLng): void }
}

export interface KakaoMapInstance {
  map: KakaoMap
  maps: KakaoMaps
}

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps }
  }
}
