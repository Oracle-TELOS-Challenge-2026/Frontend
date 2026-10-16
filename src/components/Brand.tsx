export function Brand({ large = false }: { large?: boolean }) {
  return <span className={`brand ${large ? 'brand-large' : ''}`}><span className="brand-mark"><img src="/favicon.svg" width={large ? 38 : 30} height={large ? 38 : 30} alt="" /></span>빈틈<span className="brand-english"> BinTime</span></span>
}
