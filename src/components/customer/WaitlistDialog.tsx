import { useState } from 'react'
import type { FormEvent } from 'react'
import { DEMO_DAY } from '../../model'
import type { Shop, WaitlistItem } from '../../model'
import { Modal } from '../Modal'

export function WaitlistDialog({ shop, item, onSave, onClose }: { shop: Shop; item?: WaitlistItem; onSave: (date: string, time: string) => boolean; onClose: () => void }) {
  const [error, setError] = useState('')

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (onSave(String(data.get('date')), String(data.get('time')))) onClose()
    else setError('신청할 수 없는 시간이에요. 이미 신청했거나 지난 시간인지 확인해 주세요.')
  }

  return <Modal title={item ? '대기 시간 바꾸기' : '빈자리 알림 신청'} onClose={onClose} className="customer-dialog">
    <form onSubmit={submit}>
      <p>{shop.name}에서 원하는 시간에 취소가 생기면<br />알림을 받을 수 있어요. 예약은 확정되지 않아요.</p>
      <label>원하는 날짜<input name="date" type="date" min={DEMO_DAY} defaultValue={item?.preferredDate ?? DEMO_DAY} required /></label>
      <label>원하는 시간<input name="time" type="time" defaultValue={item?.preferredTime ?? '17:00'} required /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="customer-dialog-actions"><button type="button" className="button secondary" onClick={onClose}>닫기</button><button className="button" type="submit">{item ? '변경하기' : '알림 신청하기'}</button></div>
    </form>
  </Modal>
}
