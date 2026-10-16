import { Icon } from './Icon'
import type { usePushNotifications } from '../hooks/usePushNotifications'

export function PushSettings({ push }: { push: ReturnType<typeof usePushNotifications> }) {
  const pending = push.status === 'checking' || push.status === 'connecting'
  const unavailable = push.status === 'unconfigured' || push.status === 'unsupported' || push.status === 'install-required'
  const description = {
    unconfigured: '알림 기능을 준비하고 있어요.',
    checking: '이 브라우저에서 알림을 받을 수 있는지 확인하고 있어요.',
    'install-required': '홈 화면에 추가하면 iPhone·iPad에서도 알림을 받을 수 있어요.',
    unsupported: push.error || '이 환경에서는 알림을 지원하지 않아요. 최신 브라우저에서 다시 열어 주세요.',
    off: '이 브라우저에서 새 알림을 받아보세요.',
    blocked: '브라우저의 사이트 설정에서 알림을 허용한 뒤 다시 시도해 주세요.',
    connecting: '알림 설정을 변경하고 있어요.',
    on: '이 브라우저에서 알림을 받을 준비가 됐어요.',
    error: push.error,
  }[push.status]

  return <section className="account-card push-settings" aria-labelledby="push-heading">
    <div className="account-card-heading"><span className="account-avatar"><Icon name="bell" /></span><div><h2 id="push-heading">브라우저 알림</h2></div></div>
    <p className={push.status === 'error' ? 'account-error' : 'muted'} role="status">{description}</p>
    {push.status === 'install-required' && <p className="account-footnote">iOS·iPadOS 16.4 이상에서 공유 메뉴 → ‘홈 화면에 추가’를 선택해 주세요. 추가한 빈틈 아이콘으로 실행하고 필요한 경우 다시 로그인한 뒤, ‘알림 켜기’를 눌러 주세요.</p>}
    {!unavailable && <div className="account-form-actions">
      {push.status !== 'on' && <button className="button" type="button" disabled={pending} onClick={() => void push.enable()}>{pending ? '연결 중…' : push.status === 'error' || push.status === 'blocked' ? '다시 연결하기' : '알림 켜기'}</button>}
      {push.enabled && <button className="button secondary" type="button" disabled={pending} onClick={() => void push.disable()}>알림 끄기</button>}
    </div>}
    <p className="account-footnote">채팅, 예약과 대기 알림을 이 브라우저에서 받을 수 있어요.</p>
    {push.status === 'on' && <p className="account-footnote">알림이 보이지 않으면 기기 알림 설정과 집중 모드를 확인해 주세요. Mac에서는 사용 중인 브라우저의 알림을 허용해야 해요.</p>}
  </section>
}
