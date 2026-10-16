import { useRef, useState } from 'react'
import type { CurrentUser } from '../lib/auth'
import { BackendApiError } from '../lib/backend-api'
import { deleteUserLocation, saveUserLocation, updateDisplayName } from '../lib/user-api'
import { dateLabel, timeLabel } from '../lib/format'

export function ProfileSettings({ user, onChanged }: { user: CurrentUser; onChanged: () => Promise<void> }) {
  const [name, setName] = useState(user.displayName)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const busy = useRef(false)

  async function update(action: () => Promise<void>, success: string) {
    if (busy.current) return
    busy.current = true; setPending(true); setError(''); setMessage('')
    try { await action(); await onChanged(); setMessage(success) }
    catch (cause) {
      if (cause instanceof BackendApiError && cause.code === 'VERSION_CONFLICT') {
        await onChanged().catch(() => {})
        setError('계정 정보가 바뀌었어요. 최신 정보를 확인한 뒤 다시 저장해 주세요.')
      } else setError(cause instanceof Error ? cause.message : '변경하지 못했어요. 다시 시도해 주세요.')
    } finally { busy.current = false; setPending(false) }
  }

  async function locate() {
    if (!navigator.geolocation) throw new Error('이 브라우저에서는 현재 위치를 확인할 수 없어요.')
    const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, (cause) => reject(new Error(cause.code === 1 ? '브라우저에서 위치 권한을 허용해 주세요.' : '위치를 확인하지 못했어요. 다시 시도해 주세요.')), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }))
    await saveUserLocation(position)
  }

  return <section className="account-card profile-settings">
    <h2>내 정보</h2>
    <form className="account-form" onSubmit={(event) => { event.preventDefault(); void update(() => updateDisplayName(name, user.version), '이름을 변경했어요.') }}>
      <div className="account-field"><label htmlFor="profile-name">이름</label><input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} disabled={pending} required autoComplete="nickname" /></div>
      <button className="button secondary" disabled={pending || name.trim() === user.displayName}>이름 저장</button>
    </form>
    <h3>저장한 위치</h3>
    <p className="muted">{user.location ? `${dateLabel(user.location.savedAt)} ${timeLabel(user.location.savedAt)}에 저장한 위치가 있어요.` : '저장한 위치가 없어요.'} 위치는 주변 대기 조건을 입력할 때 사용할 수 있어요.</p>
    <div className="account-form-actions"><button className="button secondary" disabled={pending} onClick={() => void update(locate, '현재 위치를 저장했어요.')}>현재 위치 저장</button>{user.location && <button className="button secondary" disabled={pending} onClick={() => void update(deleteUserLocation, '저장한 위치를 삭제했어요.')}>위치 삭제</button>}</div>
    {pending && <p role="status">처리 중이에요…</p>}{error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </section>
}
