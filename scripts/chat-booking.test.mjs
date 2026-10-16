import assert from 'node:assert/strict'
import test from 'node:test'
import { createDemoState, CUSTOMER_ID, DEMO_NOW } from '../src/data/demo.ts'
import { getAvailableSlots, isBookingTimeAvailable, reserveSlot } from '../src/lib/booking.ts'
import { confirmChatBooking, proposeChatBooking, startDemoConversation, validateChatBooking } from '../src/lib/chat-booking.ts'

const shop = { id: 'registered-shop', name: '내 매장', category: '네일', address: '서울', phone: '01012345678', service: '젤 네일', originalPrice: 50000, duration: 60 }
const input = { service: '  젤 네일 + 제거  ', startsAt: '2026-10-17T15:00:00+09:00', duration: 90, price: 65000 }

function conversationState() {
  const state = startDemoConversation(createDemoState(), shop)
  const conversation = state.conversations.at(-1)
  return { state, conversation, sourceId: conversation.messages[0].id }
}

test('starting a demo conversation isolates registered shops and preserves existing sample chats', () => {
  const state = createDemoState()
  const original = structuredClone(state)
  const started = startDemoConversation(state, shop)
  const conversation = started.conversations.at(-1)
  assert.equal(started.conversations.length, state.conversations.length + 1)
  assert.equal(conversation.shopId, shop.id)
  assert.equal(conversation.customerId, CUSTOMER_ID)
  assert.equal(conversation.messages[0].sender, 'customer')
  assert.match(conversation.messages[0].body, /내일 오후 3시/)
  assert.ok(conversation.messages[0].body.includes(shop.service))
  assert.deepEqual(started.conversations.slice(0, -1), state.conversations)
  assert.equal(started.reservations, state.reservations)
  assert.deepEqual(state, original)
  assert.equal(startDemoConversation(started, shop), started)

  const another = startDemoConversation(started, { ...shop, id: 'another-shop' })
  assert.equal(another.conversations.at(-1).shopId, 'another-shop')
  assert.notEqual(another.conversations.at(-1).id, conversation.id)
  assert.deepEqual(another.conversations.slice(0, -1), started.conversations)
})

test('owner review validates service, Seoul calendar time, duration, price and midnight boundary', () => {
  assert.equal(validateChatBooking(input), null)
  assert.equal(validateChatBooking({ ...input, startsAt: DEMO_NOW, duration: 10, price: 1 }), null)
  assert.equal(validateChatBooking({ ...input, service: '가'.repeat(160), duration: 480, price: 10000000 }), null)
  assert.equal(validateChatBooking({ ...input, startsAt: '2026-10-17T23:30:00+09:00', duration: 30 }), null)
  for (const patch of [
    { service: '' }, { service: ' \n ' }, { service: '가'.repeat(161) },
    { startsAt: '2026-10-16T14:19:00+09:00' }, { startsAt: '2027-02-29T15:00:00+09:00' },
    { startsAt: '2026-10-17T24:00:00+09:00' }, { startsAt: '2026-10-17T15:60:00+09:00' },
    { startsAt: '2026-10-17T15:00:00Z' }, { startsAt: 'invalid' },
    { duration: 9 }, { duration: 481 }, { duration: 30.5 }, { duration: NaN },
    { price: 0 }, { price: -1 }, { price: 1.5 }, { price: 10000001 }, { price: Infinity },
    { startsAt: '2026-10-17T23:30:00+09:00', duration: 31 },
  ]) assert.equal(typeof validateChatBooking({ ...input, ...patch }), 'string', JSON.stringify(patch))
})

test('proposals require the matching shop and latest customer message', () => {
  const { state, conversation, sourceId } = conversationState()
  assert.equal(proposeChatBooking(state, 'other-shop', conversation.id, sourceId, input), null)
  assert.equal(proposeChatBooking(state, shop.id, 'missing', sourceId, input), null)
  assert.equal(proposeChatBooking(state, shop.id, conversation.id, 'missing', input), null)
  assert.equal(proposeChatBooking(state, shop.id, conversation.id, sourceId, { ...input, price: 0 }), null)

  conversation.messages.push({ id: 'latest', sender: 'customer', body: '시간을 변경할게요', sentAt: DEMO_NOW })
  assert.equal(proposeChatBooking(state, shop.id, conversation.id, sourceId, input), null)
  assert.ok(proposeChatBooking(state, shop.id, conversation.id, 'latest', input))
  assert.equal(proposeChatBooking(state, 'moment', 'moment-yujin', 'msg-2', input), null)
})

