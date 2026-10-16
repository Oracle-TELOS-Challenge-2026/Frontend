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
  selectedShop?: Shop
  onExpandedChange: (expanded: boolean) => void
  onClearSelection: () => void
  onReset: () => void
}

export function ShopResults({ shops, reservations, query, expanded, selectedShop, onExpandedChange, onClearSelection, onReset }: ShopResultsProps) {
  const dragHandlers = useSheetDrag(expanded, onExpandedChange)
  return <section className={`shop-results ${expanded ? 'expanded' : ''}`} aria-label="주변 가게 검색 결과">
    <button className="map-list-toggle" aria-expanded={expanded} aria-controls="shop-results-list" onClick={() => onExpandedChange(!expanded)}><Icon name={expanded ? 'pin' : 'list'} size={19} />{expanded ? '지도 보기' : '목록 보기'}{!expanded && <span>{shops.length}</span>}</button>
    <button className="sheet-handle" aria-label={expanded ? '검색 결과 접기' : '검색 결과 펼치기'} aria-expanded={expanded} aria-controls="shop-results-list" {...dragHandlers}><span /></button>
    <div className="results-heading">
      <div aria-live="polite"><h2>{selectedShop && !expanded ? '선택한 가게' : `${query.trim() ? '검색 결과' : '이 지역 가게'} ${shops.length}곳`}</h2><p>{selectedShop && !expanded ? `${selectedShop.name} · 카드를 눌러 예약 시간을 확인하세요` : query.trim() ? `“${query.trim()}” 검색 결과` : '특가는 코랄색 테두리로 확인해요'}</p></div>
      {selectedShop && !expanded ? <button className="selection-close" aria-label="가게 선택 해제" onClick={onClearSelection}><Icon name="close" size={20} /></button> : <button className="results-expand" onClick={() => onExpandedChange(!expanded)} aria-label={expanded ? '검색 결과 접기' : '검색 결과 펼치기'}><Icon name="chevron-down" size={20} /></button>}
    </div>
    <div id="shop-results-list" hidden={!expanded && !selectedShop}>{expanded ? shops.length ? shops.map((shop) => <ShopCard key={shop.id} shop={shop} slot={getAvailableSlots(shop, reservations)[0]} />) : <div className="empty-state"><Icon name="search" size={30} /><h3>이 지역에 맞는 가게가 없어요</h3><p>검색 조건을 바꾸거나 지도를 옮겨 다시 검색해 보세요.</p><button className="button secondary small" onClick={onReset}>검색 조건 초기화</button></div> : selectedShop && <ShopCard shop={selectedShop} slot={getAvailableSlots(selectedShop, reservations)[0]} />}</div>
  </section>
}
