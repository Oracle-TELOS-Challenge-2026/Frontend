import { Navigate, Outlet, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { useAccount } from './hooks/useAccount'
import { useDemo } from './hooks/useDemo'
import { Splash } from './pages/auth/SplashPage'
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
import { Registration } from './pages/owner/RegistrationPage'
import { ProfilePage } from './pages/ProfilePage'
import { PreferencesPage } from './pages/PreferencesPage'
import { accountStartPath } from './lib/account'
import type { AccountState, Role } from './types'
import './styles/customer.css'
import './styles/owner.css'
import './styles/auth.css'
import './styles/chat.css'
import './styles/profile.css'

function RoleGate({ role, account }: { role: Role; account: AccountState }) {
  if (account.role !== role || (role === 'owner' && !account.shop)) return <Navigate to={accountStartPath(account)} replace />
  return <Outlet />
}

function App() {
  const { account, error, selectRole, registerShop, savePreferences } = useAccount()
  const { props, toast } = useDemo(account.shop)
  const navigate = useNavigate()
  const location = useLocation()
  const startPath = accountStartPath(account)
  const hasUnread = props.conversations.some((item) => item.shopId === account.shop?.id && item.unread > 0)
  const showStorageError = error && !['/choose-role', '/owner/register', '/customer/profile/preferences'].includes(location.pathname)

  function enterRole(role: Role) {
    if (selectRole(role)) navigate(accountStartPath({ ...account, role }), { replace: true })
  }
  const switchRole = () => enterRole(account.role === 'owner' ? 'customer' : 'owner')

  return <AppLayout toast={showStorageError ? { text: error, id: 0 } : toast} hasUnread={hasUnread} onSwitch={switchRole}>
    <Routes>
      <Route path="/" element={<Splash destination={startPath} />} />
      <Route path="/login" element={account.role ? <Navigate to={startPath} replace /> : <Login />} />
      <Route path="/choose-role" element={account.role ? <Navigate to={startPath} replace /> : <RoleSelection onSelect={enterRole} error={error} />} />
      <Route path="/owner/register" element={account.role === 'owner' && !account.shop ? <Registration error={error} onCancel={() => enterRole('customer')} onRegister={(input) => { if (!registerShop(input)) return false; navigate('/owner', { replace: true }); return true }} /> : <Navigate to={startPath} replace />} />
      <Route element={<RoleGate role="customer" account={account} />}>
        <Route path="/customer" element={<CustomerHome {...props} onSwitch={switchRole} />} />
        <Route path="/customer/waitlist" element={<WaitlistPage {...props} />} />
        <Route path="/customer/reservations" element={<ReservationsPage {...props} />} />
        <Route path="/customer/shops/:id" element={<ShopDetail {...props} />} />
        <Route path="/customer/chat/:id" element={<ChatPage {...props} role="customer" />} />
        <Route path="/customer/profile" element={<ProfilePage role="customer" shop={account.shop} preferences={account.preferences} />} />
        <Route path="/customer/profile/preferences" element={<PreferencesPage value={account.preferences} onSave={savePreferences} error={error} />} />
      </Route>
      <Route element={<RoleGate role="owner" account={account} />}>
        <Route path="/owner" element={<OwnerHome {...props} />} />
        <Route path="/owner/alerts" element={<OwnerAlerts {...props} />} />
        <Route path="/owner/chats" element={<OwnerChats {...props} />} />
        <Route path="/owner/chat/:id" element={<ChatPage {...props} role="owner" />} />
        <Route path="/owner/profile" element={<ProfilePage role="owner" shop={account.shop} preferences={account.preferences} />} />
      </Route>
      <Route path="*" element={<Navigate to={startPath} replace />} />
    </Routes>
  </AppLayout>
}

export default App
