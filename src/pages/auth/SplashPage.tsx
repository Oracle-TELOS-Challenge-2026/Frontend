import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brand } from '../../components/Brand'
import { Mascot } from '../../components/Icon'

export function Splash() {
  const navigate = useNavigate()
  useEffect(() => { const timer = window.setTimeout(() => navigate('/login', { replace: true }), 1300); return () => window.clearTimeout(timer) }, [navigate])
  return <div className="splash"><Mascot /><Brand large /><p>비어 있던 시간에, 새로운 가치를.</p><span className="splash-loading" aria-label="시작하는 중" /></div>
}
