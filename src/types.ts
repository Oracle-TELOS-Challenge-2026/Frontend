export type Role = 'customer' | 'owner'
export type DiscountMode = 'percent' | 'amount'

export interface ShopRegistration {
  name: string
  category: string
  address: string
  phone: string
  service: string
  originalPrice: number
  duration: number
}

export interface RegisteredShop extends ShopRegistration {
  id: string
}

export interface AccountState {
  role: Role | null
  shop: RegisteredShop | null
  preferences: string
}

export interface Slot {
  startsAt: string
  service: string
  price: number
  originalPrice: number
  cancellationId?: string
}

export interface Shop {
  id: string
  name: string
  category: string
  image: string
  address: string
  distance: string
  rating: string
  description: string
  service: string
  originalPrice: number
  duration: number
  latitude: number
  longitude: number
  slots: Slot[]
}

export interface Reservation extends Slot {
  id: string
  shopId: string
  customerId: string
  customerName: string
  duration: number
  status: 'confirmed' | 'completed'
  createdAt: string
  hiddenFromCustomer?: boolean
}

export interface WaitlistItem {
  id: string
  shopId: string
  preferredDate: string
  preferredTime: string
  createdAt: string
}

export interface Cancellation {
  id: string
  shopId: string
  startsAt: string
  service: string
  originalPrice: number
  reason: '예약 취소' | '노쇼'
  createdAt: string
  publishedAt?: string
  price?: number
}

export interface ChatBookingInput {
  service: string
  startsAt: string
  duration: number
  price: number
}

export interface ChatBookingProposal extends ChatBookingInput {
  sourceMessageId: string
  reservationId?: string
}

export interface Message {
  id: string
  sender: Role
  body: string
  sentAt: string
  proposal?: ChatBookingProposal
}

export interface Conversation {
  id: string
  shopId: string
  customerId: string
  customerName: string
  avatar: string
  unread: number
  messages: Message[]
}

export interface DemoState {
  shops: Shop[]
  reservations: Reservation[]
  waitlist: WaitlistItem[]
  cancellations: Cancellation[]
  conversations: Conversation[]
}

export interface DemoProps extends DemoState {
  ownerShop: RegisteredShop | null
  onReserve: (shopId: string, startsAt: string) => boolean
  onWaitlist: (shopId: string, preferredDate: string, preferredTime: string) => boolean
  onUpdateWaitlist: (id: string, preferredDate: string, preferredTime: string) => boolean
  onRemoveWaitlist: (id: string) => void
  onRemoveReservation: (id: string) => void
  onPublish: (id: string, service: string, mode: DiscountMode, value: number) => boolean
  onSendMessage: (conversationId: string, body: string, role: Role) => void
  onReadConversation: (id: string) => void
  onStartDemoConversation: () => string | null
  onProposeBooking: (conversationId: string, sourceMessageId: string, input: ChatBookingInput) => boolean
  onConfirmBooking: (conversationId: string, messageId: string) => boolean
}
