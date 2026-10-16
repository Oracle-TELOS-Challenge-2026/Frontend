import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { dateLabel, getAvailableSlots, timeLabel } from '../../model'
import type { DemoProps, WaitlistItem } from '../../model'
import { ShopCard } from '../../components/customer/ShopCard'
import { WaitlistDialog } from '../../components/customer/WaitlistDialog'

export function WaitlistPage({ shops, reservations, waitlist, onReserve, onUpdateWaitlist, onRemoveWaitlist }: DemoProps) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState<WaitlistItem | null>(null)
  const [error, setError] = useState('')
  const editingShop = shops.find((shop) => shop.id === editing?.shopId)
  const items = [...waitlist].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  return <div className="page"><header className="customer-record-heading"><p className="eyebrow">기다림도, 설레게</p><h1 className="page-heading">대기내역</h1><p className="muted">원하던 시간에 빈자리가 생기면 알려드려요.</p></header><div className="customer-note"><Icon name="bell" size={19} /><span>대기는 예약 확정이 아니에요.<br />빈자리가 생기면 직접 예약해 주세요.</span></div><p className="record-count">알림 신청 <strong>{items.length}</strong>건 <span style={{ float: 'right', fontSize: 11 }}>최근 신청순</span></p>{error && <p className="form-error" role="alert">{error}</p>}
    {items.length ? items.map((item) => {
      const shop = shops.find((entry) => entry.id === item.shopId)
      if (!shop) return null
      const slot = getAvailableSlots(shop, reservations).find((entry) => entry.startsAt.startsWith(item.preferredDate) && timeLabel(entry.startsAt) === item.preferredTime)
      return <article key={item.id} className="waitlist-card"><div className="record-status"><span className={`badge ${slot ? 'coral' : ''}`}>{slot ? '✦ 예약할 수 있어요' : '빈자리 기다리는 중'}</span><span>{dateLabel(item.createdAt)} 신청</span></div><ShopCard shop={shop} slot={slot} compact /><div className="record-schedule"><Icon name="clock" size={15} />희망 시간 · {dateLabel(`${item.preferredDate}T00:00:00+09:00`)} {item.preferredTime}</div>{slot ? <button className="button small" style={{ width: '100%' }} onClick={() => { if (onReserve(shop.id, slot.startsAt)) navigate('/customer/reservations'); else setError('방금 예약된 시간이에요. 다른 빈자리를 확인해 주세요.') }}>이 시간 예약하기<Icon name="chevron-right" size={15} /></button> : <Link className="button secondary small" style={{ width: '100%' }} to={`/customer/shops/${shop.id}`}>다른 시간 둘러보기</Link>}<div className="record-secondary-actions"><button onClick={() => setEditing(item)}>시간 변경</button><button onClick={() => onRemoveWaitlist(item.id)}>대기 취소</button></div></article>
    }) : <div className="empty-state"><Icon name="bell" size={35} /><h2>기다리는 빈자리가 없어요</h2><p>마음에 드는 가게에서 알림을 신청해 보세요.</p><Link className="button secondary" to="/customer">가게 둘러보기</Link></div>}
    <p className="muted" style={{ textAlign: 'center', fontSize: 10, marginTop: 24 }}>데모에서는 알림이 실제로 발송되지 않아요.</p>
    {editing && editingShop && <WaitlistDialog shop={editingShop} item={editing} onSave={(date, time) => onUpdateWaitlist(editing.id, date, time)} onClose={() => setEditing(null)} />}
  </div>
}
