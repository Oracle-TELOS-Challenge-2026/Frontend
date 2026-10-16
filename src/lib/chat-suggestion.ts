import { isCalendarDate, todayInSeoul } from './format.ts'
import type { ChatMessage } from './chat.ts'

export function getChatBookingSuggestion(messages: ChatMessage[], now = Date.now()): { messageId: string; date: string; time: string } | null {
  const message = messages.findLast((item) => item.sender.role === 'CUSTOMER')
  if (!message || !/(예약|가능|하고\s*싶|받고\s*싶|원합|원하)/.test(message.content) || /(취소|거절|안\s*(돼|되|할|하겠|받|가)|불가|불가능|못\s*(가|하|받)|않|말고)/.test(message.content)) return null

  const sentAt = new Date(message.createdAt)
  if (!Number.isFinite(sentAt.getTime())) return null
  const sentDay = todayInSeoul(sentAt)
  const body = message.content
  const isoDate = body.match(/(?<!\d)(\d{4}-\d+-\d+)(?!\d)/)
  const monthDay = body.match(/(?<!\d)(\d+)월\s*(\d+)일(?!\d)/)
  const relativeDay = body.match(/오늘|내일|모레/)
  let date = ''
  if (isoDate) date = isoDate[1]
  else if (monthDay) date = `${sentDay.slice(0, 4)}-${monthDay[1].padStart(2, '0')}-${monthDay[2].padStart(2, '0')}`
  else if (relativeDay) {
    const day = new Date(`${sentDay}T00:00:00Z`)
    day.setUTCDate(day.getUTCDate() + ['오늘', '내일', '모레'].indexOf(relativeDay[0]))
    date = day.toISOString().slice(0, 10)
  }
  if (date && (!isCalendarDate(date) || date < todayInSeoul(new Date(now)))) return null

  const koreanTime = body.match(/(오전|오후)\s*(\d+)시(?:\s*(반|\d+\s*분))?/)
  const clockTime = body.match(/(?<!\d)(\d+):(\d+)(?!\d)/)
  let time = ''
  if (koreanTime) {
    const hour = Number(koreanTime[2])
    const minute = koreanTime[3] === '반' ? 30 : Number(koreanTime[3]?.replace(/\s*분$/, '') ?? 0)
    if (hour < 1 || hour > 12 || minute > 59) return null
    time = `${String(hour % 12 + (koreanTime[1] === '오후' ? 12 : 0)).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  } else if (clockTime) {
    time = clockTime[0]
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null
  }
  if (date && time && Date.parse(`${date}T${time}:00+09:00`) <= now) return null
  return { messageId: message.id, date, time }
}
