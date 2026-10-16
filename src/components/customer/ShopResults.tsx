import { Icon } from '../Icon'
import { getAvailableSlots } from '../../model'
import type { Reservation, Shop } from '../../model'
import { useSheetDrag } from '../../hooks/useSheetDrag'
import { ShopCard } from './ShopCard'

interface ShopResultsProps {
  shops: Shop[]
  reservations: Reservation[]
  query: string
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  onReset: () => void
}

export function ShopResults({ shops, reservations, query, expanded, onExpandedChange, onReset }: ShopResultsProps) {
  const dragHandlers = useSheetDrag(expanded, onExpandedChange)
  return <section className={`shop-results ${expanded ? 'expanded' : ''}`} aria-label="주변 가게 검색 결과">
    <button className="sheet-handle" aria-label={expanded ? '검색 결과 접기' : '검색 결과 펼치기'} aria-expanded={expanded} aria-controls="shop-results-list" {...dragHandlers}><span /></button>
    <div className="results-heading">
      <div><h2>{query.trim() ? '찾고 있던 가게' : '지금 만나는, 작은 행운'} <span>✦</span></h2><p aria-live="polite">{query.trim() ? `“${query.trim()}” 검색 결과 ${shops.length}곳` : `가까운 가게 ${shops.length}곳에서 나만의 시간을 찾아요`}</p></div>
      <span><Icon name="pin" size={12} />성수동 주변</span>
    </div>
    <div id="shop-results-list">{shops.length ? shops.map((shop) => <ShopCard key={shop.id} shop={shop} slot={getAvailableSlots(shop, reservations)[0]} />) : <div className="empty-state"><Icon name="search" size={30} /><h3>아직 찾는 가게가 없어요</h3><p>가게 이름이나 시술 이름을 바꿔 검색해 보세요.</p><button className="button secondary small" onClick={onReset}>전체 가게 보기</button></div>}</div>
  </section>
}
