import { startTransition, useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { Modal } from './components/Modal'
import { useAccount } from './hooks/useAccount'
import { useChat } from './hooks/useChat'
import { useNotifications } from './hooks/useNotifications'
import { NotificationsPage } from './pages/NotificationsPage'
import { CustomerChats } from './pages/customer/ChatsPage'
import { OwnerManage } from './pages/owner/ManagePage'
import { usePushNotifications } from './hooks/usePushNotifications'
import { Login } from './pages/auth/LoginPage'
import { RoleSelection } from './pages/auth/RoleSelectionPage'
import { CustomerHome } from './pages/customer/HomePage'
import { ShopDetail } from './pages/customer/ShopDetailPage'
import { WaitlistPage } from './pages/customer/WaitlistPage'
import { ReservationsPage } from './pages/customer/ReservationsPage'
import { OwnerHome } from './pages/owner/HomePage'
import { OwnerAlerts } from './pages/owner/AlertsPage'
import { OwnerChats } from './pages/owner/ChatsPage'
import { ChatPage } from './pages/ChatPage'
import { ChatNotificationPage } from './pages/ChatNotificationPage'
import { Registration } from './pages/owner/RegistrationPage'
import { ProfilePage } from './pages/ProfilePage'
import { PreferencesPage } from './pages/PreferencesPage'
import { accountStartPath } from './lib/account'
import { notificationPath } from './lib/notifications'
import { notificationClickPath, notificationTarget } from './lib/notification-navigation'
import type { AccountState, Role } from './types'
import './styles/customer.css'
import './styles/owner.css'
import './styles/auth.css'
import './styles/chat.css'
import './styles/profile.css'

function RoleGate({ role, account }: { role: Role; account: AccountState }) {
  if (account.role !== role || (role === 'owner' && !account.shop?.serviceId)) return <Navigate to={accountStartPath(account)} replace />
  return <Outlet />
}

function App() {
  const { account, user, loading, error, clearError, selectRole, registerShop, savePreferences, refresh, refreshUser, refreshShop, signOut } = useAccount()
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)
  const [confirmRole, setConfirmRole] = useState<Role | null>(null)
  const notify = useCallback((text: string) => setToast({ text, id: Date.now() }), [])
  const chat = useChat(user?.id)
  const notifications = useNotifications(user?.id, notify)
  const push = usePushNotifications(notifications.announce, user?.id)
  const navigate = useNavigate()
  const location = useLocation()
  const startPath = accountStartPath(account)
  const loginPage = location.pathname === '/' || location.pathname.replace(/\/+$/, '') === '/login'
  let loginDestination = startPath
  if (loginPage && user) {
    try {
      const path = sessionStorage.getItem('bintime.notification.return')
      if (path) loginDestination = notificationPath(path)
    } catch { /* 저장 공간을 사용할 수 없으면 기본 화면으로 이동한다. */ }
  }
  const ownerChat = { ...chat, conversations: chat.conversations.filter((room) => user?.ownedStoreIds.includes(room.store.id)) }
  const hasUnread = (account.role === 'owner' ? ownerChat.conversations : chat.conversations.filter((room) => room.customer.id === user?.id)).some((room) => room.unreadCount > 0)
  const notification = notificationTarget(location.pathname + location.search + location.hash)
  const notificationId = notification?.notificationId
  const chatNotification = notification?.kind === 'chat'
  const { markRead } = notifications
  const notificationRevision = Date.parse(notifications.items[0]?.createdAt ?? '') || 0
  const openNotificationPath = useCallback((path: string) => {
    if (notificationTarget(path)?.kind !== 'chat') {
      if (path.startsWith('/customer/')) selectRole('customer')
      if (/^\/owner(?:[/?#]|$)/.test(path)) selectRole('owner')
    }
    navigate(path)
  }, [navigate, selectRole])
  const showError = Boolean(error && !loginPage && !['/choose-role', '/owner/register', '/customer/profile/preferences'].includes(location.pathname))
  const errorToast = useMemo(() => ({ text: error, id: 0 }), [error])
  const visibleToast = showError ? errorToast : toast

  useEffect(() => {
    if (!visibleToast) return
    const timer = window.setTimeout(() => {
      setToast(null)
      if (visibleToast.id === 0) clearError()
    }, 3000)
    return () => window.clearTimeout(timer)
  }, [visibleToast, clearError])

  useEffect(() => {
    function openPushNotification(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.data?.type !== 'bintime:notification-click' || typeof event.data.url !== 'string') return
      const path = notificationClickPath(event.data.url, window.location.origin, event.data)
      if (path) openNotificationPath(path)
    }
    navigator.serviceWorker?.addEventListener('message', openPushNotification)
    return () => navigator.serviceWorker?.removeEventListener('message', openPushNotification)
  }, [openNotificationPath])

  useEffect(() => {
    if (loading) return
    try {
      if (!user && (!loginPage || notificationId || chatNotification)) sessionStorage.setItem('bintime.notification.return', location.pathname + location.search + location.hash)
      else if (user && (!loginPage || notificationId || chatNotification)) sessionStorage.removeItem('bintime.notification.return')
    } catch { /* 저장 공간을 사용할 수 없어도 로그인과 알림 확인은 계속한다. */ }
    if (!user || chatNotification || !notificationId) return
    const params = new URLSearchParams(location.search)
    params.delete('notificationId')
    if (location.pathname.startsWith('/customer/')) selectRole('customer')
    if (location.pathname === '/owner' || location.pathname.startsWith('/owner/')) selectRole('owner')
    navigate(location.pathname + (params.size ? `?${params}` : '') + location.hash, { replace: true })
    void markRead(notificationId).catch((cause: unknown) => notify(cause instanceof Error ? cause.message : '알림을 읽음으로 표시하지 못했어요.'))
  }, [notificationId, chatNotification, user, loading, loginPage, location.pathname, location.search, location.hash, navigate, selectRole, markRead, notify])

  function enterRole(role: Role) {
    startTransition(() => {
      if (selectRole(role)) navigate(accountStartPath({ ...account, role }), { replace: true })
    })
  }
  function switchRole() {
    setConfirmRole(account.role === 'owner' ? 'customer' : 'owner')
  }

  return <AppLayout toast={visibleToast} hasUnread={hasUnread} notificationCount={notifications.unreadCount} onSwitch={switchRole}>
    {loading || (user && notificationId) ? <div className="app-loading" role="status">계정 정보를 확인하고 있어요…</div>
      : !user ? loginPage ? <Login loading={loading} error={error} onRefresh={refresh} /> : <Navigate to="/login" replace />
      : notification?.kind === 'chat' ? <ChatNotificationPage key={user.id + location.key} roomId={notification.roomId} chat={chat} user={user} onSelectRole={selectRole} onRefreshSession={refresh} accountError={error} fallback={startPath} />
      : loginPage ? <Navigate to={loginDestination} replace />
      : account.role === 'owner' && user.ownedStoreIds.length > 0 && !account.shop ? <div className="page"><p role="alert">{error || '등록된 가게를 불러오지 못했어요.'}</p><button className="button" onClick={() => void refresh()}>다시 조회</button><button className="button secondary" onClick={() => enterRole('customer')}>고객 화면으로</button><button className="account-text-button" onClick={() => void signOut()}>로그아웃</button></div>
      : <Routes>
        <Route path="/choose-role" element={account.role ? <Navigate to={startPath} replace /> : <RoleSelection onSelect={enterRole} error={error} />} />
        <Route path="/owner/register" element={account.role === 'owner' && !account.shop?.serviceId ? <Registration shop={account.shop} error={error} onCancel={() => enterRole('customer')} onRegister={async (input) => { if (!await registerShop(input)) return false; navigate('/owner', { replace: true }); return true }} /> : <Navigate to={startPath} replace />} />
        <Route element={<RoleGate role="customer" account={account} />}>
          <Route path="/customer" element={<CustomerHome />} />
          <Route path="/customer/waitlist" element={<WaitlistPage key={location.key} savedLocation={user.location} revision={notificationRevision} />} />
          <Route path="/customer/waitlist/:id" element={<WaitlistPage key={location.key} savedLocation={user.location} revision={notificationRevision} />} />
          <Route path="/customer/notifications" element={<NotificationsPage notifications={notifications} onOpen={openNotificationPath} />} />
          <Route path="/customer/chats" element={<CustomerChats chat={chat} userId={user.id} />} />
          <Route path="/customer/reservations/:id" element={<ReservationsPage key={location.key} />} />
          <Route path="/customer/reservations" element={<ReservationsPage key={location.key} />} />
          <Route path="/customer/shops/:id" element={<ShopDetail key={location.pathname + location.search} />} />
          <Route path="/customer/chat/:id" element={<ChatPage key={location.pathname} chat={chat} role="customer" userId={user.id} />} />
          <Route path="/customer/profile" element={<ProfilePage role="customer" shop={account.shop} preferences={account.preferences} push={push} user={user} onChanged={refreshUser} onLogout={signOut} />} />
          <Route path="/customer/profile/preferences" element={<PreferencesPage value={account.preferences} onSave={savePreferences} error={error} />} />
        </Route>
        <Route element={<RoleGate role="owner" account={account} />}>
          <Route path="/owner" element={<OwnerHome key={location.key} ownerShop={account.shop} />} />
          <Route path="/owner/manage" element={<OwnerManage ownerShop={account.shop} onChanged={refreshShop} />} />
          <Route path="/owner/notifications" element={<NotificationsPage notifications={notifications} onOpen={openNotificationPath} />} />
          <Route path="/owner/alerts" element={<OwnerAlerts key={location.key} ownerShop={account.shop} notify={notify} />} />
          <Route path="/owner/chats" element={<OwnerChats chat={ownerChat} />} />
          <Route path="/owner/chat/:id" element={<ChatPage key={location.pathname} chat={ownerChat} role="owner" userId={user.id} ownerShop={account.shop} />} />
          <Route path="/owner/profile" element={<ProfilePage role="owner" shop={account.shop} preferences={account.preferences} push={push} user={user} onChanged={refreshUser} onLogout={signOut} />} />
        </Route>
        <Route path="*" element={<Navigate to={startPath} replace />} />
      </Routes>}
    {confirmRole && user && <Modal title={confirmRole === 'customer' ? '고객으로 전환할까요?' : '사장님으로 전환할까요?'} onClose={() => setConfirmRole(null)}>
      <div className="account-form">
        <p className="muted">{confirmRole === 'customer' ? '주변 가게를 찾고 예약할 수 있는 고객 화면으로 이동해요.' : account.shop?.serviceId ? '등록한 가게의 사장님 화면으로 이동해요.' : '가게 등록을 시작할게요.'}</p>
        <div className="account-form-actions">
          <button type="button" className="button secondary" onClick={() => setConfirmRole(null)}>취소</button>
          <button type="button" className="button" onClick={() => { enterRole(confirmRole); setConfirmRole(null) }}>확인</button>
        </div>
      </div>
    </Modal>}
  </AppLayout>
}

export default App
