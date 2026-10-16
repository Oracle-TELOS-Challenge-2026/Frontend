export type Role = 'customer' | 'owner'
export type DiscountMode = 'percent' | 'amount'
export type CategoryCode = 'NAIL' | 'HAIR' | 'EYELASH' | 'SKIN'

export interface ShopRegistration {
  name: string
  description?: string
  category: string
  address: string
  latitude: number
  longitude: number
  openingHours: { dayOfWeek: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN'; opensAt: string | null; closesAt: string | null; closed: boolean }[]
  service: string
  originalPrice: number
  duration: number
}

export interface RegisteredShop extends ShopRegistration {
  id: string
  serviceId?: string
  version: number
}

export interface AccountState {
  role: Role | null
  shop: RegisteredShop | null
  preferences: string
}

export interface StoreService {
  id: string
  name: string
  category: CategoryCode
  durationMinutes: number
  basePrice: number
  active: boolean
  version: number
}

export interface Slot {
  id: string
  serviceId: string
  startsAt: string
  endsAt?: string
  service: string
  price: number
  originalPrice: number
  version?: number
}

export interface Shop {
  id: string
  name: string
  category: string
  categoryCode: CategoryCode
  image: string
  address: string
  distance: string
  rating: string
  description: string
  service: string
  originalPrice: number | null
  duration: number | null
  latitude: number
  longitude: number
  slots: Slot[]
  services: StoreService[]
}

export interface Reservation extends Slot {
  shopId: string
  shopName: string
  shopImage: string
  duration: number
  status: 'CONFIRMED' | 'COMPLETED' | 'CANCELED' | 'NO_SHOW'
  createdAt: string
  version: number
  allowedActions: string[]
}

export interface WaitlistConditions {
  storeId: string | null
  category: CategoryCode
  serviceId: string | null
  windowStart: string
  windowEnd: string
  location: { latitude: number; longitude: number } | null
  radiusMeters: number | null
  maxPrice: number | null
  keywords: string[]
}

export interface WaitlistItem {
  id: string
  status: 'ACTIVE' | 'FULFILLED' | 'CANCELED' | 'EXPIRED'
  availability: 'WAITING' | 'AVAILABLE' | 'CLOSED'
  conditions: WaitlistConditions
  store: { id: string; name: string; imageUrl: string | null } | null
  service: { id: string; name: string; imageUrl: string | null } | null
  offers: (Slot & { shopId: string; shopName: string; image: string })[]
  createdAt: string
  version: number
}
