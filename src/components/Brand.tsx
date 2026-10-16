export function Brand({ large = false }: { large?: boolean }) {
  return <span className={`brand ${large ? 'brand-large' : ''}`}><span className="brand-mark"><img src="/icons/puzzle-mark-192.png" width={large ? 48 : 38} height={large ? 48 : 38} alt="" /></span><img className="brand-wordmark" src="/images/bintime-wordmark-03.png" width="1186" height="256" alt="빈틈 BinTime" /></span>
}
