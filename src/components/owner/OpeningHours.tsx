import { useState } from 'react'
import { TimePickerDialog } from './TimePickerDialog'
import type { ShopRegistration } from '../../types'

const labels = ['월', '화', '수', '목', '금', '토', '일']

export function OpeningHours({ value, onChange, error }: { value: ShopRegistration['openingHours']; onChange: (value: ShopRegistration['openingHours']) => void; error?: string }) {
  const [editing, setEditing] = useState<{ index: number; field: 'opensAt' | 'closesAt' } | null>(null)
  const template = value.findIndex((day) => !day.closed && day.opensAt && day.closesAt && day.opensAt < day.closesAt)

  function openTime(index: number, field: 'opensAt' | 'closesAt') {
    setEditing({ index, field })
  }

  function applyTime(time: string) {
    if (!editing) return
    const day = { ...value[editing.index], [editing.field]: time }
    if (day.opensAt && day.closesAt && day.opensAt >= day.closesAt) throw new Error('종료 시간은 시작 시간보다 늦게 선택해 주세요.')
    onChange(value.map((item, index) => index === editing.index ? day : item))
  }

  return <fieldset className="registration-hours">
    <legend>주간 영업시간</legend>
    <p className="muted">요일별로 영업 여부와 시간을 눌러 설정해 주세요.</p>
    {template >= 0 && <button className="account-text-button registration-copy-hours" type="button" onClick={() => onChange(value.map((day) => day.closed ? day : { ...day, opensAt: value[template].opensAt, closesAt: value[template].closesAt }))}>{labels[template]}요일 시간을 다른 영업일에도 적용</button>}
    <div className="registration-week">{value.map((day, index) => <div className={`registration-day ${day.closed ? 'is-closed' : ''}`} key={day.dayOfWeek}>
      <strong>{labels[index]}<span className="sr-only">요일</span></strong>
      <button className="registration-day-toggle" type="button" aria-label={`${labels[index]}요일 휴무`} aria-pressed={day.closed} onClick={() => onChange(value.map((item, i) => i === index ? { ...item, closed: !item.closed, opensAt: !item.closed ? null : '', closesAt: !item.closed ? null : '' } : item))}>{day.closed ? '휴무' : '영업'}</button>
      {day.closed ? <span className="registration-closed-label">쉬는 날이에요</span> : <div className="registration-day-times">
        <button type="button" aria-label={`${labels[index]}요일 시작 시간 ${day.opensAt || '선택'}`} onClick={() => openTime(index, 'opensAt')}>{day.opensAt || '시작 시간'}</button><span aria-hidden="true">–</span>
        <button type="button" aria-label={`${labels[index]}요일 종료 시간 ${day.closesAt || '선택'}`} onClick={() => openTime(index, 'closesAt')}>{day.closesAt || '종료 시간'}</button>
      </div>}
    </div>)}</div>
    {error && <p className="account-error" role="alert">{error}</p>}
    {editing && <TimePickerDialog title={`${labels[editing.index]}요일 ${editing.field === 'opensAt' ? '시작' : '종료'} 시간`} initialValue={value[editing.index][editing.field] || (editing.field === 'opensAt' ? '09:00' : '20:00')} onConfirm={applyTime} onClose={() => setEditing(null)} />}
  </fieldset>
}
