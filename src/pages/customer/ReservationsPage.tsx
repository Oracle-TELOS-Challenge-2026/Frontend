import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { CUSTOMER_ID, DEMO_DAY, DEMO_NOW, dateLabel, timeLabel } from '../../model'
import type { DemoProps, Reservation } from '../../model'
import { ShopCard } from '../../components/customer/ShopCard'

export function ReservationsPage({ shops, reservations, onRemoveReservation }: DemoProps) {
  const [removing, setRemoving] = useState<Reservation | null>(null)
  const mine = reservations.filter((item) => item.customerId === CUSTOMER_ID && !item.hiddenFromCustomer)
  const upcoming = mine.filter((item) => item.status === 'confirmed' && item.startsAt >= DEMO_NOW).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const past = mine.filter((item) => item.status === 'completed' || item.startsAt < DEMO_NOW).sort((a, b) => b.startsAt.localeCompare(a.startsAt))
  return <div className="page"><header className="customer-record-heading"><p className="eyebrow">나를 위한 시간이 기다려요</p><h1 className="page-heading">예약내역</h1><p className="muted">기분 좋은 약속, 여기 모아두었어요.</p></header><div className="customer-note"><Icon name="calendar" size={20} /><span>{upcoming.length ? <>다가오는 예약이 <strong>{upcoming.length}건</strong> 있어요.<br />가장 가까운 예약부터 보여드려요.</> : <>아직 다가오는 예약이 없어요.<br />나만의 시간을 하나 만들어 볼까요?</>}</span></div>
    {[{ title: '다가오는 예약', items: upcoming, completed: false }, { title: '지난 예약', items: past, completed: true }].map((group) => <section key={group.title}><h2 className="record-count">{group.title} <strong>{group.items.length}</strong></h2>{group.items.map((item) => {
      const shop = shops.find((entry) => entry.id === item.shopId)
      if (!shop) return null
      return <article key={item.id} className={`reservation-card ${group.completed ? 'completed' : ''}`}><div className="record-status"><span className="badge">{group.completed ? '이용 완료' : '✓ 예약 확정'}</span><span>{item.startsAt.startsWith(DEMO_DAY) ? '오늘 만나요' : dateLabel(item.startsAt)}</span></div><ShopCard shop={shop} slot={item} compact /><div className="record-schedule"><Icon name="calendar" size={15} />{dateLabel(item.startsAt)} · {timeLabel(item.startsAt)} <span style={{ marginLeft: 'auto', fontSize: 10 }}>{item.duration}분</span></div><div className="record-actions"><Link className="button secondary small" to={`/customer/shops/${shop.id}`}>{group.completed ? '다시 예약하기' : '가게 보기'}</Link><Link className="button secondary small" to={`/customer/chat/${shop.id}`}><Icon name="chat" size={15} />채팅 문의</Link></div>{group.completed && <div className="record-secondary-actions"><button type="button" onClick={() => setRemoving(item)}>내역 삭제</button></div>}</article>
    })}{!group.items.length && !group.completed && <div className="empty-state"><Icon name="calendar" size={32} /><p>가까운 가게에서 반가운 빈자리를 찾아보세요.</p><Link className="button secondary" to="/customer">예약하러 가기</Link></div>}{!group.items.length && group.completed && <p className="muted" style={{ fontSize: 12 }}>표시할 지난 예약내역이 없어요.</p>}</section>)}
    {removing && <Modal title="지난 예약을 삭제할까요?" onClose={() => setRemoving(null)} className="customer-dialog">
      <p className="muted">선택한 예약이 내 예약내역에서 삭제돼요.</p>
      <div className="record-schedule"><Icon name="calendar" size={18} /><div><strong>{shops.find((shop) => shop.id === removing.shopId)?.name}</strong><p>{dateLabel(removing.startsAt)} · {timeLabel(removing.startsAt)}</p></div></div>
      <div className="customer-dialog-actions"><button type="button" className="button secondary" onClick={() => setRemoving(null)}>돌아가기</button><button type="button" className="button" onClick={() => { onRemoveReservation(removing.id); setRemoving(null) }}>삭제하기</button></div>
    </Modal>}
  </div>
}
