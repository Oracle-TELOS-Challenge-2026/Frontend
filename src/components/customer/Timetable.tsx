import { useEffect, useState } from 'react'
import { readStoreTimetable } from '../../lib/customer-api'
import type { StoreTimetable } from '../../lib/customer-api'
import { dateLabel, timeLabel } from '../../lib/format'
import { Icon } from '../Icon'

const labels = { busy: '예약 불가', available: '예약 가능', unknown: '확인 필요' }
type TimeRange = { start: number; end: number; status: keyof typeof labels }

function timeRanges(data: StoreTimetable): TimeRange[] {
  const busy = data.busyTimes.map((range) => ({ start: Date.parse(range.startAt), end: Date.parse(range.endAt), status: 'busy' as const }))
  const available = data.availableTimes.map((range) => ({ start: Date.parse(range.startAt), end: Date.parse(range.endAt), status: 'available' as const }))
  const times = [...busy, ...available]
  const hours = data.openingHours.closed ? [] : [Date.parse(`${data.date}T${data.openingHours.opensAt}+09:00`), Date.parse(`${data.date}T${data.openingHours.closesAt}+09:00`)]
  const boundaries = [...new Set([...hours, ...times.flatMap((range) => [range.start, range.end])])].sort((a, b) => a - b)
  const rows: TimeRange[] = []
  for (let index = 0; index < boundaries.length - 1; index++) {
    const start = boundaries[index], end = boundaries[index + 1]
    const status = times.find((range) => range.start <= start && range.end >= end)?.status ?? 'unknown'
    const previous = rows.at(-1)
    if (previous?.status === status) previous.end = end
    else rows.push({ start, end, status })
  }
  return rows
}

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

  const rows = current?.data ? timeRanges(current.data) : []
  return <div className="customer-timetable">
    <div className="timetable-heading"><strong>{dateLabel(`${date}T12:00:00+09:00`)}</strong><button type="button" className="icon-button refresh-button" aria-label="시간표 새로고침" onClick={() => setAttempt((value) => value + 1)}><Icon name="refresh" size={19} /></button></div>
    <p className="timetable-help">조회 전용 · 30초마다 갱신돼요.</p>
    {current?.error && <p className="form-error" role="alert">{current.data && '최신 상태를 확인하지 못해 이전 시간표를 표시하고 있어요. '}{current.error}</p>}
    {!current ? <p role="status">시간표를 불러오고 있어요…</p> : current.data && <>
      {current.data.openingHours.closed && <p className="timetable-help">정기 휴무일이에요.{rows.length > 0 && ' 별도로 등록된 일정은 아래에서 확인해 주세요.'}</p>}
      {rows.length > 0 && <ul className="timetable-rows" aria-label="예약 현황">{rows.map((row) => <li key={row.start} className={`timetable-row ${row.status}`}><span><time dateTime={new Date(row.start).toISOString()}>{timeLabel(new Date(row.start).toISOString())}</time> ~ <time dateTime={new Date(row.end).toISOString()}>{timeLabel(new Date(row.end).toISOString())}</time></span><strong>{labels[row.status]}</strong></li>)}</ul>}
      <p className="timetable-help">예약 가능은 사장님이 공개한 빈자리예요. 확인 필요 시간은 사장님께 문의해 주세요.</p>
    </>}
  </div>
}
