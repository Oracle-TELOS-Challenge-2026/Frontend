import { useEffect, useState } from 'react'
import { Icon } from '../Icon'
import { searchPlaces, type Place } from '../../lib/kakao-map'

export function PlaceSearch({ query, onChange, onSelect }: { query: string; onChange: (value: string) => void; onSelect: (place: Place) => void }) {
  const [places, setPlaces] = useState<Place[]>([])
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!query.trim() || !open) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void searchPlaces(query, import.meta.env.VITE_KAKAO_MAP_APP_KEY?.trim() ?? '').then((items) => {
        if (cancelled) return
        setPlaces(items)
        setMessage(items.length ? '' : '일치하는 장소가 없어요. 가게 검색 결과는 아래에서 확인해 주세요.')
      }).catch((cause: unknown) => {
        if (!cancelled) setMessage(cause instanceof Error ? cause.message : '장소를 검색하지 못했어요.')
      })
    }, 350)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [query, open, attempt])

  return <div className="place-search" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}>
    <form className="customer-search-row" onSubmit={(event) => { event.preventDefault(); setPlaces([]); setMessage('장소 검색 중…'); setOpen(true); setAttempt((value) => value + 1) }}>
      <div className="search-field"><Icon name="search" size={20} /><input type="search" aria-label="장소, 가게 또는 시술 검색" placeholder="장소·가게·시술 검색" value={query} onFocus={() => { setPlaces([]); setMessage('장소 검색 중…'); setOpen(true) }} onChange={(event) => { setPlaces([]); setMessage('장소 검색 중…'); setOpen(true); onChange(event.target.value) }} />{query && <button type="button" className="search-clear" aria-label="검색어 지우기" onClick={() => { onChange(''); setOpen(false) }}><Icon name="close" size={18} /></button>}</div>
      <button className="button secondary small" type="submit" disabled={!query.trim()}>검색</button>
    </form>
    {open && query.trim() && <div className="place-search-results">
      <div className="place-search-heading"><strong>장소로 이동</strong><button type="button" className="search-clear" aria-label="장소 검색 결과 닫기" onClick={() => setOpen(false)}><Icon name="close" size={18} /></button></div>
      {message && <p role="status">{message}</p>}
      {places.length > 0 && <ul>{places.map((place) => <li key={place.id}><button type="button" onClick={() => { setOpen(false); onSelect(place) }}><Icon name="pin" size={18} /><span><strong>{place.name}</strong><small>{place.address}</small></span></button></li>)}</ul>}
    </div>}
  </div>
}
