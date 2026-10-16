import { useSearchParams } from 'react-router-dom'
import { Brand } from '../../components/Brand'
import { Icon, Mascot } from '../../components/Icon'
import { KAKAO_LOGIN_URL } from '../../lib/auth'

export function Login({ loading, error, onRefresh }: {
  loading: boolean; error: string; onRefresh: () => Promise<void>
}) {
  const [searchParams] = useSearchParams()
  const oauthFailed = searchParams.get('error') === 'OAUTH_FAILED'

  return <div className="login-page">
    <div className="login-top"><Brand /><span className="account-tag">카카오 계정</span></div>
    <div className="login-intro"><span className="eyebrow">나에게 딱 맞는 빈자리</span><h1>비어 있던 시간에,<br /><span>새로운 가치를.</span></h1><p>우리 동네 뷰티샵의 빈자리를 발견하고<br />조금 더 기분 좋은 가격으로 만나요.</p></div>
    <div className="login-art"><span className="art-flower"><Icon name="sparkles" size={28} /></span><span className="art-caption art-caption-one">마침, 오늘 시간 돼요!</span><Mascot /><span className="art-caption art-caption-two"><Icon name="heart" size={14} /> 빈자리가 선물이 되는 순간</span><span className="art-small-flower"><Icon name="sparkle" size={22} /></span></div>
    <div className="login-bottom">
      {oauthFailed && <p className="account-error" role="alert">카카오 로그인을 완료하지 못했어요. 다시 시도해 주세요.</p>}
      {loading && <p role="status">로그인 상태를 확인하고 있어요…</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
      {error && <button type="button" className="button secondary login-start" disabled={loading} onClick={() => void onRefresh()}>로그인 상태 다시 확인</button>}
      {!loading && <button type="button" className="button login-start kakao-login" onClick={() => window.location.assign(KAKAO_LOGIN_URL)}>{oauthFailed ? '카카오 로그인 다시 시도' : '카카오로 로그인'}<Icon name="chevron-right" size={19} /></button>}
      <p>카카오 계정으로 로그인하고 빈틈을 이용해 보세요.</p>
    </div>
  </div>
}
