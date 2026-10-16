import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { OwnerSchedule } from '../../components/owner/Schedule'
import { dateLabel, DEMO_DAY } from '../../model'
import type { DemoProps } from '../../model'

const dayAt = (day: string, offset: number) => new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10)
const demoWeekStart = dayAt(DEMO_DAY, -((new Date(`${DEMO_DAY}T00:00:00Z`).getUTCDay() + 6) % 7))

export function OwnerHome({ reservations, ownerShop }: DemoProps) {
  const [searchParams] = useSearchParams()
  const requestedDay = searchParams.get('date') ?? ''
  const requestedTime = Date.parse(`${requestedDay}T00:00:00Z`)
  const initialDay = /^\d{4}-\d{2}-\d{2}$/.test(requestedDay) && Number.isFinite(requestedTime) && new Date(requestedTime).toISOString().slice(0, 10) === requestedDay ? requestedDay : DEMO_DAY
  const [selectedDay, setSelectedDay] = useState(initialDay)
  const [weekStart, setWeekStart] = useState(() => dayAt(initialDay, -((new Date(`${initialDay}T00:00:00Z`).getUTCDay() + 6) % 7)))
  const bookings = reservations.filter((item) => item.shopId === ownerShop?.id && item.startsAt.startsWith(selectedDay)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const confirmed = bookings.filter((item) => item.status === 'confirmed')

  function moveWeek(offset: number) {
    setWeekStart(dayAt(weekStart, offset))
    setSelectedDay(dayAt(selectedDay, offset))
  }

  return (
    <div className="page owner-page">
      <div className="owner-greeting">
        <div><p className="eyebrow">{ownerShop?.name ?? '내 가게'} · 사장님</p><h1>오늘도 반가운 만남을<br />준비해 볼까요?</h1></div>
        <span className="owner-shop-mark" aria-hidden="true"><Icon name="store" /></span>
      </div>
      <div className="owner-summary">
        <div><p>{selectedDay === DEMO_DAY ? '오늘' : '선택한 날'} 전체 예약</p><strong>{bookings.length}<small>건</small></strong></div>
        <div><p>남은 확정 예약</p><strong>{confirmed.length}<small>건</small></strong></div>
      </div>
      <div className="owner-date-heading">
        <h2>{new Date(`${selectedDay}T12:00:00+09:00`).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', timeZone: 'Asia/Seoul' })}</h2>
        <div className="owner-date-controls">
          <button className="icon-button" type="button" onClick={() => moveWeek(-7)} aria-label="이전 주"><Icon name="chevron-right" /></button>
          <button className="button secondary small" type="button" onClick={() => { setSelectedDay(DEMO_DAY); setWeekStart(demoWeekStart) }}>오늘</button>
          <button className="icon-button" type="button" onClick={() => moveWeek(7)} aria-label="다음 주"><Icon name="chevron-right" /></button>
        </div>
      </div>
      <div className="owner-week" aria-label="예약 날짜 선택">
        {Array.from({ length: 7 }, (_, index) => {
          const day = dayAt(weekStart, index)
          return <button key={day} type="button" className={`owner-day ${day === selectedDay ? 'selected' : ''} ${day === DEMO_DAY ? 'is-today' : ''}`} aria-label={dateLabel(`${day}T12:00:00+09:00`)} aria-pressed={day === selectedDay} onClick={() => setSelectedDay(day)}><span>{['월', '화', '수', '목', '금', '토', '일'][index]}</span><strong>{Number(day.slice(8))}</strong></button>
        })}
      </div>
      <OwnerSchedule bookings={bookings} day={selectedDay} />
      <p className="owner-demo-note">시연 기준일 · 2026년 10월 16일</p>
    </div>
  )
}
