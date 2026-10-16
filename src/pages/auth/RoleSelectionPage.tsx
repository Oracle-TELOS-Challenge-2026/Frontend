import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'

export function RoleSelection() {
  return <div className="role-page page"><Link className="icon-button" to="/login" aria-label="로그인 화면으로"><Icon name="arrow-left" /></Link><div className="role-intro"><span className="eyebrow">반가워요, 어서 오세요 👋</span><h1>어떤 모습으로<br />만나볼까요?</h1><p className="muted">원하는 화면을 골라 자유롭게 둘러보세요.</p></div>
    <Link className="role-card" to="/customer"><span className="role-illustration">🍑</span><span><strong>고객으로 시작하기</strong><small>내 주변 빈자리, 기분 좋은 발견</small></span><Icon name="chevron-right" /></Link>
    <Link className="role-card owner-role" to="/owner"><span className="role-illustration">🏡</span><span><strong>사장님으로 시작하기</strong><small>비어 있는 시간에 새로운 손님을</small></span><Icon name="chevron-right" /></Link>
    <div className="role-note"><Icon name="sparkle" size={18} /><p>화면을 확인하기 위한 임시 역할 선택이에요.<br />상단에서 언제든 역할을 바꿀 수 있어요.</p></div><p className="demo-footnote">샘플 데이터 · 2026. 10. 16 기준<br />새로고침하면 체험 내역이 초기화돼요.</p>
  </div>
}
