import { Link } from 'react-router-dom'
import { Icon } from './Icon'
import type { Role } from '../types'

export function AccountActions({ role, onSwitch }: { role: Role; onSwitch: () => void }) {
  return <nav className="account-actions" aria-label="계정 메뉴">
    <button type="button" className="role-switch" onClick={onSwitch}><Icon name="refresh" size={15} />{role === 'owner' ? '고객 전환' : '사장님 전환'}</button>
    <Link to={`/${role}/profile`} className="role-switch"><Icon name="user" size={15} />마이페이지</Link>
  </nav>
}
