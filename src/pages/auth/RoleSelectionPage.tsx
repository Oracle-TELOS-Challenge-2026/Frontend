import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import type { Role } from '../../types'

export function RoleSelection({ onSelect, error }: { onSelect: (role: Role) => void; error: string }) {
  return <div className="role-page page"><Link className="icon-button" to="/login" aria-label="로그인 화면으로"><Icon name="arrow-left" /></Link><div className="role-intro"><span className="eyebrow">반가워요, 빈틈이에요</span><h1>어떤 모습으로<br />시작할까요?</h1><p className="muted">처음 한 번만 선택하면 돼요.<br />다음에는 마지막으로 이용한 모습으로 만나요.</p></div>
    <button type="button" className="role-card" onClick={() => onSelect('customer')}><span className="role-illustration"><Icon name="heart" size={27} /></span><span><strong>고객으로 시작하기</strong><small>내 주변 빈자리, 기분 좋은 발견</small></span><Icon name="chevron-right" /></button>
    <button type="button" className="role-card owner-role" onClick={() => onSelect('owner')}><span className="role-illustration"><Icon name="store" size={27} /></span><span><strong>사장님으로 시작하기</strong><small>내 가게를 등록하고 새로운 손님을</small></span><Icon name="chevron-right" /></button>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="role-note"><Icon name="sparkle" size={18} /><p>상단에서 언제든 고객·사장님을 전환할 수 있어요.<br />가게 등록은 사장님으로 시작할 때 한 번만 해요.</p></div><p className="demo-footnote">데모용 역할이며 카카오 계정의 권한은 바뀌지 않아요.<br />선택한 역할과 등록 정보는 이 브라우저에 저장돼요.<br />예약·대기·채팅의 시연 내역은 새로고침하면 초기화돼요.</p>
  </div>
}
