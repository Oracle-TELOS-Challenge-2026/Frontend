import { useEffect, useState } from 'react'
import type { Shop } from '../model'
import { readCategories, searchStores } from '../lib/customer-api'
import type { SearchBounds } from '../lib/shop-search'

export function useShopSearch() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [categories, setCategories] = useState<{ code: string; label: string }[]>([])
  const [expanded, setExpanded] = useState(false)
  const [bounds, setBounds] = useState<SearchBounds | null>(null)
  const [results, setResults] = useState<Shop[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError('')
      setResults([])
      void Promise.all([readCategories(controller.signal), searchStores(query, category, bounds, controller.signal)]).then(([options, shops]) => {
        if (controller.signal.aborted) return
        setCategories(options)
        setResults(shops)
      }).catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '가게를 조회하지 못했어요.')
      }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 250)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, category, bounds, attempt])

  return {
    query, category, categories, expanded, results, loading, error, setExpanded, setBounds,
    search: setQuery,
    selectCategory: setCategory,
    retry: () => setAttempt((value) => value + 1),
    reset: () => { setQuery(''); setCategory(''); setExpanded(false) },
  }
}
