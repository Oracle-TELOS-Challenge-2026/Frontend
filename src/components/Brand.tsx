import { Icon } from './Icon'

export function Brand({ large = false }: { large?: boolean }) {
  return <span className={`brand ${large ? 'brand-large' : ''}`}><span className="brand-mark"><Icon name="pin" size={large ? 30 : 23} /></span>oracle<span className="brand-dot">.</span></span>
}
