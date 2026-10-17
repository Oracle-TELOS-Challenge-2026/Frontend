import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { BookingProposalDialog } from '../components/owner/BookingProposalDialog'
import { continuesMessageGroup } from '../lib/chat'
import type { ChatBookingProposal } from '../lib/chat'
import { getChatBookingSuggestion } from '../lib/chat-suggestion'
import type { ChatBookingSuggestion } from '../lib/chat-suggestion'
import { BackendApiError } from '../lib/backend-api'
import { dateLabel, money, timeLabel, todayInSeoul } from '../lib/format'
import type { useChat } from '../hooks/useChat'
import type { RegisteredShop, Role } from '../types'

const proposalStatus = { PENDING: '고객 확인 대기', CONFIRMED: '예약 확정됨', SUPERSEDED: '새 제안으로 대체됨', REVIEW_REQUIRED: '사장님 재검토 필요' }

export function ChatPage({ chat, role, userId, ownerShop, onRefreshSession }: { chat: ReturnType<typeof useChat>; role: Role; userId: string; ownerShop?: RegisteredShop | null; onRefreshSession: () => Promise<void> }) {
  const { id } = useParams()
  const [message, setMessage] = useState('')
  const [syncError, setSyncError] = useState('')
  const [sendError, setSendError] = useState('')
  const [openingFailed, setOpeningFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [reviewId, setReviewId] = useState<string | null>(null)
  const [dismissedId, setDismissedId] = useState<string | null>(null)
  const [analysisAttempt, setAnalysisAttempt] = useState(0)
  const [analysis, setAnalysis] = useState<{ roomId: string; sourceMessageId: string; result: ChatBookingSuggestion | null; error: string; status?: number } | null>(null)
  const [confirmation, setConfirmation] = useState<ChatBookingProposal | null>(null)
  const [confirming, setConfirming] = useState(false)
  const confirmingRef = useRef(false)
  const confirmationKeys = useRef(new Map<string, string>())
  const messagesEnd = useRef<HTMLDivElement>(null)
  const messageInput = useRef<HTMLInputElement>(null)
  const conversation = chat.conversations.find((room) => role === 'customer' ? room.store.id === id && room.customer.id === userId : room.id === id)
  const conversationId = conversation?.id
  const lastMessageId = conversation?.messages.at(-1)?.id
  const lastOutgoingId = conversation?.outgoing.at(-1)?.clientMessageId
  const latestSequence = conversation?.messages.at(-1)?.sequence
  const lastReadSequence = conversation?.lastReadSequence
  const olderSequence = conversation?.nextBeforeSequence
  const readOnly = conversation?.status === 'READ_ONLY'
  const source = conversation?.messages.findLast((item) => item.sender.role === 'CUSTOMER' && item.type === 'TEXT')
  const previewSource = conversation?.lastMessage
  const latestCustomerMessage = previewSource?.sender.role === 'CUSTOMER' && previewSource.type === 'TEXT' && previewSource.sequence > (source?.sequence ?? 0) ? previewSource : source
  const sourceMessageId = conversation?.messagesLoaded ? latestCustomerMessage?.id : undefined
  const historyCurrent = conversation?.messagesLoaded && (conversation.lastMessage?.sequence ?? 0) <= (latestSequence ?? 0)
  const currentAnalysis = analysis?.roomId === conversationId && analysis?.sourceMessageId === sourceMessageId ? analysis : null
  const suggestion = !readOnly && historyCurrent && currentAnalysis?.result?.bookingRequested && currentAnalysis.result.sourceMessageId === sourceMessageId ? currentAnalysis.result : null
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

  useEffect(() => { messagesEnd.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [lastMessageId, lastOutgoingId])

  useEffect(() => {
    if (!conversationId || !historyCurrent || sourceMessageId || readOnly || olderSequence == null) return
    let active = true
    // 최신 페이지가 사장님 메시지뿐이어도 가장 최근 고객 원문을 찾는다.
    void loadMessages(conversationId, olderSequence).catch((cause: unknown) => {
      if (active) setSyncError(cause instanceof Error ? cause.message : '최근 고객 메시지를 불러오지 못했어요.')
    })
    return () => { active = false }
  }, [conversationId, historyCurrent, sourceMessageId, readOnly, olderSequence, attempt, loadMessages])

  useEffect(() => {
    if (!conversationId || !sourceMessageId || readOnly) return
    const controller = new AbortController()
    // 메시지 배열은 폴링마다 바뀌므로 저장된 고객 메시지 ID가 바뀔 때만 분석한다.
    void getChatBookingSuggestion(conversationId, sourceMessageId, controller.signal).then((result) => {
      if (!controller.signal.aborted) setAnalysis({ roomId: conversationId, sourceMessageId, result, error: '' })
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return
      const status = cause instanceof BackendApiError ? cause.status : undefined
      setAnalysis({ roomId: conversationId, sourceMessageId, result: null, error: cause instanceof Error ? cause.message : '예약 의사를 분석하지 못했어요.', status })
      setReviewId(null)
      if (status === 404 || status === 409) {
        void loadMessages(conversationId, undefined, true).catch(() => {})
        void refreshRooms()
      }
    })
    return () => controller.abort()
  }, [conversationId, sourceMessageId, readOnly, userId, analysisAttempt, loadMessages, refreshRooms])

  const error = sendError || syncError || chat.error
  const fallback = role === 'owner' ? '/owner/chats' : '/customer'
  if (!conversation) return <div className="page empty-state"><h1>{loading || (role === 'customer' && !openingFailed) ? '대화를 불러오는 중이에요' : '대화를 불러올 수 없어요'}</h1>{error && <p className="form-error" role="alert">{error}</p>}<button type="button" className="button secondary" onClick={() => { setOpeningFailed(false); setSyncError(''); setAttempt((value) => value + 1); void refreshRooms() }}>다시 시도</button><Link to={fallback} className="button">돌아가기</Link></div>
  const outgoing = conversation.outgoing.map((item) => ({ ...item, sender: { id: userId } }))
  const title = role === 'customer' ? conversation.store.name : conversation.customer.displayName
  const back = role === 'owner' ? '/owner/chats' : `/customer/shops/${encodeURIComponent(conversation.store.id)}`
  const showSuggestion = suggestion && suggestion.sourceMessageId !== dismissedId

  function retryAnalysis() {
    setAnalysis(null)
    setReviewId(null)
    setAnalysisAttempt((value) => value + 1)
  }

  function submitMessage() {
    if (!conversation || !message.trim() || readOnly) return
    messageInput.current?.focus()
    setSendError('')
    const content = message.trim()
    setMessage('')
    void sendMessage(conversation.id, content, crypto.randomUUID()).catch(() => {})
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
      {!conversation.messagesLoaded ? <p className="muted">메시지를 불러오는 중이에요.</p> : conversation.messages.length === 0 && conversation.outgoing.length === 0 && <p className="empty-state">첫 인사를 건네보세요.</p>}
      {conversation.messages.map((item, index) => {
        const previous = conversation.messages[index - 1]
        const grouped = continuesMessageGroup(item, conversation.messages[index + 1] ?? outgoing[0])
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
      })}
      {outgoing.map((item, index) => {
        const grouped = continuesMessageGroup(item, outgoing[index + 1])
        return <div key={item.clientMessageId} className={`chat-message mine pending ${grouped ? 'grouped' : ''}`}>
          <div className="chat-message-content"><p>{item.content}</p></div>
          <span className="chat-message-meta chat-delivery" role="status">{item.error ? <><small className="chat-delivery-error">{item.error}</small><button type="button" className="account-text-button" onClick={() => { messageInput.current?.focus(); void sendMessage(conversation.id, item.content, item.clientMessageId).catch(() => {}) }}>다시 보내기</button></> : <small className="chat-delivery-pending">전송 중…</small>}{!grouped && <time dateTime={item.createdAt}>{timeLabel(item.createdAt)}</time>}</span>
        </div>
      })}<div ref={messagesEnd} />
    </div>
    {!readOnly && sourceMessageId && historyCurrent && !currentAnalysis && <p className="chat-status" role="status">예약 의사를 확인하고 있어요.</p>}
    {!readOnly && currentAnalysis?.error && <div className="chat-error" role="alert"><p>예약 의사를 확인하지 못했어요. {currentAnalysis.error}</p><button className="account-text-button" type="button" onClick={() => {
      if (currentAnalysis.status === 401 || currentAnalysis.status === 403) {
        void onRefreshSession().then(retryAnalysis).catch((cause: unknown) => setSyncError(cause instanceof Error ? cause.message : '로그인 상태를 확인하지 못했어요.'))
      } else retryAnalysis()
    }}>{currentAnalysis.status === 401 || currentAnalysis.status === 403 ? '로그인 상태 다시 확인' : '분석 다시 시도'}</button></div>}
    {showSuggestion && <section className="chat-suggestion" aria-label="예약 제안 안내">
      <div><Icon name="calendar" size={18} /><strong>{role === 'owner' ? '예약 요청이 보여요' : '예약 의사를 전달했어요'}</strong><button className="icon-button" type="button" aria-label="예약 제안 안내 닫기" onClick={() => setDismissedId(suggestion.sourceMessageId)}><Icon name="close" size={16} /></button></div>
      <p>{suggestion.date ? dateLabel(`${suggestion.date}T12:00:00+09:00`) : '날짜 확인 필요'} · {suggestion.time || '시간 확인 필요'}</p>
      {role === 'owner' ? <button className="button small" type="button" onClick={() => setReviewId(suggestion.sourceMessageId)}>예약 제안 작성</button> : <p>사장님과 날짜·시간을 확인해 주세요. 아직 예약이 확정된 것은 아니에요.</p>}
    </section>}
    {role === 'owner' && suggestion && !showSuggestion && <div className="chat-status"><button className="button secondary small" type="button" onClick={() => setReviewId(suggestion.sourceMessageId)}>예약 제안 작성</button></div>}
    {role === 'owner' && suggestion && reviewId === suggestion.sourceMessageId && <BookingProposalDialog key={suggestion.sourceMessageId} source={{ id: suggestion.sourceMessageId, content: suggestion.sourceContent }} initial={suggestion} shop={ownerShop?.id === conversation.store.id ? ownerShop : null} onSend={async (serviceId, input, key) => {
      try { await chat.sendProposal(conversation.id, suggestion.sourceMessageId, serviceId, input, key) }
      catch (cause) {
        if (cause instanceof BackendApiError && ['PROPOSAL_SOURCE_OUTDATED', 'ROOM_READ_ONLY', 'SOURCE_MESSAGE_NOT_FOUND', 'ROOM_NOT_FOUND'].includes(cause.code)) {
          setReviewId((current) => current === suggestion.sourceMessageId ? null : current)
          setAnalysis((current) => current?.roomId === conversation.id && current.sourceMessageId === suggestion.sourceMessageId ? { ...current, result: null, error: cause.message, status: cause.status } : current)
          void loadMessages(conversation.id, undefined, true).catch(() => {})
          void refreshRooms()
        }
        throw cause
      }
    }} onClose={() => setReviewId((current) => current === suggestion.sourceMessageId ? null : current)} />}
    {confirmation && <Modal title="이 내용으로 예약할까요?" onClose={() => { if (!confirming) setConfirmation(null) }}>
      <section className="chat-booking-card"><h3>{confirmation.serviceDescription}</h3><dl><dt>날짜</dt><dd>{dateLabel(confirmation.startAt)}</dd><dt>시간</dt><dd>{timeLabel(confirmation.startAt)} – {timeLabel(confirmation.endAt)}</dd><dt>금액</dt><dd>{money(confirmation.price)}</dd></dl></section>
      {sendError && <p className="form-error" role="alert">{sendError}</p>}
      <div className="customer-dialog-actions"><button type="button" className="button secondary" disabled={confirming} onClick={() => setConfirmation(null)}>돌아가기</button><button type="button" className="button" disabled={confirming} onClick={() => void confirm()}>{confirming ? '예약 확정 중…' : '예약 확정하기'}</button></div>
    </Modal>}
    {readOnly ? <p className="chat-status">종료된 대화에서는 메시지를 보낼 수 없어요.</p> : <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); submitMessage() }}><label className="sr-only" htmlFor="chat-message">메시지</label><input ref={messageInput} id="chat-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={2000} placeholder="메시지를 입력해 주세요" autoComplete="off" /><button type="submit" className="send-button" aria-label="메시지 보내기" disabled={!message.trim()}><Icon name="send" size={20} /></button></form>}
  </div>
}
