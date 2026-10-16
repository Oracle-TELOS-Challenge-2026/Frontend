import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { BookingProposalDialog } from '../components/owner/BookingProposalDialog'
import { continuesMessageGroup } from '../lib/chat'
import type { ChatBookingProposal } from '../lib/chat'
import { getChatBookingSuggestion } from '../lib/chat-suggestion'
import { dateLabel, money, timeLabel, todayInSeoul } from '../lib/format'
import type { useChat } from '../hooks/useChat'
import type { RegisteredShop, Role } from '../types'

const proposalStatus = { PENDING: '고객 확인 대기', CONFIRMED: '예약 확정됨', SUPERSEDED: '새 제안으로 대체됨', REVIEW_REQUIRED: '사장님 재검토 필요' }

export function ChatPage({ chat, role, userId, ownerShop }: { chat: ReturnType<typeof useChat>; role: Role; userId: string; ownerShop?: RegisteredShop | null }) {
  const { id } = useParams()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [sendError, setSendError] = useState('')
  const [openingFailed, setOpeningFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [dismissedId, setDismissedId] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<ChatBookingProposal | null>(null)
  const [confirming, setConfirming] = useState(false)
  const confirmingRef = useRef(false)
  const confirmationKeys = useRef(new Map<string, string>())
  const messagesEnd = useRef<HTMLDivElement>(null)
  const sendingRef = useRef(false)
  const draft = useRef<{ content: string; id: string } | null>(null)
  const conversation = chat.conversations.find((room) => role === 'customer' ? room.store.id === id && room.customer.id === userId : room.id === id)
  const conversationId = conversation?.id
  const lastMessageId = conversation?.messages.at(-1)?.id
  const latestSequence = conversation?.messages.at(-1)?.sequence
  const lastReadSequence = conversation?.lastReadSequence
  const realtimeConnected = chat.realtime.connected
  const { loading, openShopChat, loadMessages, refreshRooms, readConversation, sendMessage, setActiveRoom } = chat

  useEffect(() => {
    setActiveRoom(conversationId ?? null)
    return () => setActiveRoom(null)
  }, [conversationId, setActiveRoom])

  useEffect(() => {
    if (role !== 'customer' || loading || conversationId || !id) return
    let active = true
    void openShopChat(id).then(() => { if (active) setOpeningFailed(false) }).catch((cause: unknown) => {
      if (active) { setSyncError(cause instanceof Error ? cause.message : '대화를 시작하지 못했어요.'); setOpeningFailed(true) }
    })
    return () => { active = false }
  }, [role, loading, conversationId, id, attempt, openShopChat])

  useEffect(() => {
    if (!conversationId) return
    let active = true
    let syncing = false
    const sync = async () => {
      if (syncing || document.visibilityState !== 'visible') return
      syncing = true
      try {
        await loadMessages(conversationId, undefined, !realtimeConnected)
        if (active) setSyncError('')
      } catch (cause) {
        if (active) setSyncError(cause instanceof Error ? cause.message : '메시지를 불러오지 못했어요.')
      } finally { syncing = false }
    }
    void sync()
    // REST also recovers updates when the network blocks WebSocket.
    const interval = window.setInterval(() => void sync(), 5000)
    const onVisible = () => { if (document.visibilityState === 'visible') void sync() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { active = false; window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [conversationId, attempt, loadMessages, realtimeConnected])

  useEffect(() => {
    if (!conversationId || latestSequence === undefined || lastReadSequence === undefined || latestSequence <= lastReadSequence) return
    let active = true
    const markRead = () => {
      if (document.visibilityState !== 'visible') return
      void readConversation(conversationId, latestSequence).catch((cause: unknown) => {
        if (active) setSyncError(cause instanceof Error ? cause.message : '읽음 상태를 저장하지 못했어요.')
      })
    }
    markRead()
    const interval = window.setInterval(markRead, 5000)
    document.addEventListener('visibilitychange', markRead)
    return () => { active = false; window.clearInterval(interval); document.removeEventListener('visibilitychange', markRead) }
  }, [conversationId, latestSequence, lastReadSequence, readConversation])

  useEffect(() => { messagesEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [lastMessageId])

  const error = sendError || syncError || chat.error
  const fallback = role === 'owner' ? '/owner/chats' : '/customer'
  if (!conversation) return <div className="page empty-state"><h1>{loading || (role === 'customer' && !openingFailed) ? '대화를 불러오는 중이에요' : '대화를 불러올 수 없어요'}</h1>{error && <p className="form-error" role="alert">{error}</p>}<button type="button" className="button secondary" onClick={() => { setOpeningFailed(false); setSyncError(''); setAttempt((value) => value + 1); void refreshRooms() }}>다시 시도</button><Link to={fallback} className="button">돌아가기</Link></div>
  const title = role === 'customer' ? conversation.store.name : conversation.customer.displayName
  const back = role === 'owner' ? '/owner/chats' : `/customer/shops/${encodeURIComponent(conversation.store.id)}`
  const readOnly = conversation.status === 'READ_ONLY'
  const suggestion = !readOnly && conversation.messagesLoaded && (conversation.lastMessage?.sequence ?? 0) <= (latestSequence ?? 0) ? getChatBookingSuggestion(conversation.messages) : null
  const source = conversation.messages.findLast((item) => item.sender.role === 'CUSTOMER' && item.type === 'TEXT')
  const showSuggestion = suggestion && suggestion.messageId !== dismissedId

  async function submitMessage() {
    if (!conversation || sendingRef.current || !message.trim() || readOnly) return
    sendingRef.current = true
    setSending(true)
    setSendError('')
    const content = message.trim()
    if (draft.current?.content !== content) draft.current = { content, id: crypto.randomUUID() }
    try {
      await sendMessage(conversation.id, content, draft.current.id)
      setMessage('')
      draft.current = null
    } catch (cause) {
      setSendError(cause instanceof Error ? cause.message : '메시지를 보내지 못했어요. 다시 보내 주세요.')
    } finally { sendingRef.current = false; setSending(false) }
  }

  async function confirm() {
    if (!confirmation || !conversation || confirmingRef.current) return
    confirmingRef.current = true
    setConfirming(true)
    setSendError('')
    const keyId = `${confirmation.id}:${confirmation.version}`
    const key = confirmationKeys.current.get(keyId) ?? crypto.randomUUID()
    confirmationKeys.current.set(keyId, key)
    try {
      await chat.confirmProposal(conversation.id, confirmation.id, confirmation.version, key)
      setConfirmation(null)
    } catch (cause) {
      setSendError(cause instanceof Error ? cause.message : '예약을 확정하지 못했어요.')
      void loadMessages(conversation.id, undefined, true).catch(() => {})
    } finally { confirmingRef.current = false; setConfirming(false) }
  }

  return <div className="chat-page">
    <header className="chat-heading"><Link to={back} aria-label="이전 화면" className="icon-button"><Icon name="arrow-left" /></Link>{role === 'customer' && conversation.store.imageUrl ? <img src={conversation.store.imageUrl} alt="" /> : <span className="chat-avatar"><Icon name={role === 'customer' ? 'store' : 'user'} /></span>}<div><h1>{title}</h1><p>{role === 'customer' ? '사장님과의 대화' : conversation.store.name}</p></div>{readOnly && <span className="badge">읽기 전용</span>}</header>
    {error && <div className="chat-error" role="alert"><p>{error}</p><button type="button" className="account-text-button" onClick={() => { setAttempt((value) => value + 1); void refreshRooms() }}>다시 조회</button></div>}
    {chat.realtime.error && <p className="chat-status" role="status">{chat.realtime.error}</p>}
    <div className="chat-messages" aria-busy={!conversation.messagesLoaded}>
      {conversation.nextBeforeSequence !== null && <button type="button" className="button secondary small" onClick={() => {
        void loadMessages(conversation.id, conversation.nextBeforeSequence!).catch((cause: unknown) => setSyncError(cause instanceof Error ? cause.message : '이전 메시지를 불러오지 못했어요.'))
      }}>이전 메시지 보기</button>}
      {!conversation.messagesLoaded ? <p className="muted">메시지를 불러오는 중이에요.</p> : conversation.messages.length === 0 && <p className="empty-state">첫 인사를 건네보세요.</p>}
      {conversation.messages.map((item, index) => {
        const previous = conversation.messages[index - 1]
        const grouped = continuesMessageGroup(item, conversation.messages[index + 1])
        const mine = item.sender.id === userId
        // shortcut: 초기 상대 읽음 위치가 API에 추가되면 재접속 시의 미확인 표시를 해소한다.
        const unread = mine && item.sequence > (conversation.peerReadSequence ?? 0)
        const proposal = item.bookingProposal
        return <Fragment key={item.id}>
          {(!previous || todayInSeoul(new Date(previous.createdAt)) !== todayInSeoul(new Date(item.createdAt))) && <span className="chat-date">{dateLabel(item.createdAt)}</span>}
          <div className={`chat-message ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`}>
            {!mine && <span className="chat-avatar" aria-hidden="true"><Icon name={role === 'customer' ? 'store' : 'user'} size={18} /></span>}
            <div className="chat-message-content">{proposal ? <section className="chat-booking-card" aria-label="예약 제안">
              <span className="badge">{proposalStatus[proposal.status]}</span><h3>{proposal.serviceDescription}</h3>
              <dl><dt>날짜</dt><dd>{dateLabel(proposal.startAt)}</dd><dt>시간</dt><dd>{timeLabel(proposal.startAt)} – {timeLabel(proposal.endAt)}</dd><dt>소요 시간</dt><dd>{proposal.durationMinutes}분</dd><dt>예약 금액</dt><dd>{money(proposal.price)}</dd></dl>
              {proposal.status === 'PENDING' && <><small>확정할 때 예약 가능한 시간을 다시 확인해요.</small>{role === 'customer' && !readOnly && <button type="button" className="button small" onClick={() => { setSendError(''); setConfirmation(proposal) }}>내용 확인 후 예약하기</button>}</>}
              {proposal.status === 'CONFIRMED' && <><small>이 제안으로 예약을 확정했어요. 이후 취소·완료 상태는 예약 내역에서 확인해 주세요.</small><Link className="button secondary small" to={role === 'customer' ? '/customer/reservations' : '/owner'}>예약 내역 보기</Link></>}
              {proposal.status === 'REVIEW_REQUIRED' && <small>고객 요청이 변경됐어요. 사장님의 새 제안을 기다려 주세요.</small>}
            </section> : <p>{item.content}</p>}</div>
            {(!grouped || unread) && <span className="chat-message-meta">{unread && <small className="chat-unread" aria-label="상대방 읽음 미확인">1</small>}{!grouped && <time dateTime={item.createdAt}>{timeLabel(item.createdAt)}</time>}</span>}
          </div>
        </Fragment>
      })}<div ref={messagesEnd} />
    </div>
    {showSuggestion && source && <section className="chat-suggestion" aria-label="예약 제안 안내">
      <div><Icon name="calendar" size={18} /><strong>{role === 'owner' ? '예약 요청이 보여요' : '예약 의사를 전달했어요'}</strong><button className="icon-button" type="button" aria-label="예약 제안 안내 닫기" onClick={() => setDismissedId(suggestion.messageId)}><Icon name="close" size={16} /></button></div>
      <p>{suggestion.date ? dateLabel(`${suggestion.date}T12:00:00+09:00`) : '날짜 확인 필요'} · {suggestion.time || '시간 확인 필요'}</p>
      {role === 'owner' ? <button className="button small" type="button" onClick={() => setReviewId(source.id)}>시간·가격 검토하기</button> : <p>사장님과 날짜·시간을 확인해 주세요. 아직 예약이 확정된 것은 아니에요.</p>}
    </section>}
    {role === 'owner' && source && !readOnly && !showSuggestion && <div className="chat-status"><button className="button secondary small" type="button" onClick={() => setReviewId(source.id)}>예약 제안 작성</button></div>}
    {role === 'owner' && source && reviewId === source.id && <BookingProposalDialog key={source.id} source={source} initial={suggestion ?? { date: '', time: '' }} shop={ownerShop?.id === conversation.store.id ? ownerShop : null} onSend={(serviceId, input, key) => chat.sendProposal(conversation.id, source.id, serviceId, input, key)} onClose={() => setReviewId(null)} />}
    {confirmation && <Modal title="이 내용으로 예약할까요?" onClose={() => { if (!confirming) setConfirmation(null) }}>
      <section className="chat-booking-card"><h3>{confirmation.serviceDescription}</h3><dl><dt>날짜</dt><dd>{dateLabel(confirmation.startAt)}</dd><dt>시간</dt><dd>{timeLabel(confirmation.startAt)} – {timeLabel(confirmation.endAt)}</dd><dt>금액</dt><dd>{money(confirmation.price)}</dd></dl></section>
      {sendError && <p className="form-error" role="alert">{sendError}</p>}
      <div className="customer-dialog-actions"><button type="button" className="button secondary" disabled={confirming} onClick={() => setConfirmation(null)}>돌아가기</button><button type="button" className="button" disabled={confirming} onClick={() => void confirm()}>{confirming ? '예약 확정 중…' : '예약 확정하기'}</button></div>
    </Modal>}
    {readOnly ? <p className="chat-status">종료된 대화에서는 메시지를 보낼 수 없어요.</p> : <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void submitMessage() }}><label className="sr-only" htmlFor="chat-message">메시지</label><input id="chat-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} placeholder="메시지를 입력해 주세요" autoComplete="off" disabled={sending} /><button type="submit" className="send-button" aria-label={sending ? '메시지 전송 중' : '메시지 보내기'} disabled={!message.trim() || sending}><Icon name="send" size={20} /></button></form>}
  </div>
}
