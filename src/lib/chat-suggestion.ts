import { apiId, BackendApiError, mutateBackendApi } from './backend-api.ts'
import { isCalendarDate } from './format.ts'

export interface ChatBookingSuggestion {
  sourceMessageId: string
  sourceContent: string
  bookingRequested: boolean
  date: string | null
  time: string | null
  serviceDescription: string | null
}

export async function getChatBookingSuggestion(roomId: string, messageId: string, signal?: AbortSignal): Promise<ChatBookingSuggestion> {
  const path = `/api/v1/chatting/rooms/${apiId(roomId)}/messages/${apiId(messageId)}/booking-suggestion`
  let response
  try {
    response = await mutateBackendApi(path, { signal })
  } catch (cause) {
    if (!(cause instanceof BackendApiError) || cause.status !== 403 || cause.code !== 'CSRF_INVALID') throw cause
    response = await mutateBackendApi(path, { signal })
  }
  const { sourceMessageId, sourceContent, bookingRequested, date, time, serviceDescription } = response.data ?? {}
  if (sourceMessageId !== messageId || typeof sourceContent !== 'string' || !sourceContent.trim() || sourceContent.length > 2000 ||
    typeof bookingRequested !== 'boolean' ||
    !(date === null || typeof date === 'string' && isCalendarDate(date)) ||
    !(time === null || typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)) ||
    !(serviceDescription === null || typeof serviceDescription === 'string' && serviceDescription.trim() && serviceDescription.length <= 1000) ||
    !bookingRequested && (date !== null || time !== null || serviceDescription !== null)) {
    throw new BackendApiError(response.status, 'INVALID_RESPONSE', '예약 의사 분석 응답이 올바르지 않아요. 다시 분석해 주세요.')
  }
  return { sourceMessageId, sourceContent, bookingRequested, date, time, serviceDescription }
}
