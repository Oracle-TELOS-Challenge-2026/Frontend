import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { BookingProposalDialog } from '../components/owner/BookingProposalDialog'
import { CUSTOMER_ID, DEMO_DAY, dateLabel, money, timeLabel } from '../model'
import { getChatBookingSuggestion } from '../lib/chat-suggestion'
import type { ChatBookingInput, DemoProps, Message, Role } from '../model'

export function ChatPage(props: DemoProps & { role: Role }) {
  const { id } = useParams()
  const [message, setMessage] = useState('')
  const [review, setReview] = useState<{ source: Message; initial: ChatBookingInput } | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [dismissedId, setDismissedId] = useState<string | null>(null)
  const messagesEnd = useRef<HTMLDivElement>(null)
  const conversation = props.conversations.find((item) => props.role === 'customer' ? item.shopId === id && item.customerId === CUSTOMER_ID : item.id === id && item.shopId === props.ownerShop?.id)
  const shop = props.shops.find((item) => item.id === conversation?.shopId) ?? (props.ownerShop?.id === conversation?.shopId ? props.ownerShop : null)
  const messageCount = conversation?.messages.length
  const conversationId = conversation?.id
  const unread = conversation?.unread ?? 0
  const latestProposal = conversation?.messages.filter((item) => item.proposal).at(-1)
  const proposalVersion = latestProposal?.proposal?.reservationId
  const { role, onReadConversation } = props
  useEffect(() => {
    if (role === 'owner' && conversationId && unread > 0) onReadConversation(conversationId)
  }, [role, conversationId, unread, onReadConversation])
  useEffect(() => { messagesEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [messageCount, proposalVersion])
  if (!conversation || !shop) return <div className="page empty-state"><h1>대화를 찾을 수 없어요</h1><Link to={props.role === 'owner' ? '/owner/chats' : '/customer'} className="button">돌아가기</Link></div>
  const title = props.role === 'customer' ? shop.name : conversation.customerName === '나' ? '체험 고객' : conversation.customerName
  const back = props.role === 'owner' ? '/owner/chats' : 'image' in shop ? `/customer/shops/${shop.id}` : '/customer/reservations'
  const suggestion = getChatBookingSuggestion(conversation.messages)
  const source = conversation.messages.filter((item) => item.sender === 'customer').at(-1)
  const showSuggestion = suggestion && suggestion.messageId !== dismissedId && !conversation.messages.some((item) => item.proposal?.sourceMessageId === suggestion.messageId)
  const confirming = conversation.messages.find((item) => item.id === confirmingId)?.proposal

  return <div className="chat-page">
    <header className="chat-heading"><Link to={back} aria-label="이전 화면" className="icon-button"><Icon name="arrow-left" /></Link>{'image' in shop ? <img src={shop.image} alt="" /> : <span className="chat-avatar"><Icon name="store" /></span>}<div><h1>{title}</h1><p>{props.role === 'customer' ? '사장님과의 대화' : shop.name}</p></div><span className="badge">데모 채팅</span></header>
    <div className="chat-demo-notice">문구 감지 데모 · 기준일 10월 16일 · 새로고침하면 초기화돼요.</div>
    <div className="chat-messages"><span className="chat-date">{dateLabel(DEMO_DAY)}</span>{conversation.messages.map((item) => {
      const proposal = item.proposal
      const superseded = Boolean(proposal && !proposal.reservationId && item.id !== latestProposal?.id)
      const needsReview = proposal?.sourceMessageId !== source?.id
      return <div className={`chat-message ${item.sender === props.role ? 'mine' : ''}`} key={item.id}>
        {item.sender !== props.role && <span className="chat-avatar" aria-hidden="true"><Icon name={props.role === 'customer' ? 'store' : 'user'} size={18} /></span>}
        <div>{proposal ? <section className="chat-booking-card" aria-label="예약 제안">
          <span className="badge">{proposal.reservationId ? '예약 확정' : superseded ? '새 제안으로 변경됨' : needsReview ? '고객 메시지 확인 필요' : '고객 확인 대기'}</span>
          <h2>{proposal.service}</h2>
          <dl><dt>날짜</dt><dd>{dateLabel(proposal.startsAt)}</dd><dt>시간</dt><dd>{timeLabel(proposal.startsAt)} – {timeLabel(new Date(Date.parse(proposal.startsAt) + proposal.duration * 60000).toISOString())}</dd><dt>소요 시간</dt><dd>{proposal.duration}분</dd><dt>예약 금액</dt><dd>{money(proposal.price)}</dd></dl>
          {proposal.reservationId ? <Link className="button small" to={role === 'owner' ? `/owner?date=${proposal.startsAt.slice(0, 10)}` : '/customer/reservations'}>{role === 'owner' ? '캘린더에서 보기' : '예약내역 보기'}</Link> : !superseded && <>
            {role === 'customer' ? !needsReview && <button className="button small" type="button" onClick={() => { setConfirmingId(item.id); setError('') }}>내용 확인하고 예약하기</button> : source && <button className="button secondary small" type="button" onClick={() => setReview({ source, initial: proposal })}>{needsReview ? '새 메시지 검토하기' : '제안 수정'}</button>}
            <small>{needsReview ? '새 고객 메시지를 확인한 뒤 다시 제안해 주세요.' : '최종 확인 전에는 시간이 확보되지 않아요.'}</small>
          </>}
        </section> : <p>{item.body}</p>}<time>{timeLabel(item.sentAt)}</time></div>
      </div>
    })}<div ref={messagesEnd} /></div>
    {showSuggestion && source && <section className="chat-suggestion" aria-label="예약 추천">
      <div><Icon name="calendar" size={18} /><strong>{role === 'owner' ? '예약 요청이 보여요' : '사장님의 예약 제안을 기다려 주세요'}</strong>{role === 'owner' && <button className="icon-button" type="button" aria-label="추천 닫기" onClick={() => setDismissedId(suggestion.messageId)}><Icon name="close" size={16} /></button>}</div>
      <p>{suggestion.date ? dateLabel(`${suggestion.date}T12:00:00+09:00`) : '날짜 확인 필요'} · {suggestion.time || '시간 확인 필요'}</p>
      {role === 'owner' && <button className="button small" type="button" onClick={() => setReview({ source, initial: { service: shop.service, startsAt: `${suggestion.date}T${suggestion.time}`, duration: shop.duration, price: shop.originalPrice } })}>시간·가격 검토하기</button>}
    </section>}
    <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); if (message.trim()) { props.onSendMessage(conversation.id, message, props.role); setMessage('') } }}><label className="sr-only" htmlFor="chat-message">메시지</label><input id="chat-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} placeholder="메시지를 입력해 주세요" autoComplete="off" /><button type="submit" className="send-button" aria-label="메시지 보내기" disabled={!message.trim()}><Icon name="send" size={20} /></button></form>
    {review && <BookingProposalDialog conversationId={conversation.id} {...review} onPropose={props.onProposeBooking} onClose={() => setReview(null)} />}
    {confirming && <Modal title="이 내용으로 예약할까요?" className="customer-dialog" onClose={() => setConfirmingId(null)}>
      <p className="muted">사장님이 검토한 내용을 확인해 주세요.</p>
      <dl className="reservation-summary"><dt>가게</dt><dd>{shop.name}</dd><dt>시술</dt><dd>{confirming.service}</dd><dt>날짜</dt><dd>{dateLabel(confirming.startsAt)}</dd><dt>시간</dt><dd>{timeLabel(confirming.startsAt)}</dd><dt>소요 시간</dt><dd>{confirming.duration}분</dd><dt>예약 금액</dt><dd>{money(confirming.price)}</dd></dl>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="customer-dialog-actions"><button type="button" className="button secondary" onClick={() => setConfirmingId(null)}>돌아가기</button><button type="button" className="button" onClick={() => {
        if (props.onConfirmBooking(conversation.id, confirmingId!)) setConfirmingId(null)
        else setError('이미 예약된 시간이거나 제안이 변경됐어요. 사장님에게 새 제안을 요청해 주세요.')
      }}>예약 확정하기</button></div>
    </Modal>}
  </div>
}
