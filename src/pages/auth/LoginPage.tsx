import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Brand } from '../../components/Brand'
import { Icon, Mascot } from '../../components/Icon'
import { KAKAO_LOGIN_URL, logout, readSession } from '../../lib/auth'
import type { SessionResult } from '../../lib/auth'

export function Login() {
  const [session, setSession] = useState<SessionResult | { status: 'loading' | 'error' }>({ status: 'loading' })
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [loggingOut, setLoggingOut] = useState(false)
  const [searchParams] = useSearchParams()
  const oauthFailed = searchParams.get('error') === 'OAUTH_FAILED'

  useEffect(() => {
    const controller = new AbortController()
    void readSession(controller.signal).then((result) => {
      if (!controller.signal.aborted) setSession(result)
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return
      setSession({ status: 'error' })
      setError(cause instanceof Error ? cause.message : '로그인 상태를 확인하지 못했어요. 다시 시도해 주세요.')
    })
    return () => controller.abort()
  }, [attempt])

  function retry() {
    setSession({ status: 'loading' })
    setError('')
    setAttempt((value) => value + 1)
  }

  async function signOut() {
    setLoggingOut(true)
    setError('')
    try {
      await logout()
      setSession({ status: 'anonymous' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '로그아웃하지 못했어요. 다시 시도해 주세요.')
    } finally {
      setLoggingOut(false)
    }
  }

  return <div className="login-page">
    <div className="login-top"><Brand /><span className="demo-tag">카카오 계정</span></div>
    <div className="login-intro"><span className="eyebrow">나에게 딱 맞는 빈자리</span><h1>비어 있던 시간에,<br /><span>새로운 가치를.</span></h1><p>우리 동네 뷰티샵의 빈자리를 발견하고<br />조금 더 기분 좋은 가격으로 만나요.</p></div>
    <div className="login-art"><span className="art-flower"><Icon name="sparkles" size={28} /></span><span className="art-caption art-caption-one">마침, 오늘 시간 돼요!</span><Mascot /><span className="art-caption art-caption-two"><Icon name="heart" size={14} /> 빈자리가 선물이 되는 순간</span><span className="art-small-flower"><Icon name="sparkle" size={22} /></span></div>
    <div className="login-bottom">
      {oauthFailed && <p className="account-error" role="alert">카카오 로그인을 완료하지 못했어요. 다시 시도해 주세요.</p>}
      {session.status === 'loading' && <p role="status">로그인 상태를 확인하고 있어요…</p>}
      {session.status === 'authenticated' && <section className="account-card session-profile" aria-label="로그인한 계정">
        <h2>{session.user.displayName}님, 반가워요!</h2>
        <dl className="account-details"><dt>사용자 ID</dt><dd>{session.user.id}</dd><dt>역할</dt><dd>{session.user.roles.map((role) => role === 'CUSTOMER' ? '고객' : role === 'OWNER' ? '사장님' : role).join(', ') || '등록된 역할 없음'}</dd></dl>
      </section>}
      {session.status === 'profile-unavailable' && <p role="status">카카오 세션은 확인됐지만 사용자 정보를 아직 불러올 수 없어요. 잠시 후 다시 확인해 주세요.</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
      {(session.status === 'error' || session.status === 'profile-unavailable') && <button type="button" className="button secondary login-start" disabled={loggingOut} onClick={retry}>로그인 상태 다시 확인</button>}
      {session.status !== 'loading' && (session.status === 'authenticated' || session.status === 'profile-unavailable'
        ? <button type="button" className="button secondary login-start" disabled={loggingOut} onClick={() => void signOut()}>{loggingOut ? '로그아웃 중…' : '로그아웃'}</button>
        : <button type="button" className="button login-start kakao-login" onClick={() => window.location.assign(KAKAO_LOGIN_URL)}>{oauthFailed ? '카카오 로그인 다시 시도' : '카카오로 로그인'}<Icon name="chevron-right" size={19} /></button>)}
      <Link className="account-text-button login-demo" to="/choose-role">데모 둘러보기<Icon name="chevron-right" size={16} /></Link>
      <p>데모의 역할·예약·채팅은 실제 계정과 별도로 동작해요.</p>
    </div>
  </div>
}
