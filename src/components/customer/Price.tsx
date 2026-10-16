import { money } from '../../model'
import type { Slot } from '../../model'

export function Price({ price, originalPrice }: Pick<Slot, 'price' | 'originalPrice'>) {
  return <div className="price-line">
    {price < originalPrice && <span className="discount-rate">{Math.round((1 - price / originalPrice) * 100)}%</span>}
    <strong>{money(price)}</strong>
    {price < originalPrice && <del>{money(originalPrice)}</del>}
  </div>
}