test('sending a reviewed proposal preserves shared state and does not occupy the calendar', () => {
  const { state, conversation, sourceId } = conversationState()
  const original = structuredClone(state)
  const proposed = proposeChatBooking(state, shop.id, conversation.id, sourceId, input)
  assert.ok(proposed)
  const message = proposed.conversations.at(-1).messages.at(-1)
  assert.equal(message.sender, 'owner')
  assert.deepEqual(message.proposal, { ...input, service: input.service.trim(), sourceMessageId: sourceId })
  assert.equal(proposed.reservations, state.reservations)
  assert.equal(proposed.waitlist, state.waitlist)
  assert.equal(isBookingTimeAvailable(proposed.reservations, shop.id, input.startsAt, input.duration), true)
  assert.deepEqual(state, original)
})

test('customer confirmation retains the reviewed service, amount, duration and calendar identity once', () => {
  const { state, conversation, sourceId } = conversationState()
  const proposed = proposeChatBooking(state, shop.id, conversation.id, sourceId, input)
  const messageId = proposed.conversations.at(-1).messages.at(-1).id
  const original = structuredClone(proposed)
  const confirmed = confirmChatBooking(proposed, conversation.id, messageId)
  assert.ok(confirmed)
  assert.equal(confirmed.reservations.length, state.reservations.length + 1)
  const reservation = confirmed.reservations.at(-1)
  assert.equal(reservation.shopId, shop.id)
  assert.equal(reservation.customerId, CUSTOMER_ID)
  assert.equal(reservation.customerName, conversation.customerName)
  assert.equal(reservation.service, input.service.trim())
  assert.equal(reservation.startsAt, input.startsAt)
  assert.equal(reservation.duration, input.duration)
  assert.equal(reservation.price, input.price)
  assert.equal(reservation.originalPrice, input.price)
  assert.equal(reservation.status, 'confirmed')
  assert.equal(confirmed.conversations.at(-1).messages.at(-1).proposal.reservationId, reservation.id)
  assert.equal(confirmChatBooking(confirmed, conversation.id, messageId), null)
  assert.equal(proposeChatBooking(confirmed, shop.id, conversation.id, sourceId, { ...input, startsAt: '2026-10-18T15:00:00+09:00' }), null)
  assert.deepEqual(proposed, original)
})

test('customers cannot confirm another customer’s proposal or a regular message', () => {
  const { state, conversation, sourceId } = conversationState()
  assert.equal(confirmChatBooking(state, conversation.id, sourceId), null)
  assert.equal(confirmChatBooking(state, 'missing', sourceId), null)
  const proposed = proposeChatBooking(state, 'moment', 'moment-jiwoo', 'msg-1', input)
  assert.ok(proposed)
  const otherMessage = proposed.conversations.find((item) => item.id === 'moment-jiwoo').messages.at(-1)
  assert.equal(confirmChatBooking(proposed, 'moment-jiwoo', otherMessage.id), null)
})

test('a revised proposal invalidates the old one and confirms only the latest reviewed terms', () => {
  const { state, conversation, sourceId } = conversationState()
  const first = proposeChatBooking(state, shop.id, conversation.id, sourceId, input)
  const oldMessageId = first.conversations.at(-1).messages.at(-1).id
  const revisedInput = { ...input, startsAt: '2026-10-17T16:00:00+09:00', duration: 120, price: 80000 }
  const revised = proposeChatBooking(first, shop.id, conversation.id, sourceId, revisedInput)
  const newMessageId = revised.conversations.at(-1).messages.at(-1).id
  assert.equal(confirmChatBooking(revised, conversation.id, oldMessageId), null)
  const confirmed = confirmChatBooking(revised, conversation.id, newMessageId)
  assert.ok(confirmed)
  assert.equal(confirmed.reservations.at(-1).startsAt, revisedInput.startsAt)
  assert.equal(confirmed.reservations.at(-1).duration, revisedInput.duration)
  assert.equal(confirmed.reservations.at(-1).price, revisedInput.price)
})

