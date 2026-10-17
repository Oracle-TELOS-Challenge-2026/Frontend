import type { CategoryCode } from '../types.ts'

// shortcut: 업로드가 없는 가게는 카테고리 예시 6장을 사용하며, 실제 사진이 생기면 서버 이미지를 우선한다.
export function categoryImage(storeId: string, category: CategoryCode): string {
  let hash = 0
  for (const character of storeId) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0
  return `/images/shops/${category.toLowerCase()}-${hash % 6 + 1}.webp`
}
