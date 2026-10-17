import { useState } from 'react'
import { Icon } from '../../components/Icon'

export function CustomerRegistration({ onRegister, onCancel, error }: { onRegister: (name: string) => Promise<boolean>; onCancel: () => void; error: string }) {
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)

  return <div className="page account-page">
    <div className="account-page-top"><span className="eyebrow">고객으로 시작하기</span><button className="account-text-button" type="button" onClick={onCancel} disabled={pending}>사장님으로 시작<Icon name="chevron-right" size={16} /></button></div>
    <header className="account-heading"><h1 className="page-heading">이름을 알려주세요</h1><p className="muted">예약과 채팅에서 사장님이 알아볼 수 있도록<br />실명을 입력해 주세요.</p></header>
    <form className="account-form" onSubmit={async (event) => {
      event.preventDefault()
      if (pending) return
      setPending(true)
      try { await onRegister(name.trim()) } finally { setPending(false) }
    }}>
      <div className="account-field"><label htmlFor="customer-name">이름</label><input id="customer-name" name="name" value={name} onChange={(event) => setName(event.target.value)} disabled={pending} required maxLength={30} autoComplete="name" placeholder="예) 홍길동" aria-describedby="customer-name-help" /><small id="customer-name-help">저장한 이름은 내 정보에서 수정할 수 있어요.</small></div>
      {error && <p className="account-error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={pending || !name.trim()}>{pending ? '저장 중…' : '이름 저장하고 시작하기'}<Icon name="check" size={18} /></button>
      <p className="account-footnote">위치 권한을 허용하면 화면을 이용하는 동안 현재 위치를 저장해 주변 빈자리 알림에 사용해요.</p>
    </form>
  </div>
}
