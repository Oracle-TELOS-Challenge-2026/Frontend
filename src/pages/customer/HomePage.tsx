import { useCallback, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Brand } from '../../components/Brand'
import { AccountActions } from '../../components/AccountActions'
import { ShopMap } from '../../components/customer/ShopMap'
import { ShopResults } from '../../components/customer/ShopResults'
import { useShopSearch } from '../../hooks/useShopSearch'
import { getAvailableSlots, type DemoProps } from '../../model'

import { SHOP_CATEGORIES } from '../../data/categories'
import type { SearchBounds } from '../../lib/shop-search'

export function CustomerHome({ shops, reservations, onSwitch }: DemoProps & { onSwitch: () => void }) {
  const { query, category, expanded, results, search, selectCategory, setExpanded, setBounds, reset } = useShopSearch(shops)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selectedShop = results.find((shop) => shop.id === selectedId && getAvailableSlots(shop, reservations).length > 0)
  const selectShop = useCallback((id: string | null) => { setSelectedId(id); setExpanded(false) }, [setExpanded])
  const searchArea = useCallback((bounds: SearchBounds) => { setBounds(bounds); setSelectedId(null) }, [setBounds])

  return <div className={`customer-home ${selectedShop ? 'has-selected-shop' : ''}`}>
    <div className="customer-toolbar">
      <div className="customer-home-heading"><Brand /><AccountActions role="customer" onSwitch={onSwitch} /></div>
      <div className="customer-search-row">
        <div className="search-field"><Icon name="search" size={20} /><input type="search" aria-label="가게 또는 시술 검색" placeholder="가게·시술 검색" value={query} onChange={(event) => { search(event.target.value); setSelectedId(null) }} />{query && <button className="search-clear" aria-label="검색어 지우기" onClick={() => { search(''); setSelectedId(null) }}><Icon name="close" size={18} /></button>}</div>
      </div>
      <div className="customer-categories" aria-label="시술 카테고리">{SHOP_CATEGORIES.map((item) => <button key={item.name} className={`customer-category ${category === item.name ? 'active' : ''}`} aria-pressed={category === item.name} onClick={() => { selectCategory(item.name); setSelectedId(null) }}><Icon name={item.icon} size={18} />{item.name}</button>)}</div>
    </div>
    <ShopMap shops={results} reservations={reservations} expanded={expanded} selectedId={selectedShop?.id} onSelect={selectShop} onSearchArea={searchArea} />
    <ShopResults shops={results} reservations={reservations} query={query} expanded={expanded} selectedShop={selectedShop} onExpandedChange={setExpanded} onClearSelection={() => setSelectedId(null)} onReset={() => { reset(); setSelectedId(null) }} />
  </div>
}