test('a new customer message invalidates the old proposal until the owner reviews it again', () => {
  const { state, conversation, sourceId } = conversationState()
  const proposed = proposeChatBooking(state, shop.id, conversation.id, sourceId, input)
  const oldMessageId = proposed.conversations.at(-1).messages.at(-1).id
  proposed.conversations.at(-1).messages.push({ id: 'changed-request', sender: 'customer', body: '3시는 취소하고 오후 4시로 변경할게요', sentAt: DEMO_NOW })
  assert.equal(confirmChatBooking(proposed, conversation.id, oldMessageId), null)
  assert.equal(proposeChatBooking(proposed, shop.id, conversation.id, sourceId, input), null)
  const revised = proposeChatBooking(proposed, shop.id, conversation.id, 'changed-request', { ...input, startsAt: '2026-10-17T16:00:00+09:00' })
  assert.ok(revised)
  const confirmed = confirmChatBooking(revised, conversation.id, revised.conversations.at(-1).messages.at(-1).id)
  assert.ok(confirmed)
  assert.equal(confirmed.reservations.at(-1).startsAt, '2026-10-17T16:00:00+09:00')
})

test('confirmation checks availability again if an ordinary booking occupied the proposed time', () => {
  const state = createDemoState()
  const conversation = state.conversations.find((item) => item.id === 'moment-me')
  conversation.messages.push({ id: 'request', sender: 'customer', body: '내일 오전 11시 예약 가능할까요?', sentAt: DEMO_NOW })
  const slot = state.shops[0].slots[1]
  const reviewed = { ...input, startsAt: slot.startsAt, duration: 60 }
  const proposed = proposeChatBooking(state, 'moment', conversation.id, 'request', reviewed)
  assert.ok(proposed)
  assert.ok(getAvailableSlots(state.shops[0], proposed.reservations).some((item) => item.startsAt === slot.startsAt))
  const occupied = reserveSlot(proposed, 'moment', slot.startsAt)
  assert.ok(occupied)
  const messageId = occupied.conversations.find((item) => item.id === conversation.id).messages.at(-1).id
  assert.equal(confirmChatBooking(occupied, conversation.id, messageId), null)
  assert.equal(proposeChatBooking(occupied, 'moment', conversation.id, 'request', reviewed), null)
  assert.equal(occupied.reservations.length, state.reservations.length + 1)
})

test('chat confirmation blocks overlapping ordinary slots but allows touching intervals and other shops', () => {
  const { state, conversation, sourceId } = conversationState()
  const proposed = proposeChatBooking(state, shop.id, conversation.id, sourceId, input)
  const confirmed = confirmChatBooking(proposed, conversation.id, proposed.conversations.at(-1).messages.at(-1).id)
  const slots = ['14:00', '14:30', '15:00', '16:00', '16:30'].map((time) => ({ service: shop.service, price: shop.originalPrice, originalPrice: shop.originalPrice, startsAt: `2026-10-17T${time}:00+09:00` }))
  assert.deepEqual(getAvailableSlots({ ...state.shops[0], ...shop, slots }, confirmed.reservations).map((item) => item.startsAt.slice(11, 16)), ['14:00', '16:30'])
  assert.equal(isBookingTimeAvailable(confirmed.reservations, 'another-shop', input.startsAt, input.duration), true)
  assert.equal(isBookingTimeAvailable([{ ...confirmed.reservations.at(-1), status: 'completed' }], shop.id, input.startsAt, input.duration), true)
  for (const [startsAt, duration] of [['invalid', 60], ['2026-10-16T14:19:00+09:00', 60], [input.startsAt, 0], [input.startsAt, 1.5]]) {
    assert.equal(isBookingTimeAvailable([], shop.id, startsAt, duration), false)
  }
})

test('confirmation removes only the wait request for the same shop, day and start time', () => {
  const { state, conversation, sourceId } = conversationState()
  const request = { id: 'matching', shopId: shop.id, preferredDate: '2026-10-17', preferredTime: '15:00', createdAt: DEMO_NOW }
  state.waitlist.push(request, { ...request, id: 'other-date', preferredDate: '2026-10-18' }, { ...request, id: 'other-time', preferredTime: '15:30' }, { ...request, id: 'other-shop', shopId: 'other-shop' })
  const proposed = proposeChatBooking(state, shop.id, conversation.id, sourceId, input)
  const confirmed = confirmChatBooking(proposed, conversation.id, proposed.conversations.at(-1).messages.at(-1).id)
  assert.ok(confirmed)
  assert.deepEqual(confirmed.waitlist.map((item) => item.id), ['wait-1', 'wait-2', 'other-date', 'other-time', 'other-shop'])
  assert.equal(state.waitlist.length, 6)
})
