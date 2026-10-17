import { useEffect, useState } from 'react'
import { readStoreTimetable } from '../../lib/customer-api'
import type { StoreTimetable } from '../../lib/customer-api'
import { dateLabel, timeLabel } from '../../lib/format'
import { Icon } from '../Icon'
import { TimetableGrid } from '../TimetableGrid'

export function Timetable({ storeId, date }: { storeId: string; date: string }) {
  const [result, setResult] = useState<{ key: string; data?: StoreTimetable; error?: string } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = `${storeId}:${date}`
  const current = result?.key === key ? result : null

  useEffect(() => {
    let request: AbortController | undefined
    let stopped = false
    async function refresh() {
      if (stopped || request || document.visibilityState !== 'visible') return
      const controller = new AbortController()
      request = controller
      try {
        const data = await readStoreTimetable(storeId, date, controller.signal)
        if (!stopped && !controller.signal.aborted) setResult({ key, data })
      } catch (error) {
        if (!stopped && !controller.signal.aborted) setResult((previous) => ({ key, data: previous?.key === key ? previous.data : undefined, error: error instanceof Error ? error.message : '시간표를 불러오지 못했어요.' }))
      } finally { if (request === controller) request = undefined }
    }
    function resume() {
      if (document.visibilityState === 'visible') void refresh()
      else { request?.abort(); request = undefined }
    }
    void refresh()
    // shortcut: 공개 시간표 변경 이벤트가 제공되면 주기 조회를 대체한다.
    const timer = window.setInterval(() => void refresh(), 30000)
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', resume)
    window.addEventListener('focus', resume)
    return () => {
      stopped = true
      request?.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('online', resume)
      window.removeEventListener('focus', resume)
    }
  }, [storeId, date, key, attempt])

  return <div className="customer-timetable">
    <div className="timetable-heading"><strong>{dateLabel(`${date}T12:00:00+09:00`)}</strong><button type="button" className="icon-button refresh-button" aria-label="시간표 새로고침" onClick={() => setAttempt((value) => value + 1)}><Icon name="refresh" size={19} /></button></div>
    <p className="timetable-help">조회 전용 · 30초마다 갱신돼요.</p>
    {current?.error && <p className="form-error" role="alert">{current.data && '최신 상태를 확인하지 못해 이전 시간표를 표시하고 있어요. '}{current.error}</p>}
    {!current ? <p role="status">시간표를 불러오고 있어요…</p> : current.data && <>
      {current.data.openingHours.closed && <p className="timetable-help">정기 휴무일이에요.{current.data.busyTimes.length > 0 && ' 별도로 등록된 일정은 아래에서 확인해 주세요.'}</p>}
      <p className="timetable-help">색칠된 시간은 예약 불가예요. 예약 정보는 공개하지 않아요.<br />영업시간 안의 빈 시간은 채팅으로 예약을 문의해 주세요.</p>
      <TimetableGrid day={date} hours={current.data.openingHours} bookings={current.data.busyTimes} renderBooking={(booking, style) => <div key={`${booking.startAt}:${booking.endAt}`} className="owner-booking customer-booking" style={style} aria-label={`${timeLabel(booking.startAt)} ~ ${timeLabel(booking.endAt)} 예약 불가`}><small><time dateTime={booking.startAt}>{timeLabel(booking.startAt)}</time> – <time dateTime={booking.endAt}>{timeLabel(booking.endAt)}</time></small><strong>예약 불가</strong></div>} />
    </>}
  </div>
}
