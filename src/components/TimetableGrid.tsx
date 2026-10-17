import type { CSSProperties, ReactNode } from 'react'
import { timeLabel } from '../lib/format'

export function TimetableGrid<T extends { startAt: string; endAt: string }>({ day, hours, bookings, renderBooking }: {
  day: string
  hours?: { closed: boolean; opensAt: string | null; closesAt: string | null }
  bookings: T[]
  renderBooking: (booking: T, style: CSSProperties) => ReactNode
}) {
  const dayStart = Date.parse(`${day}T00:00:00+09:00`)
  const hourAt = (time: string) => (Date.parse(time) - dayStart) / 3600000
  const openHours = hours && !hours.closed && hours.opensAt && hours.closesAt ? [hourAt(`${day}T${hours.opensAt}+09:00`), hourAt(`${day}T${hours.closesAt}+09:00`)] : []
  const firstHour = Math.min(...openHours, ...bookings.map((booking) => hourAt(booking.startAt)))
  const lastHour = Math.max(...openHours, ...bookings.map((booking) => hourAt(booking.endAt)))
  if (!(lastHour > firstHour)) return null
  const ticks = [...Array.from({ length: Math.ceil(lastHour - firstHour) }, (_, index) => firstHour + index).filter((hour, index) => index === 0 || lastHour - hour >= 0.25), lastHour]
  const hourHeight = Math.max(72, 36 / (lastHour - firstHour))

  return <div className="owner-timetable" style={{ height: (lastHour - firstHour) * hourHeight }}>
    {ticks.map((hour) => <div key={hour} className="owner-hour" style={{ top: (hour - firstHour) * hourHeight }}><span>{timeLabel(new Date(dayStart + hour * 3600000).toISOString())}</span></div>)}
    {bookings.map((booking) => renderBooking(booking, { top: (hourAt(booking.startAt) - firstHour) * hourHeight + 3, height: Math.max(24, (hourAt(booking.endAt) - hourAt(booking.startAt)) * hourHeight - 6) }))}
  </div>
}
