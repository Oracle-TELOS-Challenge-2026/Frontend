import { SHOP_CATEGORIES } from '../data/categories.ts'
import type { AccountState, ShopRegistration } from '../types.ts'

export const ACCOUNT_STORAGE_KEY = 'bintime.account.v1'

export function validateShopRegistration(input: ShopRegistration): string | null {
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 60) return '가게 이름을 60자 이내로 입력해 주세요.'
  if (!SHOP_CATEGORIES.some((item) => item.name !== '전체' && item.name === input.category)) return '가게 업종을 선택해 주세요.'
  if (typeof input.address !== 'string' || !input.address.trim() || input.address.trim().length > 200) return '가게 주소를 200자 이내로 입력해 주세요.'
  if (typeof input.phone !== 'string' || !/^[0-9\s-]+$/.test(input.phone) || !/^0\d{8,10}$/.test(input.phone.replace(/[\s-]/g, ''))) return '연락 가능한 전화번호를 확인해 주세요.'
  if (typeof input.service !== 'string' || !input.service.trim() || input.service.trim().length > 100) return '대표 시술을 100자 이내로 입력해 주세요.'
  if (!Number.isInteger(input.originalPrice) || input.originalPrice < 1 || input.originalPrice > 10000000) return '시술 가격을 1원부터 1,000만 원 사이로 입력해 주세요.'
  if (!Number.isInteger(input.duration) || input.duration < 10 || input.duration > 480) return '소요 시간을 10분부터 480분 사이로 입력해 주세요.'
  return null
}

export function parseAccount(raw: string | null): AccountState {
  const empty: AccountState = { role: null, shop: null, preferences: '' }
  if (!raw) return empty
  try {
    const saved = JSON.parse(raw)
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return empty
    const role = saved.role === 'owner' || saved.role === 'customer' ? saved.role : null
    const shop = saved.shop && typeof saved.shop.id === 'string' && saved.shop.id.startsWith('registered-') && !validateShopRegistration(saved.shop) ? saved.shop : null
    const preferences = typeof saved.preferences === 'string' && saved.preferences.length <= 2000 ? saved.preferences : ''
    return { role, shop, preferences }
  } catch {
    return empty
  }
}

export function accountStartPath(account: AccountState): string {
  if (!account.role) return '/login'
  return account.role === 'owner' && !account.shop ? '/owner/register' : `/${account.role}`
}
