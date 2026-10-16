import { Link } from 'react-router-dom'
import { Brand } from '../../components/Brand'
import { Icon, Mascot } from '../../components/Icon'

export function Login() {
  return <div className="login-page">
    <div className="login-top"><Brand /><span className="demo-tag">미리 만나보기</span></div>
    <div className="login-intro"><span className="eyebrow">나에게 딱 맞는 빈자리</span><h1>비어 있던 시간에,<br /><span>새로운 가치를.</span></h1><p>우리 동네 뷰티샵의 빈자리를 발견하고<br />조금 더 기분 좋은 가격으로 만나요.</p></div>
    <div className="login-art"><span className="art-flower"><Icon name="sparkles" size={28} /></span><span className="art-caption art-caption-one">마침, 오늘 시간 돼요!</span><Mascot /><span className="art-caption art-caption-two"><Icon name="heart" size={14} /> 빈자리가 선물이 되는 순간</span><span className="art-small-flower"><Icon name="sparkle" size={22} /></span></div>
    <div className="login-bottom"><Link className="button login-start" to="/choose-role">빈틈 시작하기<Icon name="chevron-right" size={19} /></Link><p>지금은 카카오 연결 없이 체험할 수 있어요.</p></div>
  </div>
}
