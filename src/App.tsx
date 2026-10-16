import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
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
import { OWNER_SHOP_ID } from './model'
import './styles/customer.css'
import './styles/owner.css'
import './styles/auth.css'
import './styles/chat.css'

function App() {
  const { props, toast } = useDemo()
  const hasUnread = props.conversations.some((item) => item.shopId === OWNER_SHOP_ID && item.unread > 0)
  return <AppLayout toast={toast} hasUnread={hasUnread}>
    <Routes>
      <Route path="/" element={<Splash />} />
      <Route path="/login" element={<Login />} />
      <Route path="/choose-role" element={<RoleSelection />} />
      <Route path="/customer" element={<CustomerHome {...props} />} />
      <Route path="/customer/waitlist" element={<WaitlistPage {...props} />} />
      <Route path="/customer/reservations" element={<ReservationsPage {...props} />} />
      <Route path="/customer/shops/:id" element={<ShopDetail {...props} />} />
      <Route path="/customer/chat/:id" element={<ChatPage {...props} role="customer" />} />
      <Route path="/owner" element={<OwnerHome {...props} />} />
      <Route path="/owner/alerts" element={<OwnerAlerts {...props} />} />
      <Route path="/owner/chats" element={<OwnerChats {...props} />} />
      <Route path="/owner/chat/:id" element={<ChatPage {...props} role="owner" />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  </AppLayout>
}

export default App
