import { useState } from 'react'
import type { Shop } from '../model'

export function useShopSearch(shops: Shop[]) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('전체')
  const [expanded, setExpanded] = useState(false)
  const results = shops.filter((shop) => (category === '전체' || shop.category === category) && `${shop.name} ${shop.category} ${shop.service} ${shop.address}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  return {
    query, category, expanded, results, setExpanded,
    search: (value: string) => { setQuery(value); setExpanded(Boolean(value)) },
    selectCategory: (value: string) => { setCategory(value); setExpanded(value !== '전체' || Boolean(query.trim())) },
    reset: () => { setQuery(''); setCategory('전체'); setExpanded(false) },
  }
}
