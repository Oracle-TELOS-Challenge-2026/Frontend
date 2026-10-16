import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { ShopMap } from '../../components/customer/ShopMap'
import { ShopResults } from '../../components/customer/ShopResults'
import { useShopSearch } from '../../hooks/useShopSearch'

import { SHOP_CATEGORIES } from '../../data/categories'
import type { SearchBounds } from '../../lib/shop-search'

export function CustomerHome() {
  const { query, category, categories, expanded, results, loading, error, retry, search, selectCategory, setExpanded, setBounds, reset } = useShopSearch()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedShop = results.find((shop) => shop.id === selectedId)
  const selectShop = useCallback((id: string | null) => { setSelectedId(id); setExpanded(false) }, [setExpanded])
  const searchArea = useCallback((bounds: SearchBounds) => { setBounds(bounds); setSelectedId(null) }, [setBounds])

  return <div className={`customer-home ${selectedShop ? 'has-selected-shop' : ''}`}>
    <div className="customer-toolbar">
      <div className="customer-search-row">
        <div className="search-field"><Icon name="search" size={20} /><input type="search" aria-label="가게 또는 시술 검색" placeholder="가게·시술 검색" value={query} onChange={(event) => { search(event.target.value); setSelectedId(null) }} />{query && <button className="search-clear" aria-label="검색어 지우기" onClick={() => { search(''); setSelectedId(null) }}><Icon name="close" size={18} /></button>}</div>
      </div>
      <Link className="account-text-button" to="/customer/waitlist?new=1">문장으로 빈자리 알림 신청하기<Icon name="chevron-right" size={14} /></Link>
      <div className="customer-categories" aria-label="시술 카테고리">{[{ code: '', label: '전체' }, ...categories].map((item) => <button key={item.code} className={`customer-category ${category === item.code ? 'active' : ''}`} aria-pressed={category === item.code} onClick={() => { selectCategory(item.code); setSelectedId(null) }}><Icon name={SHOP_CATEGORIES.find((entry) => entry.code === item.code)?.icon ?? 'grid-2x2'} size={18} />{item.label}</button>)}</div>
    </div>
    <ShopMap shops={results} expanded={expanded} selectedId={selectedShop?.id} onSelect={selectShop} onSearchArea={searchArea} />
    <ShopResults loading={loading} error={error} onRetry={retry} shops={results} query={query} expanded={expanded} selectedShop={selectedShop} onExpandedChange={setExpanded} onClearSelection={() => setSelectedId(null)} onReset={() => { reset(); setSelectedId(null) }} />
  </div>
}
