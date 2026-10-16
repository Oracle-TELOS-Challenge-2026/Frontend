export const money = (value: number) => `${value.toLocaleString('ko-KR')}원`
export const dateLabel = (value: string) => new Date(value).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Seoul' })
export const timeLabel = (value: string) => new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' })
