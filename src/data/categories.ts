import type { CategoryCode } from '../types.ts'

export const CATEGORY_LABELS: Record<CategoryCode, string> = { NAIL: '네일', HAIR: '헤어', EYELASH: '속눈썹', SKIN: '피부관리' }
export const SHOP_CATEGORIES = [
  { code: '', name: '전체', icon: 'grid-2x2' },
  { code: 'NAIL', name: '네일', icon: 'hand' },
  { code: 'HAIR', name: '헤어', icon: 'scissors' },
  { code: 'EYELASH', name: '속눈썹', icon: 'eye' },
  { code: 'SKIN', name: '피부관리', icon: 'sparkles' },
] as const
