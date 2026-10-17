import { useLayoutEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Brand } from './Brand'
import { BottomNav } from './BottomNav'
import { DesktopIntro } from './DesktopIntro'
import { Icon } from './Icon'
import { AccountActions } from './AccountActions'

export function AppLayout({ children, toast, hasUnread, notificationCount, onSwitch }: { children: ReactNode; toast: { text: string; id: number } | null; hasUnread: boolean; notificationCount: number; onSwitch: () => void }) {
  const location = useLocation()
  const stage = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const role = location.pathname.startsWith('/owner') ? 'owner' : 'customer'
  const isApp = (location.pathname.startsWith('/customer') || location.pathname.startsWith('/owner')) && !['/owner/register', '/customer/register'].includes(location.pathname)
  const isChat = location.pathname.includes('/chat/')
  const isCustomerMap = location.pathname.replace(/\/$/, '') === '/customer'
  useLayoutEffect(() => { content.current?.scrollTo(0, 0) }, [location.pathname])
  useLayoutEffect(() => {
    const element = stage.current
    const viewport = window.visualViewport
    function resize() {
      // 손가락 확대 때문에 줄어든 영역으로 앱 전체를 다시 배치하지 않는다.
      if (viewport && viewport.scale !== 1) return
      const height = Math.min(window.innerHeight, viewport?.height ?? window.innerHeight)
      if (height > 0) element?.style.setProperty('--app-height', `${height}px`)
    }
    resize()
    window.addEventListener('resize', resize)
    window.addEventListener('pageshow', resize)
    viewport?.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('pageshow', resize)
      viewport?.removeEventListener('resize', resize)
      element?.style.removeProperty('--app-height')
    }
  }, [])

  return <div ref={stage} className="app-stage">
    <DesktopIntro />
    <main className={`app-frame ${isApp ? 'in-app' : 'auth-frame'}`}>
      {isApp && <header className="app-header">
        <Link to={`/${role}`} aria-label="홈으로"><Brand /></Link>
        <AccountActions role={role} onSwitch={onSwitch} />
      </header>}
      <div className="app-content"><div ref={content} className={`page-viewport ${isChat || isCustomerMap ? 'viewport-fixed' : ''}`}>{children}</div></div>
      {isApp && !isChat && <BottomNav role={role} hasUnread={hasUnread} notificationCount={notificationCount} />}
      {toast && <div className="toast" key={toast.id} role="status"><Icon name="check" size={18} />{toast.text}</div>}
    </main>
  </div>
}
