import { useState } from 'react'
import { Modal } from '../Modal'

export function TimePickerDialog({ title, initialValue, onConfirm, onClose }: { title: string; initialValue: string; onConfirm: (time: string) => void; onClose: () => void }) {
  const [time, setTime] = useState(initialValue)
  const [error, setError] = useState('')
  const [hour, minute] = time.split(':')

  return <Modal className="owner-dialog" title={title} onClose={onClose}>
    <p className="registration-time-preview" aria-live="polite">{hour}<span>:</span>{minute}</p>
    <fieldset className="registration-time-group"><legend>시 · 24시간 기준</legend><div className="registration-time-grid">{Array.from({ length: 24 }, (_, value) => String(value).padStart(2, '0')).map((value) => <button key={value} type="button" aria-label={`${value}시`} aria-pressed={hour === value} onClick={() => { setTime(`${value}:${minute}`); setError('') }}>{value}</button>)}</div></fieldset>
    <fieldset className="registration-time-group"><legend>분</legend><div className="registration-time-grid">{Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0')).map((value) => <button key={value} type="button" aria-label={`${value}분`} aria-pressed={minute === value} onClick={() => { setTime(`${hour}:${value}`); setError('') }}>{value}</button>)}</div></fieldset>
    {error && <p className="account-error" role="alert">{error}</p>}
    <div className="account-form-actions"><button className="button secondary" type="button" onClick={onClose}>취소</button><button className="button" type="button" onClick={() => {
      try { onConfirm(time); onClose() }
      catch (cause) { setError(cause instanceof Error ? cause.message : '시간을 다시 확인해 주세요.') }
    }}>이 시간으로 설정</button></div>
  </Modal>
}
