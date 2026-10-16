import { Link } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { CUSTOMER_ID, DEMO_DAY, DEMO_NOW, dateLabel, timeLabel } from '../../model'
import type { DemoProps } from '../../model'
import { ShopCard } from '../../components/customer/ShopCard'

export function ReservationsPage({ shops, reservations }: DemoProps) {
  const mine = reservations.filter((item) => item.customerId === CUSTOMER_ID)
  const upcoming = mine.filter((item) => item.status === 'confirmed' && item.startsAt >= DEMO_NOW).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const past = mine.filter((item) => item.status === 'completed' || item.startsAt < DEMO_NOW).sort((a, b) => b.startsAt.localeCompare(a.startsAt))
  return <div className="page"><header className="customer-record-heading"><p className="eyebrow">나를 위한 시간이 기다려요</p><h1 className="page-heading">예약내역</h1><p className="muted">기분 좋은 약속, 여기 모아두었어요.</p></header><div className="customer-note"><Icon name="calendar" size={20} /><span>{upcoming.length ? <>다가오는 예약이 <strong>{upcoming.length}건</strong> 있어요.<br />가장 가까운 예약부터 보여드려요.</> : <>아직 다가오는 예약이 없어요.<br />나만의 시간을 하나 만들어 볼까요?</>}</span></div>
    {[{ title: '다가오는 예약', items: upcoming, completed: false }, { title: '지난 예약', items: past, completed: true }].map((group) => <section key={group.title}><h2 className="record-count">{group.title} <strong>{group.items.length}</strong></h2>{group.items.map((item) => {
      const shop = shops.find((entry) => entry.id === item.shopId)
      if (!shop) return null
      return <article key={item.id} className={`reservation-card ${group.completed ? 'completed' : ''}`}><div className="record-status"><span className={`badge ${group.completed ? '' : 'coral'}`}>{group.completed ? '이용 완료' : '✓ 예약 확정'}</span><span>{item.startsAt.startsWith(DEMO_DAY) ? '오늘 만나요' : dateLabel(item.startsAt)}</span></div><ShopCard shop={shop} slot={item} compact /><div className="record-schedule"><Icon name="calendar" size={15} />{dateLabel(item.startsAt)} · {timeLabel(item.startsAt)} <span style={{ marginLeft: 'auto', fontSize: 10 }}>{item.duration}분</span></div><div className="record-actions"><Link className="button secondary small" to={`/customer/shops/${shop.id}`}>{group.completed ? '다시 예약하기' : '가게 보기'}</Link><Link className="button secondary small" to={`/customer/chat/${shop.id}`}><Icon name="chat" size={15} />채팅 문의</Link></div></article>
    })}{!group.items.length && !group.completed && <div className="empty-state"><Icon name="calendar" size={32} /><p>가까운 가게에서 반가운 빈자리를 찾아보세요.</p><Link className="button secondary" to="/customer">예약하러 가기</Link></div>}{!group.items.length && group.completed && <p className="muted" style={{ fontSize: 12 }}>이용한 예약이 아직 없어요.</p>}</section>)}
  </div>
}
