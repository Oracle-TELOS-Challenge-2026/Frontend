import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Icon } from '../../components/Icon'
import { SHOP_CATEGORIES } from '../../data/categories'
import { money } from '../../lib/format'
import type { ShopRegistration } from '../../types'

const steps = ['기본 정보', '대표 시술', '등록 확인']

export function Registration({ onRegister, onCancel, error }: { onRegister: (input: ShopRegistration) => boolean; onCancel: () => void; error: string }) {
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState({ name: '', category: '', address: '', phone: '', service: '', originalPrice: '', duration: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => { heading.current?.focus() }, [step])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const invalidFields = [...event.currentTarget.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select')].filter((field) => !field.validity.valid)
    setErrors(Object.fromEntries(invalidFields.map((field) => [field.name, field.title])))
    if (invalidFields.length) { invalidFields[0].focus(); return }
    const trimmed = { ...draft, name: draft.name.trim(), address: draft.address.trim(), phone: draft.phone.trim(), service: draft.service.trim() }
    setDraft(trimmed)
    if (step < 2) { setStep(step + 1); return }
    onRegister({ ...trimmed, originalPrice: Number(draft.originalPrice), duration: Number(draft.duration) })
  }

  return <div className="page account-page">
    <div className="account-page-top"><span className="eyebrow">사장님으로 시작하기</span><button className="account-text-button" type="button" onClick={onCancel}>등록 취소<Icon name="close" size={16} /></button></div>
    <ol className="registration-steps" aria-label="가게 등록 단계">{steps.map((label, index) => <li key={label} aria-current={step === index ? 'step' : undefined} className={index <= step ? 'active' : ''}><span>{index < step ? <Icon name="check" size={15} /> : index + 1}</span>{label}</li>)}</ol>
    <header className="account-heading">
      <h1 className="page-heading" ref={heading} tabIndex={-1}>{['우리 가게를 소개해 주세요', '대표 시술을 알려주세요', '등록 정보를 확인해 주세요'][step]}</h1>
      <p className="muted">{['가게를 운영하는 데 필요한 기본 정보예요.', '고객에게 소개할 시술 하나부터 시작해요.', '아래 정보로 사장님 화면을 시작할 수 있어요.'][step]}</p>
    </header>
    <form className="account-form" noValidate onSubmit={submit} onChange={(event) => {
      const field = event.target
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) setErrors({ ...errors, [field.name]: '' })
    }}>
      {step === 0 && <>
        <div className="account-field"><label htmlFor="register-name">가게 이름</label><input id="register-name" name="name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required maxLength={60} pattern=".*\S.*" title="가게 이름을 60자 이내로 입력해 주세요." autoComplete="organization" placeholder="예) 빈틈 네일" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'register-name-error' : undefined} />{errors.name && <p className="account-error" id="register-name-error" role="alert">{errors.name}</p>}</div>
        <div className="account-field"><label htmlFor="register-category">업종</label><select id="register-category" name="category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} required title="가게 업종을 선택해 주세요." aria-invalid={Boolean(errors.category)} aria-describedby={errors.category ? 'register-category-error' : undefined}><option value="" disabled>업종을 선택해 주세요</option>{SHOP_CATEGORIES.filter((item) => item.name !== '전체').map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select>{errors.category && <p className="account-error" id="register-category-error" role="alert">{errors.category}</p>}</div>
        <div className="account-field"><label htmlFor="register-address">가게 주소</label><input id="register-address" name="address" value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} required maxLength={200} pattern=".*\S.*" title="가게 주소를 200자 이내로 입력해 주세요." autoComplete="street-address" placeholder="도로명 주소와 상세 주소를 입력해 주세요" aria-invalid={Boolean(errors.address)} aria-describedby={errors.address ? 'register-address-error' : undefined} />{errors.address && <p className="account-error" id="register-address-error" role="alert">{errors.address}</p>}</div>
        <div className="account-field"><label htmlFor="register-phone">가게 연락처</label><input id="register-phone" name="phone" type="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} required maxLength={30} pattern="[\s\-]*0(?:[\s\-]*[0-9]){8,10}[\s\-]*" title="0으로 시작하는 9~11자리 전화번호를 입력해 주세요." autoComplete="tel" placeholder="예) 02-123-4567" aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'register-phone-error register-phone-help' : 'register-phone-help'} />{errors.phone && <p className="account-error" id="register-phone-error" role="alert">{errors.phone}</p>}<small id="register-phone-help">연락 가능한 가게 또는 사장님의 전화번호를 입력해 주세요.</small></div>
      </>}
      {step === 1 && <>
        <div className="account-field"><label htmlFor="register-service">대표 시술</label><input id="register-service" name="service" value={draft.service} onChange={(event) => setDraft({ ...draft, service: event.target.value })} required maxLength={100} pattern=".*\S.*" title="대표 시술을 100자 이내로 입력해 주세요." placeholder="예) 원컬러 젤 네일 · 케어 포함" aria-invalid={Boolean(errors.service)} aria-describedby={errors.service ? 'register-service-error' : undefined} />{errors.service && <p className="account-error" id="register-service-error" role="alert">{errors.service}</p>}</div>
        <div className="account-field"><label htmlFor="register-price">정가 <span>원</span></label><input id="register-price" name="originalPrice" type="number" inputMode="numeric" value={draft.originalPrice} onChange={(event) => setDraft({ ...draft, originalPrice: event.target.value })} required min={1} max={10000000} step={1} title="정가를 1원부터 1,000만 원 사이의 정수로 입력해 주세요." placeholder="예) 50000" aria-invalid={Boolean(errors.originalPrice)} aria-describedby={errors.originalPrice ? 'register-price-error' : undefined} />{errors.originalPrice && <p className="account-error" id="register-price-error" role="alert">{errors.originalPrice}</p>}</div>
        <div className="account-field"><label htmlFor="register-duration">소요 시간 <span>분</span></label><input id="register-duration" name="duration" type="number" inputMode="numeric" value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })} required min={10} max={480} step={1} title="소요 시간을 10분부터 480분 사이의 정수로 입력해 주세요." placeholder="예) 60" aria-invalid={Boolean(errors.duration)} aria-describedby={errors.duration ? 'register-duration-error register-duration-help' : 'register-duration-help'} />{errors.duration && <p className="account-error" id="register-duration-error" role="alert">{errors.duration}</p>}<small id="register-duration-help">10분부터 480분까지 입력할 수 있어요.</small></div>
      </>}
      {step === 2 && <section className="account-card" aria-label="등록할 가게 정보">
        <div className="account-card-heading"><span className="account-avatar"><Icon name="store" /></span><div><p className="eyebrow">{draft.category}</p><h2>{draft.name}</h2></div></div>
        <dl className="account-details"><dt>주소</dt><dd>{draft.address}</dd><dt>연락처</dt><dd>{draft.phone}</dd><dt>대표 시술</dt><dd>{draft.service}</dd><dt>정가</dt><dd>{money(Number(draft.originalPrice))}</dd><dt>소요 시간</dt><dd>{draft.duration}분</dd></dl>
      </section>}
      {error && <p className="account-error" role="alert">{error}</p>}
      <div className="account-form-actions">{step > 0 && <button className="button secondary" type="button" onClick={() => { setErrors({}); setStep(step - 1) }}>이전</button>}<button className="button" type="submit">{step === 2 ? '가게 등록하고 시작하기' : '다음'}<Icon name={step === 2 ? 'check' : 'chevron-right'} size={18} /></button></div>
      <p className="account-footnote">마지막 단계에서 등록할 때 이 브라우저에 저장돼요.<br />실제 고객에게 가게가 공개되지는 않아요.</p>
    </form>
  </div>
}
