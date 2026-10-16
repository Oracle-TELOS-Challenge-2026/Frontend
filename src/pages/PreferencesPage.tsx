import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../components/Icon'

export function PreferencesPage({ value, onSave, error }: { value: string; onSave: (value: string) => Promise<boolean>; error: string }) {
  const [draft, setDraft] = useState(value)
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try { if (await onSave(draft.trim())) navigate('/customer/profile', { replace: true }) } finally { setSaving(false) }
  }

  return <div className="page account-page">
    <div className="account-page-top"><Link className="icon-button" to="/customer/profile" aria-label="마이페이지로 돌아가기"><Icon name="arrow-left" /></Link></div>
    <header className="account-heading"><p className="eyebrow">나의 취향</p><h1 className="page-heading">나를 위한 정보를 알려주세요</h1><p className="muted">좋아하는 스타일이나 원하는 시술을<br />편하게 이야기해 주세요.</p></header>
    <form className="account-form" onSubmit={submit}>
      <div className="account-field"><label htmlFor="customer-preferences">내 취향과 관심사</label><textarea id="customer-preferences" name="preferences" value={draft} disabled={saving} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={8} placeholder="예) 자연스러운 원컬러 네일을 좋아해요. 조용한 분위기에서 꼼꼼하게 케어받고 싶어요." aria-describedby="preferences-help preferences-count" /><div className="account-input-footer"><button className="account-text-button" type="button" disabled={saving || !draft} onClick={() => setDraft('')}>내용 지우기</button><small id="preferences-count">{draft.length.toLocaleString('ko-KR')} / 2,000자</small></div><small id="preferences-help">내용을 비우고 저장하면 기존 정보가 삭제돼요.</small></div>
      <p className="account-footnote">저장한 취향은 로그인한 계정에 보관돼요.</p>
      {error && <p className="account-error" role="alert">{error}</p>}
      <div className="account-form-actions"><Link className="button secondary" to="/customer/profile">취소</Link><button className="button" type="submit" disabled={saving}>{saving ? '저장 중…' : '저장하기'}<Icon name="check" size={18} /></button></div>
    </form>
  </div>
}
