import type { Shop } from '../types.ts'

export interface SearchBounds {
  south: number
  west: number
  north: number
  east: number
}

export function hasSearchAreaChanged(previous: SearchBounds, current: SearchBounds, previousLevel: number, currentLevel: number): boolean {
  const tolerance = 1e-10 // 좌표의 부동소수점 오차로 정확히 25% 이동한 경계를 넘지 않게 한다.
  const latitudeDelta = Math.abs((current.south + current.north - previous.south - previous.north) / 2)
  const longitudeDelta = Math.abs((current.west + current.east - previous.west - previous.east) / 2)
  return previousLevel !== currentLevel
    || latitudeDelta > (previous.north - previous.south) * 0.25 + tolerance
    || longitudeDelta > (previous.east - previous.west) * 0.25 + tolerance
}

export function filterShops(shops: Shop[], query: string, category: string, bounds: SearchBounds | null) {
  const term = query.trim().toLocaleLowerCase()
  return shops.filter((shop) =>
    (category === '전체' || shop.category === category)
    && `${shop.name} ${shop.category} ${shop.service} ${shop.address}`.toLocaleLowerCase().includes(term)
    && (!bounds || (shop.latitude >= bounds.south && shop.latitude <= bounds.north
      && shop.longitude >= bounds.west && shop.longitude <= bounds.east)),
  )
}
