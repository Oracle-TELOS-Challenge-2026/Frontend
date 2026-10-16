import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { PublishDialog } from '../../components/owner/PublishDialog'
import { dateLabel, money, timeLabel } from '../../model'
import type { Cancellation, DemoProps } from '../../model'

export function OwnerAlerts({ cancellations, ownerShop, onPublish }: DemoProps) {
  const [selected, setSelected] = useState<Cancellation | null>(null)
  const alerts = cancellations.filter((item) => item.shopId === ownerShop?.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const available = alerts.filter((item) => !item.publishedAt).length

  return <div className="page owner-page">
    <p className="eyebrow">빈 시간도, 새로운 기회로</p>
    <h1 className="page-heading">빈자리 알림</h1>
    <div className="owner-info"><Icon name="sparkle" /><div><strong>{available > 0 ? `${available}개의 빈자리가 기다리고 있어요` : alerts.length > 0 ? '빈자리를 모두 알렸어요' : '아직 빈자리 알림이 없어요'}</strong><p>취소된 시간에 특별한 가격을 더해보세요.<br />이 시간을 기다리던 고객과 만날 수 있어요.</p></div></div>
    <div className="owner-list-heading"><h2>취소 · 노쇼 내역 <span>{alerts.length}</span></h2><span>최근 접수순</span></div>
    <div className="owner-alert-list">
      {alerts.map((alert) => <article className="owner-alert-card" key={alert.id}>
        <div className="owner-alert-top"><span className={`badge ${!alert.publishedAt ? 'coral' : ''}`}>{alert.reason === '노쇼' ? '노쇼 접수' : '예약 취소'}</span><time dateTime={alert.createdAt}>{timeLabel(alert.createdAt)} 접수</time></div>
        <div className="owner-alert-date"><Icon name="calendar" /><span>{dateLabel(alert.startsAt)} · {timeLabel(alert.startsAt)}</span></div>
        <h3>{alert.service}</h3><p>{alert.publishedAt ? '지도에서 고객에게 특별한 가격으로 보여요.' : '가능한 시술과 할인 가격을 등록해 주세요.'}</p>
        <div className="owner-alert-bottom"><div>{alert.price !== undefined && <del>{money(alert.originalPrice)}</del>}<strong>{money(alert.price ?? alert.originalPrice)}</strong></div>{alert.publishedAt ? <span className="owner-published"><Icon name="check" />알림 등록 완료</span> : <button className="button small" type="button" onClick={() => setSelected(alert)}><Icon name="bell" />빈자리 알리기</button>}</div>
      </article>)}
      {alerts.length === 0 && <div className="empty-state"><Icon name="check" /><h2>취소된 예약이 없어요</h2><p>취소나 노쇼가 생기면 여기에 모아드릴게요.</p></div>}
    </div>
    {selected && <PublishDialog cancellation={selected} onPublish={onPublish} onClose={() => setSelected(null)} />}
  </div>
}
