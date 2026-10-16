import { Link } from 'react-router-dom'
import { Brand } from './Brand'
import { Icon, Mascot } from './Icon'

export function DesktopIntro() {
  return (
    <aside className="desktop-intro"><Link to="/login" aria-label="Oracle 시작 화면"><Brand large /></Link><div className="desktop-copy"><span className="desktop-pill">우리 동네 뷰티 빈자리 찾기</span><h1>비어 있던 시간,<br /><span>나를 위한 시간.</span></h1><p>기다리던 뷰티샵의 빈자리를<br />뜻밖의 좋은 가격으로 만나보세요.</p><Mascot className="desktop-mascot" /><div className="desktop-caption"><Icon name="sparkle" size={18} /> 작은 빈자리가, 기분 좋은 하루로</div></div><div className="desktop-footer"><span>좋은 시간, 뜻밖의 발견</span><small>화면 미리보기 · 샘플 데이터</small></div></aside>
  )
}
