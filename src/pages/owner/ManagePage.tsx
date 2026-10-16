import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Modal } from '../../components/Modal'
import { OpeningHours } from '../../components/owner/OpeningHours'
import { BackendApiError } from '../../lib/backend-api'
import { readStoreServices } from '../../lib/customer-api'
import { createOwnerService, readOwnerStoreSettings, updateOwnerService, updateOwnerStore } from '../../lib/owner-api'
import type { OwnerStoreSettings } from '../../lib/owner-api'
import { money } from '../../lib/format'
import type { RegisteredShop, StoreService } from '../../types'

function StoreSettingsForm({ settings, onSaved, onReload }: { settings: OwnerStoreSettings; onSaved: (settings: OwnerStoreSettings) => void; onReload: () => void }) {
  const [description, setDescription] = useState(settings.description)
  const [openingHours, setOpeningHours] = useState(settings.openingHours)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const busy = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    try { onSaved(await updateOwnerStore({ ...settings, description, openingHours })) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '매장 정보를 저장하지 못했어요.') }
    finally { busy.current = false; setPending(false) }
  }

  return <form className="account-form" onSubmit={submit}>
    <fieldset className="owner-manage-fields" disabled={pending}>
      <legend className="owner-manage-title">매장 운영 정보</legend>
      <label className="account-field" htmlFor="store-description">매장 소개<textarea id="store-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={4} placeholder="우리 매장과 시술의 특징을 알려주세요." /></label>
      <OpeningHours value={openingHours} onChange={setOpeningHours} />
      {error && <p className="account-error" role="alert">{error}</p>}
      <button className="button" type="submit">{pending ? '저장 중…' : '운영 정보 저장'}</button>
      {error && <button className="account-text-button" type="button" onClick={onReload}>입력을 초기화하고 최신 정보 조회</button>}
    </fieldset>
  </form>
}

