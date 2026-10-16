import { Icon } from '../../components/Icon'
import { ShopMap } from '../../components/customer/ShopMap'
import { ShopResults } from '../../components/customer/ShopResults'
import { useShopSearch } from '../../hooks/useShopSearch'
import type { DemoProps } from '../../model'

const categories = [{ name: '전체', icon: '✨' }, { name: '네일', icon: '💅' }, { name: '헤어', icon: '✂️' }, { name: '속눈썹', icon: '👀' }, { name: '피부관리', icon: '🧖' }]

export function CustomerHome({ shops, reservations }: DemoProps) {
  const { query, category, expanded, results, search, selectCategory, setExpanded, reset } = useShopSearch(shops)

  return <div className="customer-home">
    <div className="customer-toolbar">
      <div className="customer-location"><Icon name="pin" size={19} /><span>성수동</span><small>나를 위한 작은 틈</small></div>
      <div className="search-field"><Icon name="search" size={19} /><input type="search" aria-label="가게 또는 시술 검색" placeholder="어떤 가게를 찾고 있나요?" value={query} onChange={(event) => search(event.target.value)} />{query && <button className="search-clear" aria-label="검색어 지우기" onClick={() => search('')}><Icon name="close" size={16} /></button>}</div>
      <div className="customer-categories" aria-label="시술 카테고리">{categories.map((item) => <button key={item.name} className={`customer-category ${category === item.name ? 'active' : ''}`} aria-pressed={category === item.name} onClick={() => selectCategory(item.name)}><span aria-hidden="true">{item.icon}</span>{item.name}</button>)}</div>
    </div>
    <ShopMap shops={results} reservations={reservations} />
    <ShopResults shops={results} reservations={reservations} query={query} expanded={expanded} onExpandedChange={setExpanded} onReset={reset} />
  </div>
}
