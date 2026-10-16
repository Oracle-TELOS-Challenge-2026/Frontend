import { useMemo, useState } from 'react'
import type { Shop } from '../model'
import { filterShops, type SearchBounds } from '../lib/shop-search'

export function useShopSearch(shops: Shop[]) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('전체')
  const [expanded, setExpanded] = useState(false)
  const [bounds, setBounds] = useState<SearchBounds | null>(null)
  const results = useMemo(() => filterShops(shops, query, category, bounds), [shops, category, query, bounds])

  return {
    query, category, expanded, results, setExpanded, setBounds,
    search: setQuery,
    selectCategory: setCategory,
    reset: () => { setQuery(''); setCategory('전체'); setExpanded(false) },
  }
}
