interface LatLng {
  getLat(): number
  getLng(): number
}

interface LatLngBounds {
  extend(position: LatLng): void
}

export interface KakaoMap {
  getCenter(): LatLng
  setCenter(position: LatLng): void
  getLevel(): number
  setLevel(level: number): void
  setBounds(bounds: LatLngBounds, top: number, right: number, bottom: number, left: number): void
  relayout(): void
}

export interface KakaoMaps {
  load(callback: () => void): void
  Map: new (container: HTMLElement, options: { center: LatLng; level: number }) => KakaoMap
  LatLng: new (latitude: number, longitude: number) => LatLng
  LatLngBounds: new () => LatLngBounds
  CustomOverlay: new (options: {
    map: KakaoMap
    position: LatLng
    content: HTMLElement
    clickable: boolean
    yAnchor: number
  }) => { setMap(map: KakaoMap | null): void }
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
