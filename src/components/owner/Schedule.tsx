import { useState } from 'react'
import { Icon } from '../Icon'
import { Modal } from '../Modal'
import { dateLabel, DEMO_DAY, money, timeLabel } from '../../model'
import type { Reservation } from '../../model'

const bookingEnd = (booking: Reservation) => new Date(Date.parse(booking.startsAt) + booking.duration * 60000).toISOString()

export function OwnerSchedule({ bookings, day }: { bookings: Reservation[]; day: string }) {
  const [selectedBooking, setSelectedBooking] = useState<Reservation | null>(null)
  const firstHour = Math.min(9, ...bookings.map((item) => Number(timeLabel(item.startsAt).slice(0, 2))))
  const lastHour = Math.max(20, ...bookings.map((item) => {
    const [hour, minute] = timeLabel(bookingEnd(item)).split(':').map(Number)
    return Math.ceil(hour + minute / 60)
  }))
  const hourHeight = 72

  return <>
      <div className="owner-schedule-title"><h2>{day === DEMO_DAY ? '오늘의 타임테이블' : `${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일 타임테이블`}</h2><p>예약을 눌러 자세히 보기</p></div>
      <div className="owner-timetable" style={{ height: (lastHour - firstHour) * hourHeight }}>
        {Array.from({ length: lastHour - firstHour + 1 }, (_, index) => <div key={index} className="owner-hour" style={{ top: index * hourHeight }}><span>{String(firstHour + index).padStart(2, '0')}:00</span></div>)}
        {bookings.map((booking) => {
          const [hour, minute] = timeLabel(booking.startsAt).split(':').map(Number)
          return <button key={booking.id} type="button" className="owner-booking" style={{ top: (hour - firstHour + minute / 60) * hourHeight + 3, height: booking.duration / 60 * hourHeight - 6 }} onClick={() => setSelectedBooking(booking)} aria-label={`${timeLabel(booking.startsAt)} ${booking.customerName} 고객님 ${booking.service}, ${booking.status === 'completed' ? '시술 완료' : '예약 확정'}`}><small>{timeLabel(booking.startsAt)} – {timeLabel(bookingEnd(booking))} · {booking.status === 'completed' ? '시술 완료' : '예약 확정'}</small><strong>{booking.customerName} 고객님</strong><span>{booking.service}</span><Icon name="chevron-right" /></button>
        })}
        {bookings.length === 0 && <div className="owner-no-bookings"><Icon name="calendar" /><strong>여유로운 하루예요</strong><p>아직 확정된 예약이 없어요.<br />예약이 들어오면 여기에 보여드릴게요.</p></div>}
      </div>
      {selectedBooking && <Modal className="owner-dialog" title="예약 상세" onClose={() => setSelectedBooking(null)}>
        <p className="owner-dialog-date">{dateLabel(selectedBooking.startsAt)} · {timeLabel(selectedBooking.startsAt)} – {timeLabel(bookingEnd(selectedBooking))}</p>
        <span className="badge">{selectedBooking.status === 'confirmed' ? '예약 확정' : '시술 완료'}</span>
        <dl className="owner-booking-detail"><dt>고객</dt><dd>{selectedBooking.customerName} 고객님</dd><dt>시술</dt><dd>{selectedBooking.service}</dd><dt>소요 시간</dt><dd>{selectedBooking.duration}분</dd><dt>예약 금액</dt><dd>{money(selectedBooking.price)}</dd></dl>
        <button type="button" className="button" style={{ width: '100%' }} onClick={() => setSelectedBooking(null)}>확인했어요</button>
      </Modal>}
  </>
}
