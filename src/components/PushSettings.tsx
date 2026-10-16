import { useState } from 'react'
import { Icon } from './Icon'
import type { usePushNotifications } from '../hooks/usePushNotifications'

export function PushSettings({ push }: { push: ReturnType<typeof usePushNotifications> }) {
  const [copyMessage, setCopyMessage] = useState('')
  const pending = push.status === 'checking' || push.status === 'connecting'
  const unavailable = push.status === 'unconfigured' || push.status === 'unsupported'
  const description = {
    unconfigured: '알림 기능을 준비하고 있어요.',
    checking: '이 브라우저에서 알림을 받을 수 있는지 확인하고 있어요.',
    unsupported: '이 환경에서는 알림을 지원하지 않아요. HTTPS 또는 localhost에서 지원되는 브라우저로 열어 주세요.',
    off: '이 브라우저에서 새 알림을 받아보세요.',
    blocked: '브라우저의 사이트 설정에서 알림을 허용한 뒤 다시 시도해 주세요.',
    connecting: '알림 설정을 변경하고 있어요.',
    on: '이 브라우저에서 알림을 받을 준비가 됐어요.',
    error: push.error,
  }[push.status]

  async function copyFid() {
    try { await navigator.clipboard.writeText(push.fid); setCopyMessage('수신 ID를 복사했어요.') }
    catch { setCopyMessage('복사하지 못했어요. 아래 ID를 직접 선택해 주세요.') }
  }

  return <section className="account-card push-settings" aria-labelledby="push-heading">
    <div className="account-card-heading"><span className="account-avatar"><Icon name="bell" /></span><div><h2 id="push-heading">브라우저 알림</h2></div></div>
    <p className={push.status === 'error' ? 'account-error' : 'muted'} role="status">{description}</p>
    {!unavailable && <div className="account-form-actions">
      {push.status !== 'on' && <button className="button" type="button" disabled={pending} onClick={() => void push.enable()}>{pending ? '연결 중…' : push.status === 'error' || push.status === 'blocked' ? '다시 연결하기' : '알림 켜기'}</button>}
      {push.enabled && <button className="button secondary" type="button" disabled={pending} onClick={() => void push.disable()}>알림 끄기</button>}
    </div>}
    <p className="account-footnote">현재는 수신 테스트를 지원해요.<br />대기 신청에 따른 자동 알림 발송은 준비 중이에요.</p>
    {push.fid && <details className="push-debug"><summary>Firebase 수신 테스트</summary><p>Firebase 콘솔의 테스트 수신 대상으로 이 ID를 사용하세요.</p><code>{push.fid}</code><button type="button" className="account-text-button" onClick={() => void copyFid()}>수신 ID 복사</button><p role="status">{copyMessage}</p></details>}
  </section>
}
