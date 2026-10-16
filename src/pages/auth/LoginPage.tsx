import { Link } from 'react-router-dom'
import { Brand } from '../../components/Brand'
import { Icon, Mascot } from '../../components/Icon'

export function Login() {
  return <div className="login-page">
    <div className="login-top"><Brand /><span className="demo-tag">미리 만나보기</span></div>
    <div className="login-intro"><span className="eyebrow">나에게 딱 맞는 빈자리</span><h1>앗, 비었네?<br />나를 위한 <span>좋은 시간.</span></h1><p>우리 동네 뷰티샵의 빈자리를 발견하고<br />조금 더 기분 좋은 가격으로 만나요.</p></div>
    <div className="login-art"><span className="art-flower">✳</span><span className="art-caption art-caption-one">마침, 오늘 시간 돼요!</span><Mascot /><span className="art-caption art-caption-two"><Icon name="heart" size={14} /> 빈자리가 선물이 되는 순간</span><span className="art-small-flower">✦</span></div>
    <div className="login-bottom"><Link className="kakao-button" to="/choose-role"><svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M12 3C6.5 3 2 6.5 2 10.7c0 2.8 1.9 5.2 4.8 6.6l-1 3.7 4.4-2.7 1.8.1c5.5 0 10-3.5 10-7.7S17.5 3 12 3Z" /></svg>카카오로 시작하기</Link><p>지금은 카카오 연결 없이 체험할 수 있어요.</p></div>
  </div>
}
