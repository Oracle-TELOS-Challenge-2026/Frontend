import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { PushSettings } from '../components/PushSettings'
import { ProfileSettings } from '../components/ProfileSettings'
import type { CurrentUser } from '../lib/auth'
import type { usePushNotifications } from '../hooks/usePushNotifications'
import { money } from '../lib/format'
import type { RegisteredShop, Role } from '../types'

export function ProfilePage({ role, shop, preferences, push, user, onChanged, onLogout }: { role: Role; shop: RegisteredShop | null; preferences: string; push: ReturnType<typeof usePushNotifications>; user: CurrentUser; onChanged: () => Promise<void>; onLogout: () => Promise<boolean> }) {
  const [loggingOut, setLoggingOut] = useState(false)
  async function signOut() {
    if (loggingOut) return
    setLoggingOut(true)
    try { await onLogout() } finally { setLoggingOut(false) }
  }
  return <div className="page account-page">
    <header className="account-heading"><p className="eyebrow">{role === 'owner' ? '우리 가게의 빈틈을 채우는 시간' : '나에게 맞는 시간을 찾아서'}</p><h1 className="page-heading">마이페이지</h1><p className="muted">{role === 'owner' ? '등록한 가게 정보를 확인해 보세요.' : '나의 취향을 알려주면 더 잘 맞는 만남을 준비할 수 있어요.'}</p></header>
    {role === 'owner' ? <section className="account-card">
      <div className="account-card-heading"><span className="account-avatar"><Icon name="store" /></span><div><p className="eyebrow">{shop?.category ?? '사장님'}</p><h2>{shop?.name ?? '등록한 가게가 없어요'}</h2></div></div>
      {shop ? <dl className="account-details"><dt>주소</dt><dd>{shop.address}</dd><dt>대표 시술</dt><dd>{shop.service}</dd><dt>정가</dt><dd>{money(shop.originalPrice)}</dd><dt>소요 시간</dt><dd>{shop.duration}분</dd></dl> : <Link className="button" to="/owner/register">가게 등록하기<Icon name="chevron-right" size={18} /></Link>}
      {shop && <Link className="button secondary" to="/owner/manage">매장·시술 관리<Icon name="chevron-right" size={18} /></Link>}
    </section> : <section className="account-card">
      <div className="account-card-heading"><span className="account-avatar"><Icon name="heart" /></span><div><p className="eyebrow">나의 취향</p><h2>{preferences ? '이런 시간을 좋아해요' : '어떤 시간을 좋아하세요?'}</h2></div></div>
      <p className={preferences ? 'account-preference-copy' : 'muted'}>{preferences || '좋아하는 스타일, 받고 싶은 시술, 편하게 느끼는 분위기까지 자유롭게 알려주세요.'}</p>
      <Link className="button" to="/customer/profile/preferences">정보 입력하기<Icon name="chevron-right" size={18} /></Link>
      <p className="account-footnote">{preferences ? '저장한 내용은 언제든 수정하거나 지울 수 있어요.' : '생각나는 것부터 가볍게 적어도 좋아요.'}</p>
    </section>}
    <ProfileSettings key={user.id} user={user} onChanged={onChanged} />
    <PushSettings push={push} />
    <button type="button" className="account-text-button" disabled={loggingOut} onClick={() => void signOut()}>{loggingOut ? '로그아웃 중…' : '로그아웃'}</button>

  </div>
}
