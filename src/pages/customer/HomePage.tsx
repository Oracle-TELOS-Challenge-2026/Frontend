import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { PlaceSearch } from '../../components/customer/PlaceSearch'
import type { Place } from '../../lib/kakao-map'
import { ShopMap } from '../../components/customer/ShopMap'
import { ShopResults } from '../../components/customer/ShopResults'
import { useShopSearch } from '../../hooks/useShopSearch'

import { SHOP_CATEGORIES } from '../../data/categories'
import type { SearchBounds } from '../../lib/shop-search'

export function CustomerHome() {
  const { query, category, categories, expanded, results, loading, error, retry, search, selectCategory, setExpanded, setBounds, reset } = useShopSearch()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [place, setPlace] = useState<Place | null>(null)
  const selectedShop = results.find((shop) => shop.id === selectedId)
  const selectShop = useCallback((id: string | null) => { setSelectedId(id); setExpanded(false) }, [setExpanded])
  const searchArea = useCallback((bounds: SearchBounds) => { setBounds(bounds); setSelectedId(null) }, [setBounds])

  return <div className={`customer-home ${selectedShop ? 'has-selected-shop' : ''}`}>
    <div className="customer-toolbar">
      <PlaceSearch query={query} onChange={(value) => { search(value); setSelectedId(null) }} onSelect={(value) => { reset(); setSelectedId(null); setPlace({ ...value }) }} />
      <Link className="account-text-button" to="/customer/waitlist?new=1">문장으로 빈자리 알림 신청하기<Icon name="chevron-right" size={14} /></Link>
      <div className="customer-categories" aria-label="시술 카테고리">{[{ code: '', label: '전체' }, ...categories].map((item) => <button key={item.code} className={`customer-category ${category === item.code ? 'active' : ''}`} aria-pressed={category === item.code} onClick={() => { selectCategory(item.code); setSelectedId(null) }}><Icon name={SHOP_CATEGORIES.find((entry) => entry.code === item.code)?.icon ?? 'grid-2x2'} size={18} />{item.label}</button>)}</div>
    </div>
    <ShopMap place={place} shops={results} expanded={expanded} selectedId={selectedShop?.id} onSelect={selectShop} onSearchArea={searchArea} />
    <ShopResults loading={loading} error={error} onRetry={retry} shops={results} query={query} expanded={expanded} selectedShop={selectedShop} onExpandedChange={setExpanded} onClearSelection={() => setSelectedId(null)} onReset={() => { reset(); setSelectedId(null) }} />
  </div>
}
