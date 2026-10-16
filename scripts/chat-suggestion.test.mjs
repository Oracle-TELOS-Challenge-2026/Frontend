import assert from 'node:assert/strict'
import test from 'node:test'
import { DEMO_DAY } from '../src/data/demo.ts'
import { getChatBookingSuggestion } from '../src/lib/chat-suggestion.ts'

const message = (body, id = 'request', sender = 'customer') => ({ id, body, sender, sentAt: '2030-01-01T10:00:00+09:00' })
const suggestion = (body) => getChatBookingSuggestion([message(body)])

test('extracts supported dates and times using the demo day, not the send time', () => {
  for (const [body, date, time] of [
    ['내일 오후 3시에 젤 네일 예약하고 싶어요', '2026-10-17', '15:00'],
    ['모레 오전 11시 반에 가능할까요?', '2026-10-18', '11:30'],
    ['오늘 오후 2시 20분에 받고 싶어요', DEMO_DAY, '14:20'],
    ['2026-10-20 16:45 예약 가능할까요?', '2026-10-20', '16:45'],
    ['10월 17일 오후 12시에 예약하고 싶어요', '2026-10-17', '12:00'],
    ['10월 18일 오전 12시 5분에 예약할게요', '2026-10-18', '00:05'],
    ['2028-02-29 오후 3시 예약 가능할까요?', '2028-02-29', '15:00'],
  ]) assert.deepEqual(suggestion(body), { messageId: 'request', date, time }, body)
})

test('leaves missing or ambiguous details for the owner to review', () => {
  assert.deepEqual(suggestion('내일 3시에 예약하고 싶어요'), { messageId: 'request', date: '2026-10-17', time: '' })
  assert.deepEqual(suggestion('오후 3시에 예약 가능할까요?'), { messageId: 'request', date: '', time: '15:00' })
  assert.deepEqual(suggestion('젤 네일 받고 싶어요'), { messageId: 'request', date: '', time: '' })
})

test('does not suggest rejected or canceled requests and unrelated messages', () => {
  for (const body of [
    '내일 오후 3시 예약 취소할게요', '내일 오후 3시는 안 돼요. 예약 안 할게요',
    '예약 거절할게요', '내일 오후 3시 예약 불가능해요', '내일 예약 못 가요',
    '예약 안 하겠습니다', '예약하지 않을게요', '예약은 오늘 말고 내일로 할게요', '감사합니다',
  ]) assert.equal(suggestion(body), null, body)
  assert.equal(getChatBookingSuggestion([]), null)
  assert.equal(getChatBookingSuggestion([message('내일 오후 3시 예약 가능해요', 'owner', 'owner')]), null)
})

test('only the latest customer message is used, so an old request cannot reappear', () => {
  const oldRequest = message('내일 오후 3시에 예약 가능할까요?', 'old')
  assert.equal(getChatBookingSuggestion([oldRequest, message('감사합니다', 'latest')]), null)
  assert.equal(getChatBookingSuggestion([oldRequest, message('예약 취소할게요', 'latest'), message('알겠습니다', 'reply', 'owner')]), null)
  assert.deepEqual(getChatBookingSuggestion([oldRequest, message('모레 오후 4시에 예약하고 싶어요', 'latest'), message('확인할게요', 'reply', 'owner')]), { messageId: 'latest', date: '2026-10-18', time: '16:00' })
})

test('rejects invalid calendar dates, malformed times, and past requests instead of normalizing them', () => {
  for (const body of [
    '2027-02-29 오후 3시 예약', '2026-11-31 오후 3시 예약', '2026-13-01 오후 3시 예약',
    '2026-10-32 오후 3시 예약', '2026-1-17 오후 3시 예약', '11월 31일 오후 3시 예약',
    '내일 오후 13시 예약', '내일 오전 0시 예약', '내일 오후 3시 60분 예약', '내일 오후 3시 600분 예약',
    '내일 24:00 예약', '내일 15:60 예약', '내일 9:00 예약', '내일 15:0 예약',
    '오늘 오후 2시 19분 예약', '2026-10-15 오후 6시 예약', '10월 15일 예약',
  ]) assert.equal(suggestion(body), null, body)
})
