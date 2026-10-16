import { NavLink } from 'react-router-dom'
import type { Role } from '../model'
import { Icon } from './Icon'

export function BottomNav({ role, hasUnread }: { role: Role; hasUnread: boolean }) {
  const tabs = role === 'customer' ? [{ to: '/customer/waitlist', label: '대기내역', icon: 'bell' as const }, { to: '/customer', label: '홈', icon: 'home' as const }, { to: '/customer/reservations', label: '예약내역', icon: 'calendar' as const }] : [{ to: '/owner/alerts', label: '빈자리 알림', icon: 'bell' as const }, { to: '/owner', label: '홈', icon: 'home' as const }, { to: '/owner/chats', label: '채팅', icon: 'chat' as const }]
  return <nav className="bottom-nav" aria-label={role === 'customer' ? '고객 메뉴' : '사장님 메뉴'}>{tabs.map((tab) => <NavLink to={tab.to} key={tab.to} end className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><span><Icon name={tab.icon} size={23} />{role === 'owner' && tab.icon === 'chat' && hasUnread && <i className="nav-dot" />}</span>{tab.label}</NavLink>)}</nav>
}
