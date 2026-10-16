import { useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '../Icon'
import { Modal } from '../Modal'
import { dateLabel, discountPrice, money, timeLabel } from '../../model'
import type { Cancellation, DemoProps, DiscountMode } from '../../model'

export function PublishDialog({ cancellation, onPublish, onClose }: { cancellation: Cancellation; onPublish: DemoProps['onPublish']; onClose: () => void }) {
  const [service, setService] = useState(cancellation.service)
  const [mode, setMode] = useState<DiscountMode>('percent')
  const [value, setValue] = useState('20')
  const [error, setError] = useState('')
  const price = discountPrice(cancellation.originalPrice, mode, Number(value))

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!service.trim()) { setError('가능한 시술을 입력해 주세요.'); return }
    if (price === null) { setError(mode === 'percent' ? '할인율은 1~99 사이의 정수로 입력해 주세요.' : `할인 가격은 1원부터 ${money(cancellation.originalPrice - 1)} 사이로 입력해 주세요.`); return }
    if (onPublish(cancellation.id, service, mode, Number(value))) onClose()
    else setError('이 시간에 이미 예약이 있거나 알림이 등록되었어요. 닫은 뒤 다시 확인해 주세요.')
  }

  return <Modal className="owner-dialog" title="빈자리를 알려볼까요?" onClose={onClose}>
    <p className="owner-dialog-date">{dateLabel(cancellation.startsAt)} · {timeLabel(cancellation.startsAt)}</p>
    <form className="owner-form" onSubmit={submit}>
      <label className="owner-form-label" htmlFor="owner-service">가능한 시술</label>
      <textarea id="owner-service" value={service} onChange={(event) => { setService(event.target.value); setError('') }} required maxLength={160} placeholder="예) 원컬러 젤 네일 · 케어 포함" />
      <fieldset><legend className="owner-form-label">할인 방법</legend><div className="owner-discount-toggle">
        <label><input type="radio" name="discount-mode" checked={mode === 'percent'} onChange={() => { setMode('percent'); setValue('20'); setError('') }} /><span>할인율로 입력</span></label>
        <label><input type="radio" name="discount-mode" checked={mode === 'amount'} onChange={() => { setMode('amount'); setValue(String(Math.round(cancellation.originalPrice * .8))); setError('') }} /><span>할인 가격으로 입력</span></label>
      </div></fieldset>
      <label className="owner-form-label" htmlFor="owner-discount">{mode === 'percent' ? '할인율' : '최종 할인 가격'} <span className="muted">· 정가 {money(cancellation.originalPrice)}</span></label>
      <div className="owner-price-field"><input id="owner-discount" type="number" inputMode="numeric" min={1} max={mode === 'percent' ? 99 : cancellation.originalPrice - 1} step={1} value={value} required onChange={(event) => { setValue(event.target.value); setError('') }} aria-describedby={error ? 'owner-publish-error' : undefined} /><span>{mode === 'percent' ? '%' : '원'}</span></div>
      <div className="owner-price-preview" aria-live="polite"><span>고객에게 보이는 가격</span><strong>{price === null ? '—' : money(price)}</strong></div>
      {error && <p className="owner-form-error" id="owner-publish-error" role="alert">{error}</p>}
      <button className="button" type="submit"><Icon name="bell" />빈자리 알리기</button>
      <p className="owner-dialog-note">시연용 알림이에요. 고객 지도와 대기내역에 반영되며<br />실제 푸시 알림은 발송되지 않아요.</p>
    </form>
  </Modal>
}
