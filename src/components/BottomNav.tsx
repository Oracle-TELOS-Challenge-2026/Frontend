import type { ComponentProps } from 'react'
import { NavLink } from 'react-router-dom'
import type { Role } from '../model'
import { Icon } from './Icon'

export function BottomNav({ role, hasUnread, notificationCount }: { role: Role; hasUnread: boolean; notificationCount: number }) {
  const tabs: { to: string; label: string; icon: ComponentProps<typeof Icon>['name'] }[] = role === 'customer' ? [{ to: '/customer', label: '홈', icon: 'home' as const }, { to: '/customer/waitlist', label: '대기내역', icon: 'clock' as const }, { to: '/customer/reservations', label: '예약내역', icon: 'calendar' as const }, { to: '/customer/chats', label: '채팅', icon: 'chat' as const }] : [{ to: '/owner/alerts', label: '빈자리', icon: 'calendar' as const }, { to: '/owner', label: '홈', icon: 'home' as const }, { to: '/owner/chats', label: '채팅', icon: 'chat' as const }]
  tabs.push({ to: `/${role}/notifications`, label: '알림', icon: 'bell' })
  return <nav className="bottom-nav" aria-label={role === 'customer' ? '고객 메뉴' : '사장님 메뉴'}>{tabs.map((tab) => <NavLink to={tab.to} key={tab.to} end className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}><span><Icon name={tab.icon} size={23} />{tab.icon === 'chat' && hasUnread && <i className="nav-dot" aria-label="새 메시지 있음" />}{tab.to.endsWith('/notifications') && notificationCount > 0 && <i className="nav-dot" aria-label={`읽지 않은 알림 ${notificationCount}개`} />}</span>{tab.label}</NavLink>)}</nav>
}
