import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '../Icon'
import { Modal } from '../Modal'
import { dateLabel, money, timeLabel } from '../../lib/format'
import { discountPrice } from '../../lib/booking'
import { publishVacancy, vacancyPublishInput } from '../../lib/owner-api'
import type { Vacancy } from '../../lib/owner-api'
import type { DiscountMode, StoreService } from '../../types'

const seoulInput = (time: number) => new Date(time + 9 * 3600000).toISOString().slice(0, 16)

export function PublishDialog({ vacancy, services, onPublished, onClose }: { vacancy: Vacancy; services: StoreService[]; onPublished: (vacancy: Vacancy) => void; onClose: () => void }) {
  const [start, setStart] = useState(() => seoulInput(Math.max(Date.parse(vacancy.availableFrom), Math.ceil((Date.now() + 60000) / 60000) * 60000)))
  const [serviceId, setServiceId] = useState(vacancy.originalServiceId)
  const [mode, setMode] = useState<DiscountMode>('percent')
  const [value, setValue] = useState('20')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const request = useRef<{ signature: string; input: ReturnType<typeof vacancyPublishInput>; key: string } | null>(null)
  const activeServices = services.filter((service) => service.active)
  const service = activeServices.find((item) => item.id === serviceId)
  const price = service ? discountPrice(service.basePrice, mode, Number(value)) : null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setError('')
    try {
      if (!service) throw new Error('현재 제공 중인 시술을 선택해 주세요.')
      const signature = JSON.stringify({ serviceId, start, mode, value })
      if (request.current?.signature !== signature) request.current = { signature, input: vacancyPublishInput(vacancy, service, `${start}:00+09:00`, mode, Number(value)), key: crypto.randomUUID() }
      setPending(true)
      onPublished(await publishVacancy(vacancy, request.current.input, request.current.key))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '빈자리를 발행하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setPending(false)
    }
  }

  return <Modal className="owner-dialog" title="빈자리를 알려볼까요?" onClose={() => { if (!pending) onClose() }}>
    <p className="owner-dialog-date">{dateLabel(vacancy.availableFrom)} · {timeLabel(vacancy.availableFrom)} – {timeLabel(vacancy.availableUntil)}</p>
    <form className="owner-form" onSubmit={submit}>
      <label className="account-field" htmlFor="owner-service">가능한 시술
        <select id="owner-service" value={serviceId} onChange={(event) => { setServiceId(event.target.value); setError('') }} required disabled={pending}><option value="">시술을 선택해 주세요</option>{activeServices.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.durationMinutes}분 · {money(item.basePrice)}</option>)}</select>
      </label>
      <label className="account-field" htmlFor="owner-start">시작 시간 (한국 시간)<input id="owner-start" type="datetime-local" value={start} min={seoulInput(Date.parse(vacancy.availableFrom))} max={seoulInput(Date.parse(vacancy.availableUntil))} onChange={(event) => { setStart(event.target.value); setError('') }} required disabled={pending} /></label>
      <fieldset disabled={pending}><legend className="owner-form-label">할인 방법</legend><div className="owner-discount-toggle">
        <label><input type="radio" name="discount-mode" checked={mode === 'percent'} onChange={() => { setMode('percent'); setValue('20'); setError('') }} /><span>할인율로 입력</span></label>
        <label><input type="radio" name="discount-mode" checked={mode === 'amount'} onChange={() => { setMode('amount'); setValue(service ? String(Math.round(service.basePrice * .8)) : ''); setError('') }} /><span>할인 가격으로 입력</span></label>
      </div></fieldset>
      <label className="owner-form-label" htmlFor="owner-discount">{mode === 'percent' ? '할인율' : '최종 할인 가격'} {service && <span className="muted">· 정가 {money(service.basePrice)}</span>}</label>
      <div className="owner-price-field"><input id="owner-discount" type="number" inputMode="numeric" min={1} max={mode === 'percent' ? 99 : (service?.basePrice ?? 1) - 1} step={1} value={value} required disabled={pending} onChange={(event) => { setValue(event.target.value); setError('') }} aria-describedby={error ? 'owner-publish-error' : undefined} /><span>{mode === 'percent' ? '%' : '원'}</span></div>
      <div className="owner-price-preview" aria-live="polite"><span>고객에게 보이는 가격</span><strong>{price === null ? '—' : money(price)}</strong></div>
      {error && <p className="owner-form-error" id="owner-publish-error" role="alert">{error}</p>}
      {activeServices.length === 0 && <p className="owner-form-error" role="alert">등록된 활성 시술이 없어 빈자리를 발행할 수 없어요.</p>}
      <button className="button" type="submit" disabled={pending || activeServices.length === 0}><Icon name="bell" />{pending ? '빈자리 발행 중…' : '빈자리 알리기'}</button>
      <p className="owner-dialog-note">발행 후 조건에 맞는 대기 고객에게 알림을 준비해요.</p>
    </form>
  </Modal>
}
