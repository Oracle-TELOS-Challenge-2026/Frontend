import { useState } from 'react'
import { Icon } from '../Icon'
import { TimetableGrid } from '../TimetableGrid'
import { OwnerReservationDialog } from './ReservationDialog'
import { timeLabel, todayInSeoul } from '../../lib/format'
import type { OwnerReservation, OwnerReservationDetail } from '../../lib/owner-api'
import type { RegisteredShop } from '../../types'

const statusLabel = { PENDING: '사장님 확인 대기', REJECTED: '신청 마감', WITHDRAWN: '신청 철회', EXPIRED: '신청 만료', CONFIRMED: '예약 확정', COMPLETED: '시술 완료', CANCELED: '예약 취소', NO_SHOW: '노쇼' }

export function OwnerSchedule({ storeId, bookings, day, openingHours, onUpdated, onConflict }: { storeId: string; bookings: OwnerReservation[]; day: string; openingHours: RegisteredShop['openingHours']; onUpdated: (reservation: OwnerReservationDetail) => void; onConflict?: () => void }) {
  const [selectedBooking, setSelectedBooking] = useState<OwnerReservation | null>(null)
  const sorted = [...bookings].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))
  const scheduled = sorted.filter((booking) => booking.status === 'CONFIRMED' || booking.status === 'COMPLETED')
  const canceled = sorted.filter((booking) => booking.status === 'CANCELED' || booking.status === 'NO_SHOW')
  const weekday = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date(`${day}T00:00:00Z`).getUTCDay()]
  const hours = openingHours.find((hours) => hours.dayOfWeek === weekday)

  return <>
      <div className="owner-schedule-title"><h2>{day === todayInSeoul() ? '오늘의 타임테이블' : `${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일 타임테이블`}</h2><p>예약을 눌러 자세히 보기</p></div>
      {hours?.closed && <p className="muted">정기 휴무일이에요.{scheduled.length > 0 && ' 기존 예약은 아래에서 확인해 주세요.'}</p>}
      {!hours && <p className="muted">이 요일의 영업시간이 설정되지 않았어요.</p>}
      {scheduled.length === 0 && hours && !hours.closed && <div className="owner-no-bookings"><Icon name="calendar" /><strong>여유로운 하루예요</strong><p>아직 확정된 예약이 없어요.<br />예약이 들어오면 여기에 보여드릴게요.</p></div>}
      <TimetableGrid day={day} hours={hours} bookings={scheduled} renderBooking={(booking, style) => <button key={booking.id} type="button" className="owner-booking" style={style} onClick={() => setSelectedBooking(booking)} aria-label={`${timeLabel(booking.startAt)} ${booking.customer.displayName} 고객님 ${booking.service.name}, ${statusLabel[booking.status]}`}><small>{timeLabel(booking.startAt)} – {timeLabel(booking.endAt)} · {statusLabel[booking.status]}</small><strong>{booking.customer.displayName} 고객님</strong><span>{booking.service.name}</span><Icon name="chevron-right" /></button>} />
      {canceled.length > 0 && <div className="owner-alert-list"><h3>취소 · 노쇼 내역</h3>{canceled.map((booking) => <button key={booking.id} type="button" className="button secondary" onClick={() => setSelectedBooking(booking)}>{timeLabel(booking.startAt)} · {booking.customer.displayName} · {statusLabel[booking.status]}</button>)}</div>}
      {selectedBooking && <OwnerReservationDialog key={selectedBooking.id} storeId={storeId} reservationId={selectedBooking.id} onClose={() => setSelectedBooking(null)} onConflict={onConflict} onUpdated={(reservation) => { setSelectedBooking(null); onUpdated(reservation) }} />}
  </>
}
