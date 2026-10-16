import { Fragment, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '../../components/Icon'
import { OpeningHours } from '../../components/owner/OpeningHours'
import { searchRoadAddresses } from '../../lib/kakao-map'
import type { RoadAddress } from '../../lib/kakao-map'
import { SHOP_CATEGORIES } from '../../data/categories'
import { money } from '../../lib/format'
import { WEEK_DAYS, validOpeningHours, validateShopRegistration } from '../../lib/account'
import type { RegisteredShop, ShopRegistration } from '../../types'

const steps = ['기본 정보', '대표 시술', '등록 확인']

export function Registration({ shop, onRegister, onCancel, error }: { shop?: RegisteredShop | null; onRegister: (input: ShopRegistration) => Promise<boolean>; onCancel: () => void; error: string }) {
  const [step, setStep] = useState(shop ? 1 : 0)
  const [draft, setDraft] = useState({ name: shop?.name ?? '', description: shop?.description ?? '', category: shop?.category ?? '', address: shop?.address ?? '', service: '', originalPrice: '', duration: '' })
  const [openingHours, setOpeningHours] = useState<ShopRegistration['openingHours']>(shop?.openingHours ?? WEEK_DAYS.map((dayOfWeek) => ({ dayOfWeek, opensAt: '', closesAt: '', closed: false })))
  const [submitting, setSubmitting] = useState(false)
  const [searching, setSearching] = useState(false)
  const [addresses, setAddresses] = useState<RoadAddress[]>([])
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(shop ? { latitude: shop.latitude, longitude: shop.longitude } : null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => { heading.current?.focus() }, [step])

  async function searchAddress() {
    if (searching) return
    setSearching(true)
    setAddresses([])
    setLocation(null)
    setErrors((value) => ({ ...value, address: '' }))
    try {
      const results = await searchRoadAddresses(draft.address, import.meta.env.VITE_KAKAO_MAP_APP_KEY?.trim() ?? '')
      setAddresses(results)
      if (!results.length) setErrors((value) => ({ ...value, address: '도로명주소를 찾지 못했어요. 도로명과 건물번호를 확인해 주세요.' }))
    } catch (cause) {
      setErrors((value) => ({ ...value, address: cause instanceof Error ? cause.message : '주소를 검색하지 못했어요.' }))
    } finally { setSearching(false) }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || searching) return
    const invalidFields = [...event.currentTarget.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')].filter((field) => !field.validity.valid)
    setErrors(Object.fromEntries(invalidFields.map((field) => [field.name, field.title])))
    if (invalidFields.length) { invalidFields[0].focus(); return }
    const trimmed = { ...draft, name: draft.name.trim(), description: draft.description.trim(), address: draft.address.trim(), service: draft.service.trim() }
    setDraft(trimmed)
    if (!location) { setErrors({ address: '주소를 검색한 뒤 결과에서 가게 주소를 선택해 주세요.' }); document.getElementById('register-address')?.focus(); return }
    if (step === 0 && !validOpeningHours(openingHours)) { setErrors({ hours: '영업일의 시작·종료 시간을 모두 설정해 주세요. 종료 시간은 시작보다 늦어야 해요.' }); return }
    if (step < 2) { setStep(step + 1); return }
    const input = { ...trimmed, ...location, openingHours, originalPrice: Number(draft.originalPrice), duration: Number(draft.duration) }
    const problem = validateShopRegistration(input)
    if (problem) { setErrors({ form: problem }); return }
    setSubmitting(true)
    try { await onRegister(input) } finally { setSubmitting(false) }
  }

  return <div className="page account-page">
    <div className="account-page-top"><span className="eyebrow">사장님으로 시작하기</span><button className="account-text-button" type="button" onClick={onCancel} disabled={submitting}>등록 취소<Icon name="close" size={16} /></button></div>
    <ol className="registration-steps" aria-label="가게 등록 단계">{steps.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={index <= step ? 'active' : ''}><span>{index < step ? <Icon name="check" size={15} /> : index + 1}</span>{label}</li>)}</ol>
    <header className="account-heading">
      <h1 className="page-heading" ref={heading} tabIndex={-1}>{['우리 가게를 소개해 주세요', '대표 시술을 알려주세요', '등록 정보를 확인해 주세요'][step]}</h1>
      <p className="muted">{['가게를 운영하는 데 필요한 기본 정보예요.', '고객에게 소개할 시술 하나부터 시작해요.', '아래 정보로 사장님 화면을 시작할 수 있어요.'][step]}</p>
    </header>
    <form className="account-form" noValidate onSubmit={submit} onChange={(event) => {
      const field = event.target
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) setErrors({ ...errors, [field.name]: '' })
    }}>
      {step === 0 && <>
        <div className="account-field"><label htmlFor="register-name">가게 이름</label><input id="register-name" name="name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required maxLength={100} pattern=".*\S.*" title="가게 이름을 100자 이내로 입력해 주세요." autoComplete="organization" placeholder="예) 빈틈 네일" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'register-name-error' : undefined} />{errors.name && <p className="account-error" id="register-name-error" role="alert">{errors.name}</p>}</div>
        <div className="account-field"><label htmlFor="register-category">업종</label><select id="register-category" name="category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} required title="가게 업종을 선택해 주세요." aria-invalid={Boolean(errors.category)} aria-describedby={errors.category ? 'register-category-error' : undefined}><option value="" disabled>업종을 선택해 주세요</option>{SHOP_CATEGORIES.filter((item) => item.name !== '전체').map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select>{errors.category && <p className="account-error" id="register-category-error" role="alert">{errors.category}</p>}</div>
        <div className="account-field">
          <label htmlFor="register-address">가게 도로명주소</label>
          <div className="registration-address-search"><input id="register-address" name="address" value={draft.address} disabled={searching} onChange={(event) => { setDraft({ ...draft, address: event.target.value }); setLocation(null); setAddresses([]) }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void searchAddress() } }} required maxLength={300} pattern=".*\S.*" title="도로명과 건물번호를 입력해 주세요." autoComplete="street-address" placeholder="예) 서울 중구 세종대로 110" aria-invalid={Boolean(errors.address)} aria-describedby="register-address-help register-address-error" /><button className="button secondary" type="button" disabled={searching || !draft.address.trim()} onClick={() => void searchAddress()}>{searching ? '검색 중…' : '주소 검색'}</button></div>
          <small id="register-address-help">도로명과 건물번호로 검색하고 주소를 선택해 주세요.</small>
          {addresses.length > 0 && <ul className="registration-address-results" aria-label="주소 검색 결과">{addresses.map((address, index) => <li key={`${address.address}-${index}`}><button type="button" onClick={() => { setDraft({ ...draft, address: address.address }); setLocation({ latitude: address.latitude, longitude: address.longitude }); setAddresses([]); setErrors((value) => ({ ...value, address: '' })) }}><Icon name="pin" size={18} /><span>{address.address}</span><Icon name="chevron-right" size={16} /></button></li>)}</ul>}
          {location && <small className="registration-address-confirmed" role="status"><Icon name="check" size={14} />주소가 확인됐어요.</small>}
          <p className="account-error" id="register-address-error" role={errors.address ? 'alert' : undefined}>{errors.address}</p>
        </div>
        <div className="account-field"><label htmlFor="register-description">가게 설명 <span>선택</span></label><textarea id="register-description" name="description" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={1000} title="가게 설명을 1,000자 이내로 입력해 주세요." placeholder="가게의 분위기와 잘하는 시술, 방문 전 알아두면 좋은 점을 소개해 주세요." aria-describedby="register-description-help" /><small id="register-description-help">고객에게 가게 상세에서 보여요. {draft.description.length}/1,000자</small></div>
        <OpeningHours value={openingHours} onChange={(value) => { setOpeningHours(value); setErrors((previous) => ({ ...previous, hours: '' })) }} error={errors.hours} />

      </>}
      {step === 1 && <>
        <div className="account-field"><label htmlFor="register-service">대표 시술</label><input id="register-service" name="service" value={draft.service} onChange={(event) => setDraft({ ...draft, service: event.target.value })} required maxLength={100} pattern=".*\S.*" title="대표 시술을 100자 이내로 입력해 주세요." placeholder="예) 원컬러 젤 네일 · 케어 포함" aria-invalid={Boolean(errors.service)} aria-describedby={errors.service ? 'register-service-error' : undefined} />{errors.service && <p className="account-error" id="register-service-error" role="alert">{errors.service}</p>}</div>
        <div className="account-field"><label htmlFor="register-price">정가 <span>원</span></label><input id="register-price" name="originalPrice" type="number" inputMode="numeric" value={draft.originalPrice} onChange={(event) => setDraft({ ...draft, originalPrice: event.target.value })} required min={0} max={10000000} step={1} title="정가를 0원부터 1,000만 원 사이의 정수로 입력해 주세요." placeholder="예) 50000" aria-invalid={Boolean(errors.originalPrice)} aria-describedby={errors.originalPrice ? 'register-price-error' : undefined} />{errors.originalPrice && <p className="account-error" id="register-price-error" role="alert">{errors.originalPrice}</p>}</div>
        <div className="account-field"><label htmlFor="register-duration">소요 시간 <span>분</span></label><input id="register-duration" name="duration" type="number" inputMode="numeric" value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })} required min={15} max={480} step={5} title="소요 시간을 15분부터 480분 사이의 5분 단위로 입력해 주세요." placeholder="예) 60" aria-invalid={Boolean(errors.duration)} aria-describedby={errors.duration ? 'register-duration-error register-duration-help' : 'register-duration-help'} />{errors.duration && <p className="account-error" id="register-duration-error" role="alert">{errors.duration}</p>}<small id="register-duration-help">15분부터 480분까지 5분 단위로 입력해 주세요.</small></div>
      </>}
      {step === 2 && <section className="account-card" aria-label="등록할 가게 정보">
        <div className="account-card-heading"><span className="account-avatar"><Icon name="store" /></span><div><p className="eyebrow">{draft.category}</p><h2>{draft.name}</h2></div></div>
        <dl className="account-details"><dt>주소</dt><dd>{draft.address}</dd><dt>가게 설명</dt><dd className="account-preference-copy">{draft.description || '입력하지 않음'}</dd><dt>대표 시술</dt><dd>{draft.service}</dd><dt>정가</dt><dd>{money(Number(draft.originalPrice))}</dd><dt>소요 시간</dt><dd>{draft.duration}분</dd></dl><dl className="account-details">{openingHours.map((day, index) => <Fragment key={day.dayOfWeek}><dt>{['월', '화', '수', '목', '금', '토', '일'][index]}요일</dt><dd>{day.closed ? '휴무' : `${day.opensAt} ~ ${day.closesAt}`}</dd></Fragment>)}</dl>
      </section>}
      {errors.form && <p className="account-error" role="alert">{errors.form}</p>}
      {error && <p className="account-error" role="alert">{error}</p>}
      <div className="account-form-actions">{step > (shop ? 1 : 0) && <button className="button secondary" type="button" disabled={submitting} onClick={() => { setErrors({}); setStep(step - 1) }}>이전</button>}<button className="button" type="submit" disabled={submitting || searching}>{submitting ? '등록 중…' : step === 2 ? '가게 등록하고 시작하기' : '다음'}<Icon name={step === 2 ? 'check' : 'chevron-right'} size={18} /></button></div>
      <p className="account-footnote">등록한 가게와 시술은 서버에 저장되고 고객이 조회할 수 있어요.</p>
    </form>
  </div>
}
