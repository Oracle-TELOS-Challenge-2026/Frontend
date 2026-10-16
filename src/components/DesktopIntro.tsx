import { Link } from 'react-router-dom'
import { Brand } from './Brand'
import { Icon, Mascot } from './Icon'

export function DesktopIntro() {
  return (
    <aside className="desktop-intro"><Link to="/login" aria-label="빈틈 BinTime 시작 화면"><Brand large /></Link><div className="desktop-copy"><span className="desktop-pill">우리 동네 뷰티 빈자리 찾기</span><h1>비어 있던 시간에,<br /><span>새로운 가치를.</span></h1><p>기다리던 뷰티샵의 빈자리를<br />뜻밖의 좋은 가격으로 만나보세요.</p><Mascot className="desktop-mascot" /><div className="desktop-caption"><Icon name="sparkle" size={18} /> 작은 빈자리가, 기분 좋은 하루로</div></div><div className="desktop-footer"><span>비어 있던 시간에, 새로운 가치를.</span></div></aside>
  )
}
