import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Modal } from '../Modal'
import { TimePickerDialog } from './TimePickerDialog'
import { BackendApiError } from '../../lib/backend-api'
import { createOwnerSlot, ownerSlotInput } from '../../lib/owner-api'
import type { OwnerSlot } from '../../lib/owner-api'
import { dateLabel, money, timeLabel, todayInSeoul } from '../../lib/format'
import type { RegisteredShop, StoreService } from '../../types'

export function SlotDialog({ shop, services, day, onCreated, onClose }: { shop: RegisteredShop; services: StoreService[]; day: string; onCreated: (slot: OwnerSlot) => void; onClose: (recheck: boolean) => void }) {
  const activeServices = services.filter((item) => item.active)
  const [serviceId, setServiceId] = useState(activeServices[0]?.id ?? '')
  const [date, setDate] = useState(day < todayInSeoul() ? todayInSeoul() : day)
  const [time, setTime] = useState('')
  const [editingTime, setEditingTime] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const request = useRef<{ input: ReturnType<typeof ownerSlotInput>; key: string } | null>(null)
  const [unconfirmed, setUnconfirmed] = useState(false)
  const service = activeServices.find((item) => item.id === serviceId)
  const hours = shop.openingHours.find((item) => item.dayOfWeek === ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date(`${date}T00:00:00Z`).getUTCDay()])
  const end = service && date && time ? Date.parse(`${date}T${time}:00+09:00`) + service.durationMinutes * 60000 : NaN

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setError('')
    try {
      if (!service) throw new Error('현재 제공 중인 시술을 선택해 주세요.')
      if (!request.current) request.current = { input: ownerSlotInput(shop, service, date, time), key: crypto.randomUUID() }
      setPending(true)
      onCreated(await createOwnerSlot(shop.id, request.current.input, request.current.key))
    } catch (failure) {
      const uncertain = Boolean(request.current) && (!(failure instanceof BackendApiError) || failure.status === 0 || failure.status >= 500 || failure.code === 'INVALID_RESPONSE')
      setUnconfirmed(uncertain)
      if (!uncertain) request.current = null
      setError(uncertain ? '등록 결과를 확인하지 못했어요. 같은 요청으로 다시 확인하거나 창을 닫고 등록 목록을 확인해 주세요.' : failure instanceof BackendApiError && failure.status === 409 ? '이미 등록된 시간 또는 확정 예약과 겹쳐요. 일정을 확인하고 다른 시간을 선택해 주세요.' : failure instanceof Error ? failure.message : '예약 시간을 등록하지 못했어요.')
    } finally { setPending(false) }
  }

  return <><Modal className="owner-dialog" title="예약 시간 등록" onClose={() => { if (!pending) onClose(Boolean(error)) }}>
    <p className="owner-dialog-date">고객이 예약할 수 있는 시간을 열어주세요.</p>
    <form className="owner-form" onSubmit={submit}>
      <fieldset className="account-form" disabled={pending || unconfirmed}>
        <label className="account-field">시술<select value={serviceId} onChange={(event) => { setServiceId(event.target.value); setError('') }} required>{activeServices.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes}분 · {money(item.basePrice)}</option>)}</select></label>
        <label className="account-field">날짜 (한국 시간)<input type="date" aria-label="날짜 (한국 시간)" value={date} min={todayInSeoul()} onChange={(event) => { setDate(event.target.value); setError('') }} required /><small className="muted">{hours && !hours.closed ? `영업시간 ${hours.opensAt} ~ ${hours.closesAt}` : '선택한 날짜는 휴무일이에요.'}</small></label>
        <div className="account-field"><span>시작 시간</span><button className="owner-time-button" type="button" aria-haspopup="dialog" aria-label={`시작 시간 ${time || '선택'}`} onClick={() => setEditingTime(true)}>{time || '시간 선택하기'}<span>시·분 선택</span></button></div>
      </fieldset>
      {service && <div className="owner-price-preview"><span>{Number.isFinite(end) ? `${dateLabel(new Date(end).toISOString())} ${timeLabel(new Date(end).toISOString())} 종료 · ${service.durationMinutes}분` : `${service.durationMinutes}분 시술`}</span><strong>{money(service.basePrice)}</strong></div>}
      {error && <p className="owner-form-error" role="alert">{error}</p>}
      {!activeServices.length && <p className="owner-form-error" role="alert">등록 가능한 활성 시술이 없어요.</p>}
      <button className="button" type="submit" disabled={pending || !service}>{pending ? '등록 확인 중…' : unconfirmed ? '같은 요청으로 다시 확인' : '예약 시간 등록하기'}</button>
      <p className="owner-dialog-note">시술의 정가로 등록돼요. 기존 슬롯·확정 예약과 겹치는 시간은 등록할 수 없어요.</p>
    </form>
  </Modal>
    {editingTime && <TimePickerDialog title="예약 시작 시간" initialValue={time || hours?.opensAt || '09:00'} onClose={() => setEditingTime(false)} onConfirm={(value) => {
      if (!service) throw new Error('현재 제공 중인 시술을 선택해 주세요.')
      ownerSlotInput(shop, service, date, value)
      setTime(value)
      setError('')
    }} />}
  </>
}
