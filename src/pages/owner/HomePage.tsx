import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { LoadingIndicator } from '../../components/LoadingIndicator'
import { OwnerSchedule } from '../../components/owner/Schedule'
import { ReservationRequests } from '../../components/owner/ReservationRequests'
import { SlotDialog } from '../../components/owner/SlotDialog'
import { dateLabel, money, timeLabel, todayInSeoul } from '../../lib/format'
import { readOwnerTimetable } from '../../lib/owner-api'
import { readStoreServices } from '../../lib/customer-api'
import type { OwnerReservationDetail, OwnerTimetable } from '../../lib/owner-api'
import type { RegisteredShop, StoreService } from '../../types'

const dayAt = (day: string, offset: number) => new Date(Date.parse(`${day}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10)
const weekStartFor = (day: string) => dayAt(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))

type HomeResult = { key: string; data?: OwnerTimetable; services?: StoreService[]; error?: string }
export type OwnerHomeCache = Map<string, HomeResult>

export function OwnerHome({ ownerShop, cache, refreshKey = '' }: { ownerShop: RegisteredShop | null; cache: OwnerHomeCache; refreshKey?: string }) {
  const [searchParams] = useSearchParams()
  const today = todayInSeoul()
  const requestedDay = searchParams.get('date') ?? ''
  const requestedTime = Date.parse(`${requestedDay}T00:00:00Z`)
  const initialDay = /^\d{4}-\d{2}-\d{2}$/.test(requestedDay) && Number.isFinite(requestedTime) && new Date(requestedTime).toISOString().slice(0, 10) === requestedDay ? requestedDay : today
  const [selectedDay, setSelectedDay] = useState(initialDay)
  const [weekStart, setWeekStart] = useState(() => weekStartFor(initialDay))
  const [revision, setRevision] = useState(0)
  const [registering, setRegistering] = useState(false)
  const [notice, setNotice] = useState('')
  const [result, setResult] = useState<HomeResult | null>(null)
  const storeId = ownerShop?.id
  const key = `${storeId}:${selectedDay}`
  const current = result?.key === key ? result : cache.get(key)

  useEffect(() => {
    if (!storeId) return
    let request: AbortController | undefined
    let stopped = false
    async function refresh() {
      if (stopped || request || document.visibilityState !== 'visible') return
      const controller = new AbortController()
      request = controller
      try {
        const [data, services] = await Promise.all([readOwnerTimetable(storeId!, selectedDay, controller.signal), readStoreServices(storeId!, controller.signal)])
        if (controller.signal.aborted || stopped) return
        const next = { key, data, services }
        cache.set(key, next)
        setResult(next)
      } catch (error) {
        if (!controller.signal.aborted && !stopped) setResult({ ...cache.get(key), key, error: error instanceof Error ? error.message : '예약을 불러오지 못했어요.' })
      } finally { if (request === controller) request = undefined }
    }
    function resume() {
      if (document.visibilityState === 'visible') void refresh()
      else { request?.abort(); request = undefined }
    }
    void refresh()
    // shortcut: 모든 예약 변경이 서버 이벤트로 전달되면 이 주기 조회를 대체한다.
    const timer = window.setInterval(() => void refresh(), 30000)
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', resume)
    return () => {
      stopped = true
      request?.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('online', resume)
    }
  }, [storeId, selectedDay, key, revision, refreshKey, cache])

  function reservationUpdated(reservation: OwnerReservationDetail) {
    setRevision((value) => value + 1)
    setNotice(reservation.status === 'CONFIRMED' ? '선택한 고객의 예약을 확정했어요. 같은 빈자리의 다른 신청은 마감됐어요.' : reservation.status === 'REJECTED' ? '신청을 거절했어요. 다른 신청과 빈자리는 유지돼요.' : reservation.status === 'NO_SHOW' ? '노쇼 처리했어요. 남은 시간은 빈자리 알림에서 확인해 주세요.' : reservation.status === 'CANCELED' ? '예약을 취소했어요. 남은 시간은 빈자리 알림에서 확인해 주세요.' : '시술 완료로 처리했어요.')
  }

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
      {notice && <p role="status">{notice}</p>}
      <div className="owner-summary">
        <div><p>{selectedDay === today ? '오늘' : '선택한 날'} 전체 예약</p><strong>{current?.data?.summary.total ?? '—'}<small>건</small></strong></div>
        <div><p>남은 확정 예약</p><strong>{current?.data?.summary.remainingConfirmed ?? '—'}<small>건</small></strong></div>
      </div>
      {storeId && <ReservationRequests key={storeId} storeId={storeId} refreshKey={`${refreshKey}:${revision}`} onUpdated={reservationUpdated} onConflict={() => setRevision((value) => value + 1)} />}
      <div className="owner-date-heading">
        <h2>{new Date(`${selectedDay}T12:00:00+09:00`).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', timeZone: 'Asia/Seoul' })}</h2>
        <div className="owner-date-controls">
          <button className="icon-button" type="button" onClick={() => moveWeek(-7)} aria-label="이전 주"><Icon name="chevron-right" /></button>
          <button className="button secondary small" type="button" onClick={() => { setSelectedDay(today); setWeekStart(weekStartFor(today)) }}>오늘</button>
          <button className="icon-button" type="button" onClick={() => moveWeek(7)} aria-label="다음 주"><Icon name="chevron-right" /></button>
        </div>
      </div>
      <div className="owner-week" aria-label="예약 날짜 선택">
        {Array.from({ length: 7 }, (_, index) => {
          const day = dayAt(weekStart, index)
          return <button key={day} type="button" className={`owner-day ${day === selectedDay ? 'selected' : ''} ${day === today ? 'is-today' : ''}`} aria-label={dateLabel(`${day}T12:00:00+09:00`)} aria-pressed={day === selectedDay} onClick={() => setSelectedDay(day)}><span>{['월', '화', '수', '목', '금', '토', '일'][index]}</span><strong>{Number(day.slice(8))}</strong></button>
        })}
      </div>
      {current?.error && <div role="alert"><p>{current.data && '저장된 일정을 표시하고 있어요. '}{current.error}</p><button className="button secondary" type="button" onClick={() => setRevision((value) => value + 1)}>다시 조회</button></div>}
      {!storeId ? <p className="empty-state">매장을 등록하면 예약 일정을 확인할 수 있어요.</p> : !current ? <LoadingIndicator label="예약 일정을 불러오고 있어요" /> : current.data && ownerShop && <>
        <section className="owner-slots" aria-label="예약 가능한 시간">
          <div className="owner-list-heading"><h2>예약 가능한 시간</h2><button className="button small" type="button" onClick={() => { setNotice(''); setRegistering(true) }}>예약 시간 등록</button></div>
          {current.data.availableSlots.length ? <ul className="owner-slot-list">{current.data.availableSlots.map((slot) => <li key={slot.id}><div><strong>{timeLabel(slot.startAt)} ~ {timeLabel(slot.endAt)}</strong><p>{current.services?.find((service) => service.id === slot.serviceId)?.name ?? '등록된 시술'} · {slot.instantBooking === false ? '사장님 선택' : '즉시확정'}</p></div><span>{money(slot.price.payable)}</span></li>)}</ul> : <p className="muted">이 날짜에 예약 가능한 시간이 없어요.<br />시술과 시작 시간을 등록하면 고객이 예약할 수 있어요.</p>}
        </section>
        <OwnerSchedule key={key} storeId={storeId} bookings={current.data.reservations} day={selectedDay} openingHours={ownerShop.openingHours} onUpdated={reservationUpdated} onConflict={() => setRevision((value) => value + 1)} />
      </>}
      {registering && ownerShop && current?.services && <SlotDialog shop={ownerShop} services={current.services} day={selectedDay} onClose={(recheck) => { setRegistering(false); if (recheck) setRevision((value) => value + 1) }} onCreated={(slot) => {
        const day = todayInSeoul(new Date(slot.startAt))
        setRegistering(false)
        setSelectedDay(day)
        setWeekStart(weekStartFor(day))
        setRevision((value) => value + 1)
        setNotice(`${dateLabel(slot.startAt)} ${timeLabel(slot.startAt)} ~ ${timeLabel(slot.endAt)} 예약 시간을 등록했어요.`)
      }} />}
    </div>
  )
}
