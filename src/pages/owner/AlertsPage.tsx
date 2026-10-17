import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { LoadingIndicator } from '../../components/LoadingIndicator'
import { PublishDialog } from '../../components/owner/PublishDialog'
import { dateLabel, money, timeLabel } from '../../lib/format'
import { readStoreServices } from '../../lib/customer-api'
import { readOwnerVacancies, withdrawVacancy } from '../../lib/owner-api'
import type { Vacancy } from '../../lib/owner-api'
import type { RegisteredShop, StoreService } from '../../types'

const statusLabel = { DRAFT: '미발행', PUBLISHED: '발행 완료', FILLED: '예약 완료', WITHDRAWN: '발행 철회', EXPIRED: '시간 만료' }

type AlertsResult = { key: string; vacancies?: Vacancy[]; services?: StoreService[]; receivedAt?: number; error?: string }
export type OwnerAlertsCache = Map<string, AlertsResult>

export function OwnerAlerts({ ownerShop, notify, cache, refreshKey = '' }: { ownerShop: RegisteredShop | null; notify: (message: string) => void; cache: OwnerAlertsCache; refreshKey?: string }) {
  const [selected, setSelected] = useState<Vacancy | null>(null)
  const [withdrawing, setWithdrawing] = useState<Vacancy | null>(null)
  const [withdrawError, setWithdrawError] = useState('')
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const requestKey = useRef('')
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<AlertsResult | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const storeId = ownerShop?.id
  const key = storeId ?? ''
  const current = result?.key === key ? result : cache.get(key)
  const alerts = current?.vacancies ?? []
  const services = current?.services ?? []
  const available = alerts.filter((item) => (item.status === 'DRAFT' || item.status === 'WITHDRAWN') && Date.parse(item.availableUntil) > (current?.receivedAt ?? 0)).length

  useEffect(() => {
    if (!storeId) return
    let request: AbortController | undefined
    let stopped = false
    async function refresh() {
      if (stopped || request || document.visibilityState !== 'visible') return
      const controller = new AbortController()
      request = controller
      setRefreshing(true)
      try {
        const [vacancies, loadedServices] = await Promise.all([readOwnerVacancies(storeId!, controller.signal), readStoreServices(storeId!, controller.signal)])
        if (controller.signal.aborted || stopped) return
        const next = { key, vacancies, services: loadedServices, receivedAt: Date.now() }
        cache.set(key, next)
        setResult(next)
      } catch (error) {
        if (!controller.signal.aborted && !stopped) setResult({ ...cache.get(key), key, error: error instanceof Error ? error.message : '빈자리 내역을 불러오지 못했어요.' })
      } finally {
        if (request === controller) { request = undefined; if (!stopped) setRefreshing(false) }
      }
    }
    function resume() {
      if (document.visibilityState === 'visible') void refresh()
      else { request?.abort(); request = undefined; setRefreshing(false) }
    }
    void refresh()
    const timer = window.setInterval(() => void refresh(), 30000)
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('online', resume)
    return () => {
      stopped = true
      request?.abort()
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('online', resume)
    }
  }, [storeId, key, revision, refreshKey, cache])

  function updateVacancy(vacancy: Vacancy) {
    const previous = cache.get(key)
    if (previous) {
      const next = { ...previous, vacancies: previous.vacancies?.map((item) => item.id === vacancy.id ? vacancy : item) }
      cache.set(key, next)
      setResult(next)
    }
    setRevision((value) => value + 1)
  }

  function published(vacancy: Vacancy) {
    updateVacancy(vacancy)
    setSelected(null)
    notify('빈자리를 발행했어요. 조건에 맞는 고객에게 알림을 준비하고 있어요.')
  }

  function closeWithdraw() {
    if (busy.current) return
    setWithdrawing(null)
    if (withdrawError) setRevision((value) => value + 1)
  }

  async function withdraw() {
    if (!withdrawing || busy.current) return
    busy.current = true
    setPending(true)
    setWithdrawError('')
    try {
      const vacancy = await withdrawVacancy(withdrawing, requestKey.current)
      updateVacancy(vacancy)
      setWithdrawing(null)
      notify('빈자리 발행을 철회했어요.')
    } catch (cause) { setWithdrawError(cause instanceof Error ? cause.message : '빈자리 발행을 철회하지 못했어요.') }
    finally { busy.current = false; setPending(false) }
  }

  return <div className="page owner-page">
    <p className="eyebrow">빈 시간도, 새로운 기회로</p>
    <h1 className="page-heading">빈자리 알림</h1>
    {current?.error && <div role="alert"><p>{current.vacancies && '저장된 내역을 표시하고 있어요. '}{current.error}</p><button className="button secondary" type="button" onClick={() => setRevision((value) => value + 1)}>다시 조회</button></div>}
    {!storeId ? <p className="empty-state">매장을 등록하면 빈자리 알림을 확인할 수 있어요.</p> : !current ? <LoadingIndicator label="빈자리 내역을 불러오고 있어요" /> : current.vacancies && <>
      <div className="owner-info"><Icon name="sparkle" /><div><strong>{available > 0 ? `${available}개의 빈자리가 기다리고 있어요` : '발행을 기다리는 빈자리가 없어요'}</strong><p>취소된 시간에 특별한 가격을 더해보세요.<br />이 시간을 기다리던 고객과 만날 수 있어요.</p></div></div>
      <div className="owner-list-heading"><h2>취소 · 노쇼 내역 <span>{alerts.length}</span></h2><button className="icon-button refresh-button" type="button" aria-label="새로고침" title="새로고침" aria-busy={refreshing} disabled={refreshing} onClick={() => setRevision((value) => value + 1)}><Icon name="refresh" size={20} /></button></div>
      <div className="owner-alert-list">
        {alerts.map((alert) => <article className="owner-alert-card" key={alert.id}>
          <div className="owner-alert-top"><span className={`badge ${alert.status === 'DRAFT' ? 'coral' : ''}`}>{alert.reason === 'NO_SHOW' ? '노쇼 접수' : '예약 취소'}</span><time dateTime={alert.occurredAt}>{dateLabel(alert.occurredAt)} {timeLabel(alert.occurredAt)} 접수</time></div>
          <div className="owner-alert-date"><Icon name="calendar" /><span>{dateLabel(alert.availableFrom)} · {timeLabel(alert.availableFrom)} – {timeLabel(alert.availableUntil)}</span></div>
          <h3>{services.find((service) => service.id === alert.originalServiceId)?.name ?? '취소된 시술'}</h3><p>{alert.status === 'PUBLISHED' ? `빈자리가 공개되었어요. · ${alert.instantBooking === false ? '사장님 선택' : '즉시확정'}` : alert.status === 'DRAFT' || alert.status === 'WITHDRAWN' ? '시술·할인 가격·확정 방식을 정해 발행해 주세요.' : statusLabel[alert.status]}</p>
          <div className="owner-alert-bottom"><div><span>기존 예약 정가 </span><strong>{money(alert.originalPrice)}</strong></div>{(alert.status === 'DRAFT' || alert.status === 'WITHDRAWN') && Date.parse(alert.availableUntil) > (current?.receivedAt ?? 0) ? <button className="button small" type="button" onClick={() => setSelected(alert)}><Icon name="bell" />{alert.status === 'WITHDRAWN' ? '다시 발행하기' : '빈자리 알리기'}</button> : <span className="owner-published">{alert.status === 'DRAFT' || alert.status === 'WITHDRAWN' && Date.parse(alert.availableUntil) <= (current?.receivedAt ?? 0) ? '시간 만료' : statusLabel[alert.status]}</span>}</div>
          {alert.status === 'PUBLISHED' && <button className="account-text-button" type="button" onClick={() => { requestKey.current = crypto.randomUUID(); setWithdrawError(''); setWithdrawing(alert) }}>철회 후 조건·확정 방식 변경</button>}
        </article>)}
        {alerts.length === 0 && <div className="empty-state"><Icon name="check" /><h2>취소된 예약이 없어요</h2><p>취소나 노쇼가 생기면 여기에 모아드릴게요.</p></div>}
      </div>
    </>}
    {selected && selected.storeId === storeId && <PublishDialog vacancy={selected} services={services} onPublished={published} onClose={() => { setSelected(null); setRevision((value) => value + 1) }} />}
    {withdrawing && withdrawing.storeId === storeId && <Modal className="owner-dialog" title="빈자리 발행을 철회할까요?" onClose={closeWithdraw}>
      <p className="owner-dialog-date">{dateLabel(withdrawing.availableFrom)} · {timeLabel(withdrawing.availableFrom)} – {timeLabel(withdrawing.availableUntil)}</p>
      <p>철회하면 고객이 이 빈자리를 새로 예약할 수 없어요. 대기 중인 신청은 모두 마감돼요. 이미 예약된 빈자리는 철회할 수 없어요.</p>
      {withdrawError && <p className="owner-form-error" role="alert">{withdrawError}</p>}
      <div className="account-form-actions"><button className="button secondary" disabled={pending} onClick={closeWithdraw}>돌아가기</button><button className="button" disabled={pending} onClick={() => void withdraw()}>{pending ? '철회 중…' : '발행 철회'}</button></div>
    </Modal>}
  </div>
}