function ServiceDialog({ storeId, service, onSaved, onClose }: { storeId: string; service: StoreService | null; onSaved: (service: StoreService) => void; onClose: () => void }) {
  const [name, setName] = useState(service?.name ?? '')
  const [price, setPrice] = useState(service ? String(service.basePrice) : '')
  const [duration, setDuration] = useState(service ? String(service.durationMinutes) : '')
  const [active, setActive] = useState(service?.active ?? true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const [request, setRequest] = useState<{ key: string; input: { name: string; basePrice: number; durationMinutes: number; active: boolean } } | null>(null)
  const locked = pending || request !== null

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError('')
    try {
      const input = { name, basePrice: Number(price), durationMinutes: Number(duration), active }
      if (service) onSaved(await updateOwnerService(storeId, service, input))
      else {
        const operation = request ?? { key: crypto.randomUUID(), input }
        setRequest(operation)
        onSaved(await createOwnerService(storeId, operation.input, operation.key))
      }
    } catch (cause) {
      if (!(cause instanceof BackendApiError) || (cause.status >= 400 && cause.status < 500 && cause.status !== 409)) setRequest(null)
      setError(cause instanceof Error ? cause.message : '시술 정보를 저장하지 못했어요.')
    } finally { busy.current = false; setPending(false) }
  }

  return <Modal className="owner-dialog" title={service ? '시술 정보 수정' : '시술 추가'} onClose={() => { if (!busy.current) onClose() }}>
    <form className="account-form" onSubmit={submit}>
      <fieldset className="owner-manage-fields" disabled={locked}>
        <label className="account-field" htmlFor="manage-service-name">시술 이름<input id="manage-service-name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} pattern=".*\S.*" /></label>
        <label className="account-field" htmlFor="manage-service-price">정가 (원)<input id="manage-service-price" type="number" inputMode="numeric" min={0} max={10000000} step={1} value={price} onChange={(event) => setPrice(event.target.value)} required /></label>
        <label className="account-field" htmlFor="manage-service-duration">소요 시간 (분)<input id="manage-service-duration" type="number" inputMode="numeric" min={15} max={480} step={5} value={duration} onChange={(event) => setDuration(event.target.value)} required readOnly={Boolean(service)} /><small>{service ? '소요 시간을 바꾸려면 새 시술을 등록해 주세요.' : '15~480분 사이에서 5분 단위로 입력해 주세요.'}</small></label>
        <label className="owner-service-active"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />고객에게 제공 중인 시술</label>
      </fieldset>
      {service && <p className="muted">가격과 제공 여부를 바꿔도 기존 예약의 가격은 유지돼요.</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
      {error && request && <p className="muted">등록 결과를 확인하지 못했어요. 같은 정보로 다시 시도하거나 닫고 목록을 확인해 주세요.</p>}
      <button className="button" type="submit" disabled={pending}>{pending ? '저장 중…' : error && request ? '같은 정보로 다시 시도' : service ? '시술 정보 저장' : '시술 추가'}</button>
    </form>
  </Modal>
}

export function OwnerManage({ ownerShop, onChanged }: { ownerShop: RegisteredShop | null; onChanged: () => void }) {
  const storeId = ownerShop?.id
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ key: string; settings?: OwnerStoreSettings; services?: StoreService[]; error?: string } | null>(null)
  const [editing, setEditing] = useState<StoreService | 'new' | null>(null)
  const [notice, setNotice] = useState('')
  const key = `${storeId}:${revision}`
  const current = result?.key === key ? result : null

  useEffect(() => {
    if (!storeId) return
    const controller = new AbortController()
    Promise.all([readOwnerStoreSettings(storeId, controller.signal), readStoreServices(storeId, controller.signal)]).then(([settings, services]) => {
      if (!controller.signal.aborted) setResult({ key, settings, services })
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setResult({ key, error: cause instanceof Error ? cause.message : '매장 정보를 불러오지 못했어요.' })
    })
    return () => controller.abort()
  }, [storeId, key])

  function reload() { setEditing(null); setRevision((value) => value + 1) }

  return <div className="page account-page owner-manage">
    <Link className="account-text-button" to="/owner/profile">마이페이지로</Link>
    <header className="account-heading"><p className="eyebrow">{ownerShop?.name ?? '내 가게'}</p><h1 className="page-heading">매장 · 시술 관리</h1><p className="muted">영업시간과 제공하는 시술을 최신 정보로 관리해 주세요.</p></header>
    {notice && <p className="customer-note" role="status">{notice}</p>}
    {!storeId ? <p>등록한 매장이 없어요.</p> : !current ? <p role="status">매장 정보를 불러오는 중이에요.</p> : current.error ? <div role="alert"><p>{current.error}</p><button className="button secondary" onClick={reload}>다시 조회</button></div> : current.settings && current.services && <>
      <StoreSettingsForm key={`${key}:${current.settings.version}`} settings={current.settings} onReload={reload} onSaved={(settings) => {
        setResult((previous) => previous?.key === key ? { ...previous, settings } : previous); setNotice('매장 운영 정보를 저장했어요.'); onChanged()
      }} />
      <section className="owner-services">
        <div className="owner-list-heading"><h2>등록한 시술</h2><button className="button small" onClick={() => { setNotice(''); setEditing('new') }}>시술 추가</button></div>
        <ul className="owner-service-list">{current.services.map((service) => <li key={service.id}><div><strong>{service.name}</strong><p>{service.durationMinutes}분 · {money(service.basePrice)} · {service.active ? '제공 중' : '제공 중지'}</p></div><button className="button secondary small" onClick={() => { setNotice(''); setEditing(service) }}>수정<span className="sr-only">: {service.name}</span></button></li>)}</ul>
        {!current.services.length && <p className="muted">시술을 추가하면 예약 시간을 등록할 수 있어요.</p>}
      </section>
      {editing && <ServiceDialog key={editing === 'new' ? 'new' : editing.id} storeId={storeId} service={editing === 'new' ? null : editing} onClose={reload} onSaved={(service) => {
        setResult((previous) => previous?.key === key && previous.services ? { ...previous, services: previous.services.some((item) => item.id === service.id) ? previous.services.map((item) => item.id === service.id ? service : item) : [...previous.services, service] } : previous)
        setEditing(null); setNotice('시술 정보를 저장했어요.'); onChanged()
      }} />}
    </>}
  </div>
}
