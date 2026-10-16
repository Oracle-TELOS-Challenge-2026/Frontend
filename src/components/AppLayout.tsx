import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Brand } from './Brand'
import { BottomNav } from './BottomNav'
import { DesktopIntro } from './DesktopIntro'
import { Icon } from './Icon'

export function AppLayout({ children, toast, hasUnread }: { children: ReactNode; toast: { text: string; id: number } | null; hasUnread: boolean }) {
  const location = useLocation()
  const content = useRef<HTMLDivElement>(null)
  const role = location.pathname.startsWith('/owner') ? 'owner' : 'customer'
  const isApp = location.pathname.startsWith('/customer') || location.pathname.startsWith('/owner')
  const isChat = location.pathname.includes('/chat/')
  const isCustomerMap = location.pathname.replace(/\/$/, '') === '/customer'
  useEffect(() => { content.current?.scrollTo(0, 0) }, [location.pathname])

  return <div className="app-stage">
    <DesktopIntro />
    <main className={`app-frame ${isApp ? 'in-app' : 'auth-frame'}`}>
      {isApp && !isCustomerMap && <header className="app-header">
        <Link to={`/${role}`} aria-label="홈으로"><Brand /></Link>
        {role === 'owner' && <span className="header-role">사장님</span>}
        <Link to="/choose-role" className="role-switch"><Icon name="user" size={15} />역할 변경</Link>
      </header>}
      <div ref={content} className={`app-content ${isChat ? 'chat-content' : ''}`}>{children}</div>
      {isApp && !isChat && <BottomNav role={role} hasUnread={hasUnread} />}
      {toast && <div className="toast" key={toast.id} role="status"><Icon name="check" size={18} />{toast.text}</div>}
    </main>
  </div>
}
